import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __clearGeocodeCache, geocodePlace, usingPublicNominatim } from "@/lib/geocode";

/**
 * Guards the Nominatim Usage Policy commitments documented in
 * `src/lib/geocode.ts`. These are external obligations, not internal
 * preferences, so they are asserted rather than left to review.
 *
 * https://operations.osmfoundation.org/policies/nominatim/
 */

function okResponse(lat = "41.87", lon = "-87.62", display = "Chicago, Illinois, United States") {
  return {
    ok: true,
    status: 200,
    json: async () => [{ lat, lon, display_name: display }],
  };
}

beforeEach(() => {
  __clearGeocodeCache();
  delete process.env.GEOCODER_URL;
  delete process.env.GEOCODER_USER_AGENT;
});

afterEach(() => {
  vi.useRealTimers();
});

describe("identification (User-Agent)", () => {
  it("sends a non-default User-Agent identifying the application", async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse());
    vi.stubGlobal("fetch", fetchMock);

    await geocodePlace({ city: "Chicago", state: "Illinois" });

    const init = fetchMock.mock.calls[0][1] as { headers: Record<string, string> };
    expect(init.headers["User-Agent"]).toMatch(/TrialBridge/);
    // The policy explicitly rejects stock library User-Agents.
    expect(init.headers["User-Agent"]).not.toMatch(/^(node|undici|axios|curl)/i);
  });

  it("lets a deployment supply its own contact address without a code change", async () => {
    process.env.GEOCODER_USER_AGENT = "MyDeployment/2.0 (+mailto:ops@example.org)";
    const fetchMock = vi.fn().mockResolvedValue(okResponse());
    vi.stubGlobal("fetch", fetchMock);

    await geocodePlace({ city: "Chicago" });

    const init = fetchMock.mock.calls[0][1] as { headers: Record<string, string> };
    expect(init.headers["User-Agent"]).toBe("MyDeployment/2.0 (+mailto:ops@example.org)");
  });
});

describe("provider replacement without a software update", () => {
  it("defaults to the public Nominatim endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse());
    vi.stubGlobal("fetch", fetchMock);

    await geocodePlace({ city: "Chicago" });

    expect(String(fetchMock.mock.calls[0][0])).toContain("nominatim.openstreetmap.org");
    expect(usingPublicNominatim()).toBe(true);
  });

  it("switches endpoint entirely via GEOCODER_URL", async () => {
    process.env.GEOCODER_URL = "https://geocoder.internal.example.org/search";
    const fetchMock = vi.fn().mockResolvedValue(okResponse());
    vi.stubGlobal("fetch", fetchMock);

    await geocodePlace({ city: "Chicago" });

    const called = String(fetchMock.mock.calls[0][0]);
    expect(called).toContain("geocoder.internal.example.org");
    expect(called).not.toContain("openstreetmap.org");
    expect(usingPublicNominatim()).toBe(false);
  });
});

describe("caching", () => {
  it("does not call upstream twice for the same place", async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse());
    vi.stubGlobal("fetch", fetchMock);

    const a = await geocodePlace({ city: "Chicago", state: "Illinois" });
    const b = await geocodePlace({ city: "Chicago", state: "Illinois" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(b).toEqual(a);
  });

  it("treats the cache key case-insensitively", async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse());
    vi.stubGlobal("fetch", fetchMock);

    await geocodePlace({ city: "Chicago", state: "Illinois" });
    await geocodePlace({ city: "CHICAGO", state: "illinois" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("caches misses too, so a repeated bad query cannot hammer upstream", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => [] });
    vi.stubGlobal("fetch", fetchMock);

    expect(await geocodePlace({ city: "Zzzqqxxnowhere" })).toBeNull();
    expect(await geocodePlace({ city: "Zzzqqxxnowhere" })).toBeNull();

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("also asks Next to cache the response", async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse());
    vi.stubGlobal("fetch", fetchMock);

    await geocodePlace({ city: "Chicago" });

    const init = fetchMock.mock.calls[0][1] as { next: { revalidate: number } };
    expect(init.next.revalidate).toBeGreaterThan(0);
  });
});

describe("rate limiting (absolute maximum 1 request per second)", () => {
  it("spaces concurrent upstream calls at least one second apart", async () => {
    const startTimes: number[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        startTimes.push(Date.now());
        return okResponse();
      }),
    );

    // Three *different* places, so none can be served from cache.
    await Promise.all([
      geocodePlace({ city: "Chicago" }),
      geocodePlace({ city: "Boston" }),
      geocodePlace({ city: "Denver" }),
    ]);

    expect(startTimes).toHaveLength(3);
    for (let i = 1; i < startTimes.length; i++) {
      expect(
        startTimes[i] - startTimes[i - 1],
        `gap between request ${i} and ${i + 1}`,
      ).toBeGreaterThanOrEqual(1000);
    }
  }, 15_000);

  it("keeps the queue alive after a failed request", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("network down"))
      .mockResolvedValue(okResponse());
    vi.stubGlobal("fetch", fetchMock);

    expect(await geocodePlace({ city: "Chicago" })).toBeNull();
    // A later call must still be served rather than deadlocked behind the failure.
    expect(await geocodePlace({ city: "Boston" })).not.toBeNull();
  }, 15_000);

  it("serves cache hits without waiting on the rate limiter", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(okResponse()));

    await geocodePlace({ city: "Chicago" });
    const startedAt = Date.now();
    for (let i = 0; i < 5; i++) await geocodePlace({ city: "Chicago" });

    expect(Date.now() - startedAt).toBeLessThan(200);
  });
});

describe("no personal or confidential data is sent", () => {
  it("sends only city, state and country", async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse());
    vi.stubGlobal("fetch", fetchMock);

    await geocodePlace({ city: "Chicago", state: "Illinois", country: "United States" });

    const url = new URL(String(fetchMock.mock.calls[0][0]));
    expect(url.searchParams.get("q")).toBe("Chicago, Illinois, United States");
    // Nothing from the health profile may ever appear in the query string.
    for (const forbidden of ["age", "sex", "condition", "melanoma", "diabetes", "54"]) {
      expect(url.toString().toLowerCase()).not.toContain(forbidden);
    }
    // And no address-level detail is requested back.
    expect(url.searchParams.get("addressdetails")).toBe("0");
  });

  it("makes no request at all when no place was entered", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    expect(await geocodePlace({ city: "", state: null, country: undefined })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
