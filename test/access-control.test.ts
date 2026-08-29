import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { proxy } from "@/proxy";

/**
 * The private-beta gate.
 *
 * These assertions matter because the failure mode is silent: a broken gate
 * looks exactly like a working site to whoever is testing it.
 */

const ORIGIN = "https://trialbridge.example.app";

function request(path = "/", credentials?: string): Request {
  const headers = new Headers();
  if (credentials) {
    headers.set("authorization", `Basic ${Buffer.from(credentials, "utf8").toString("base64")}`);
  }
  return new Request(`${ORIGIN}${path}`, { headers });
}

/** NextResponse.next() has no status 401; treat anything else as "allowed". */
const allowed = (r: { status: number }) => r.status !== 401;

beforeEach(() => {
  delete process.env.SITE_PASSWORD;
  delete process.env.SITE_USERNAME;
});

afterEach(() => {
  delete process.env.SITE_PASSWORD;
  delete process.env.SITE_USERNAME;
});

describe("gate disabled (no SITE_PASSWORD)", () => {
  it("allows everything, so local development is never blocked", () => {
    expect(allowed(proxy(request("/")))).toBe(true);
    expect(allowed(proxy(request("/api/trials/search")))).toBe(true);
  });
});

describe("gate enabled", () => {
  beforeEach(() => {
    process.env.SITE_PASSWORD = "correct-horse-battery-staple";
  });

  it("refuses a request with no credentials", () => {
    const response = proxy(request("/"));
    expect(response.status).toBe(401);
    expect(response.headers.get("WWW-Authenticate")).toMatch(/^Basic realm=/);
  });

  it("refuses a wrong password", () => {
    expect(proxy(request("/", "beta:wrong")).status).toBe(401);
  });

  it("refuses a wrong username", () => {
    expect(proxy(request("/", "someoneelse:correct-horse-battery-staple")).status).toBe(401);
  });

  it("accepts the correct credentials", () => {
    expect(allowed(proxy(request("/", "beta:correct-horse-battery-staple")))).toBe(true);
  });

  it("honours a custom username", () => {
    process.env.SITE_USERNAME = "beta-tester";
    expect(proxy(request("/", "beta:correct-horse-battery-staple")).status).toBe(401);
    expect(allowed(proxy(request("/", "beta-tester:correct-horse-battery-staple")))).toBe(true);
  });

  it("supports passwords containing colons", () => {
    process.env.SITE_PASSWORD = "a:b:c";
    expect(allowed(proxy(request("/", "beta:a:b:c")))).toBe(true);
  });

  it("protects the API routes, not just pages", () => {
    expect(proxy(request("/api/trials/search")).status).toBe(401);
    expect(proxy(request("/api/trials/NCT00000001")).status).toBe(401);
  });

  it("protects the JavaScript bundles, so the source is not readable", () => {
    expect(proxy(request("/_next/static/chunks/main.js")).status).toBe(401);
  });

  it("still serves robots.txt, so crawlers can read the disallow", () => {
    expect(allowed(proxy(request("/robots.txt")))).toBe(true);
  });

  it("never caches the challenge response", () => {
    expect(proxy(request("/")).headers.get("Cache-Control")).toBe("no-store");
  });

  it("marks even the challenge page noindex", () => {
    expect(proxy(request("/")).headers.get("X-Robots-Tag")).toMatch(/noindex/);
  });

  it("rejects malformed authorization headers without throwing", () => {
    for (const value of ["Basic", "Basic !!!!not-base64!!!!", "Bearer token", "Basic bm9jb2xvbg=="]) {
      const headers = new Headers({ authorization: value });
      expect(() => proxy(new Request(`${ORIGIN}/`, { headers }))).not.toThrow();
      expect(proxy(new Request(`${ORIGIN}/`, { headers })).status).toBe(401);
    }
  });
});
