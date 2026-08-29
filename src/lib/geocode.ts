import { UpstreamError } from "./ctgov/fetch";

/**
 * Place-name to coordinate resolution, used only to build the
 * `filter.geo=distance(...)` parameter and to measure straight-line distance
 * to study sites.
 *
 * Defaults to OpenStreetMap Nominatim: free, keyless, and covered by the ODbL.
 *
 * ---------------------------------------------------------------------------
 * Compliance with the Nominatim Usage Policy
 * https://operations.osmfoundation.org/policies/nominatim/
 * ---------------------------------------------------------------------------
 *  - "Absolute maximum of 1 request per second"  → every upstream call passes
 *    through `scheduleUpstreamCall`, which serialises requests and enforces a
 *    minimum gap. Cache hits never reach the network and are not throttled.
 *  - "Provide a valid HTTP Referer or User-Agent identifying the application"
 *    → `USER_AGENT` below, overridable so a deployment can add its own contact
 *    address (which the policy encourages).
 *  - "Results must be cached on your side"  → an in-process cache with a 30-day
 *    TTL, plus Next's own data cache. City coordinates effectively never move,
 *    so a long TTL is both safe and a large reduction in traffic.
 *  - "Apps must make sure that they can switch the service at our request at any
 *    time ... without requiring a software update"  → the endpoint is read from
 *    `GEOCODER_URL` at request time. Any Nominatim-compatible endpoint works by
 *    changing one environment variable and restarting.
 *  - "You must not implement [autocomplete] on the client side using the API"
 *    → this function is called only from the search route, once per explicit
 *    search submission. Nothing geocodes as the user types.
 *  - "Please do not submit personal data or other confidential material"  → only
 *    city, state and country are ever sent. Never a street address, postcode,
 *    age, sex, condition, or anything else from the health profile.
 */

export interface GeocodeResult {
  label: string;
  lat: number;
  lon: number;
}

/** Public Nominatim endpoint, used when `GEOCODER_URL` is not set. */
const DEFAULT_GEOCODER_URL = "https://nominatim.openstreetmap.org/search";

/**
 * Endpoint and identity are read per call rather than captured at module load,
 * so an operator can repoint the app at another Nominatim-compatible service
 * (or a self-hosted instance) without a code change.
 */
function geocoderUrl(): string {
  return process.env.GEOCODER_URL?.trim() || DEFAULT_GEOCODER_URL;
}

function userAgent(): string {
  return (
    process.env.GEOCODER_USER_AGENT?.trim() ||
    "TrialBridge/1.0 (clinical trial discovery; +https://github.com/trialbridge/trialbridge)"
  );
}

/** True when the configured endpoint is the shared OSMF-run service. */
export function usingPublicNominatim(): boolean {
  return geocoderUrl().includes("nominatim.openstreetmap.org");
}

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

interface CacheEntry {
  value: GeocodeResult | null;
  expiresAt: number;
}

/** Settlement coordinates are stable, so this TTL is deliberately long. */
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const CACHE_MAX_ENTRIES = 500;

const cache = new Map<string, CacheEntry>();

function cacheGet(key: string): CacheEntry | undefined {
  const hit = cache.get(key);
  if (!hit) return undefined;
  if (hit.expiresAt < Date.now()) {
    cache.delete(key);
    return undefined;
  }
  // Refresh insertion order so the eviction below is least-recently-used.
  cache.delete(key);
  cache.set(key, hit);
  return hit;
}

function cacheSet(key: string, value: GeocodeResult | null): void {
  if (cache.size >= CACHE_MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
}

/** Exposed for tests. */
export function __clearGeocodeCache(): void {
  cache.clear();
}

// ---------------------------------------------------------------------------
// Rate limiting
// ---------------------------------------------------------------------------

/**
 * 1100ms rather than exactly 1000ms, so ordinary clock jitter cannot push two
 * requests into the same second at the far end.
 */
const MIN_REQUEST_INTERVAL_MS = 1_100;

/** Tail of the serialised request chain. Every call awaits its predecessor. */
let queueTail: Promise<unknown> = Promise.resolve();
let lastRequestStartedAt = 0;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Runs `task` such that no two upstream calls begin less than
 * `MIN_REQUEST_INTERVAL_MS` apart, process-wide.
 *
 * Note this bounds a single Node process. A horizontally scaled deployment must
 * either self-host Nominatim or use a shared limiter — see README.
 */
function scheduleUpstreamCall<T>(task: () => Promise<T>): Promise<T> {
  const run = queueTail.then(async () => {
    const waitFor = lastRequestStartedAt + MIN_REQUEST_INTERVAL_MS - Date.now();
    if (waitFor > 0) await sleep(waitFor);
    lastRequestStartedAt = Date.now();
    return task();
  });
  // Keep the chain alive even if this task rejects.
  queueTail = run.catch(() => undefined);
  return run;
}

// ---------------------------------------------------------------------------

/**
 * Resolves a coarse place description to coordinates.
 *
 * @returns null when the place cannot be resolved. Callers must treat this as
 *          "distance filtering unavailable" and degrade gracefully, never as
 *          an error that blocks the search.
 */
export async function geocodePlace(parts: {
  city?: string | null;
  state?: string | null;
  country?: string | null;
}): Promise<GeocodeResult | null> {
  const query = [parts.city, parts.state, parts.country]
    .map((p) => p?.trim())
    .filter((p): p is string => Boolean(p))
    .join(", ");

  if (!query) return null;

  const key = query.toLowerCase();
  const cached = cacheGet(key);
  // Negative results are cached too, so a typo cannot be used to hammer the
  // upstream service by repeating the same failing search.
  if (cached) return cached.value;

  const url = new URL(geocoderUrl());
  url.searchParams.set("q", query);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "1");
  url.searchParams.set("addressdetails", "0");

  const result = await scheduleUpstreamCall(async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    try {
      const response = await fetch(url.toString(), {
        signal: controller.signal,
        headers: { Accept: "application/json", "User-Agent": userAgent() },
        next: { revalidate: 2_592_000 },
      });
      if (!response.ok) return null;

      const data: unknown = await response.json();
      if (!Array.isArray(data) || data.length === 0) return null;

      const first = data[0] as Record<string, unknown>;
      const lat = Number(first.lat);
      const lon = Number(first.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

      return {
        label: typeof first.display_name === "string" ? first.display_name : query,
        lat,
        lon,
      } satisfies GeocodeResult;
    } catch {
      // Geocoding is a best-effort enhancement; never fail the search over it.
      return null;
    } finally {
      clearTimeout(timer);
    }
  });

  cacheSet(key, result);
  return result;
}

export { UpstreamError };
