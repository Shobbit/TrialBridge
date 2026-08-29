/**
 * Server-side fetch wrapper for ClinicalTrials.gov.
 *
 * All browser traffic is proxied through our own route handlers rather than
 * calling clinicaltrials.gov directly. Verified behaviour that motivates this:
 * the service answers simple GETs with `access-control-allow-origin: *`, but
 * rejects CORS preflight `OPTIONS` with 403. Proxying removes that constraint
 * entirely, lets us cache, and keeps rate-limit handling in one place.
 *
 * No API key exists for this service, so there are no secrets involved.
 */

export class UpstreamError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "UpstreamError";
  }
}

const DEFAULT_TIMEOUT_MS = 15_000;

/** Identifies this app to the upstream service, per its usage guidance. */
const USER_AGENT = "TrialBridge/1.0 (+https://github.com/trialbridge/trialbridge)";

export interface FetchJsonOptions {
  timeoutMs?: number;
  /** Seconds to cache in Next's data cache. 0 disables caching. */
  revalidateSeconds?: number;
}

/**
 * Fetches and parses JSON, translating transport and HTTP failures into an
 * `UpstreamError` carrying a status the route handler can pass through.
 */
export async function fetchUpstreamJson(
  url: string,
  { timeoutMs = DEFAULT_TIMEOUT_MS, revalidateSeconds = 300 }: FetchJsonOptions = {},
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json", "User-Agent": USER_AGENT },
      next: revalidateSeconds > 0 ? { revalidate: revalidateSeconds } : { revalidate: 0 },
    });
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError";
    throw new UpstreamError(
      aborted
        ? "ClinicalTrials.gov did not respond in time. Please try again."
        : "Could not reach ClinicalTrials.gov. Check your connection and try again.",
      504,
      true,
    );
  } finally {
    clearTimeout(timer);
  }

  if (response.status === 429) {
    throw new UpstreamError(
      "ClinicalTrials.gov is rate limiting requests. Please wait a moment and try again.",
      429,
      true,
    );
  }

  if (response.status === 400) {
    throw new UpstreamError(
      "ClinicalTrials.gov rejected the search terms. Try simplifying the condition or keywords.",
      400,
      false,
    );
  }

  if (response.status === 404) {
    throw new UpstreamError("No matching record was found on ClinicalTrials.gov.", 404, false);
  }

  if (!response.ok) {
    throw new UpstreamError(
      `ClinicalTrials.gov returned an unexpected error (HTTP ${response.status}).`,
      response.status >= 500 ? 502 : response.status,
      response.status >= 500,
    );
  }

  try {
    return await response.json();
  } catch {
    throw new UpstreamError("ClinicalTrials.gov returned a response that could not be parsed.", 502, true);
  }
}
