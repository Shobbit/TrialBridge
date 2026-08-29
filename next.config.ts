import type { NextConfig } from "next";

/**
 * Security and privacy headers.
 *
 * `X-Robots-Tag` is the load-bearing one for keeping this private beta out of
 * search results. Unlike robots.txt — which is advisory and only consulted
 * before a crawl — this header is attached to every response, including the
 * JSON API routes, and is honoured even when a URL is reached directly.
 */
const securityHeaders = [
  {
    key: "X-Robots-Tag",
    value: "noindex, nofollow, noarchive, nosnippet, noimageindex, notranslate",
  },
  // Do not leak the beta URL to third parties through the Referer header.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  // WebMCP tools must be registered by the top-level document, so the page is
  // never meant to be framed. This also blocks clickjacking.
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  {
    key: "Permissions-Policy",
    value: "geolocation=(), microphone=(), camera=(), payment=(), usb=()",
  },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
