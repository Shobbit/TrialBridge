import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TrialBridge — Explore clinical trials that may be relevant to you",
  description:
    "Search ClinicalTrials.gov, compare studies and prepare questions for research teams. A WebMCP application: browser AI agents can drive the same interface you see. Not medical advice.",
  /**
   * Private beta: the site must not be discoverable through search.
   *
   * `noindex` keeps it out of results even when a crawler reaches a page by a
   * route robots.txt did not anticipate; `nosnippet`, `noarchive` and
   * `noimageindex` stop cached copies, excerpts and images surviving elsewhere.
   * The same directives are sent as an `X-Robots-Tag` header from
   * `next.config.ts`, which covers non-HTML responses such as the API routes.
   */
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: {
      index: false,
      follow: false,
      noimageindex: true,
      "max-snippet": -1,
      "max-image-preview": "none",
    },
  },
  referrer: "strict-origin-when-cross-origin",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  colorScheme: "light dark",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh antialiased">
        <a
          href="#search-form"
          className="sr-only-focusable absolute left-2 top-2 z-50 rounded bg-tb-accent px-3 py-2 text-sm text-white"
        >
          Skip to search form
        </a>
        {children}
      </body>
    </html>
  );
}
