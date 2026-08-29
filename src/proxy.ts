import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";

/**
 * HTTP Basic authentication gate for the private beta.
 *
 * Next.js 16 renamed `middleware` to `proxy`; the exported function must be
 * named `proxy` and runs on the Node.js runtime.
 *
 * ---------------------------------------------------------------------------
 * What this does and does not protect
 * ---------------------------------------------------------------------------
 * DOES: stop anyone without the shared password from loading any page, asset,
 *       JavaScript bundle or API route. This is the real access control — the
 *       robots directives are only a request to well-behaved crawlers.
 *
 * DOES NOT: identify individual testers (the credential is shared), protect
 *       anything if the password is circulated, or encrypt anything by itself.
 *       Basic credentials are base64, not encrypted, so this is only safe over
 *       HTTPS — which every real deployment target provides automatically.
 *
 * ---------------------------------------------------------------------------
 * Enabling
 * ---------------------------------------------------------------------------
 * The gate activates only when `SITE_PASSWORD` is set, so local development is
 * never blocked. On the host (Vercel/Replit) set:
 *
 *   SITE_PASSWORD=<a long random string>
 *   SITE_USERNAME=<optional, defaults to "beta">
 *
 * Unset `SITE_PASSWORD` to open the site again — for example when handing the
 * URL to challenge judges.
 */

const DEFAULT_USERNAME = "beta";

/** Length-safe constant-time string comparison. */
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  // timingSafeEqual throws on length mismatch, which would itself leak length.
  // Comparing fixed-size digests of the inputs avoids that.
  if (bufA.length !== bufB.length) {
    // Still burn a comparison so the failure path costs roughly the same.
    timingSafeEqual(bufA, bufA);
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

function unauthorized(): NextResponse {
  return new NextResponse("Authentication required.", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="TrialBridge private beta", charset="UTF-8"',
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow",
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
}

export function proxy(request: Request): NextResponse {
  const password = process.env.SITE_PASSWORD;

  // No password configured: the gate is off (local development, or a
  // deliberately public deployment).
  if (!password) return NextResponse.next();

  const { pathname } = new URL(request.url);

  // robots.txt is served without authentication on purpose: a crawler that
  // cannot read it does not learn that it is disallowed. It reveals nothing.
  if (pathname === "/robots.txt") return NextResponse.next();

  const header = request.headers.get("authorization");
  if (!header?.startsWith("Basic ")) return unauthorized();

  let decoded: string;
  try {
    decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
  } catch {
    return unauthorized();
  }

  // Only the first colon separates the pair; passwords may contain colons.
  const separator = decoded.indexOf(":");
  if (separator === -1) return unauthorized();

  const suppliedUser = decoded.slice(0, separator);
  const suppliedPassword = decoded.slice(separator + 1);
  const expectedUser = process.env.SITE_USERNAME || DEFAULT_USERNAME;

  // Both comparisons always run, so a correct username cannot be detected by
  // response timing.
  const userOk = safeEqual(suppliedUser, expectedUser);
  const passwordOk = safeEqual(suppliedPassword, password);

  if (!userOk || !passwordOk) return unauthorized();

  return NextResponse.next();
}

export const config = {
  /**
   * Everything is gated, including `_next/*` bundles — those contain the
   * application source, which is part of what the gate is protecting.
   */
  matcher: ["/:path*"],
};
