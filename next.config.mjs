/** @type {import('next').NextConfig} */
import { resolveApiBase } from "./lib/api-base.mjs";
import { ARTIFACTS, publishedHref } from "./lib/litepaper/source.mjs";

// Normalized so a trailing slash or a trailing `/api` in the configured value
// cannot corrupt the rewrite target below. On Vercel a missing value falls back
// to the production backend so the proxy can never point at localhost.
const API_BASE = resolveApiBase(process.env);

// Conservative CSP: hardens plugin/base/framing/form vectors only (see the
// header below for why there is no default-src or script-src).
const BASE_CSP =
  "object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'";

// The litepaper's HTML book (/litepaper/orizon-agents-litepaper.html) is one
// self-contained file: its CSS, the Mermaid runtime that draws its diagrams,
// and its images are all inline. Its own policy says exactly that: inline
// script and style, images from itself or data: URLs, and nothing else, so
// the book can fetch, frame or submit nothing. It repeats every directive of
// BASE_CSP, since on this path it replaces the site-wide policy.
const LITEPAPER_HTML_CSP = `${BASE_CSP}; default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:`;

/** The published path of a litepaper file, by format. */
const litepaperHref = (format) =>
  publishedHref(ARTIFACTS.find((a) => a.format === format).file);

const nextConfig = {
  // The Playwright suite runs a second dev server (the published /demo
  // fixture) beside the first; two servers cannot share one build directory.
  ...(process.env.E2E_DIST_DIR ? { distDir: process.env.E2E_DIST_DIR } : {}),
  reactStrictMode: true,
  poweredByHeader: false,
  // The home page waits up to 120s at build for the backend's registry to
  // finish syncing before it renders the hero without its figures
  // (lib/public-network-stats.ts, BUILD_RETRY_BUDGET_MS). Next's default of
  // 60s per page would kill that wait and fail the build instead.
  staticPageGenerationTimeout: 180,
  images: {
    // The /demo poster is YouTube's thumbnail. Our image optimiser fetches it
    // and serves it from our own origin, so the page makes no third-party
    // request until the viewer presses Play.
    remotePatterns: [
      { protocol: "https", hostname: "i.ytimg.com", pathname: "/vi/**" },
    ],
  },
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${API_BASE}/api/:path*`,
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          {
            // Conservative CSP: hardens plugin/base/framing/form vectors only.
            // Deliberately no default-src/script-src/style-src/connect-src —
            // a nonce-based CSP would force dynamic rendering and break the
            // artifact preview iframe. Deferred intentionally.
            key: "Content-Security-Policy",
            value: BASE_CSP,
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
      {
        // The demo page may frame YouTube's privacy-enhanced embed and
        // nothing else. Scoped to /demo: site-wide, a frame-src would also
        // bind the console's own frames (the artifact preview, the wallet
        // kit), which this change has no business restricting. Next applies
        // the last matching header of a given key, so on /demo this replaces
        // the site-wide policy above; it repeats every directive of that
        // policy and adds frame-src.
        source: "/demo",
        headers: [
          {
            key: "Content-Security-Policy",
            value: `${BASE_CSP}; frame-src https://www.youtube-nocookie.com`,
          },
        ],
      },
      {
        // Scoped to the one file: every other route keeps BASE_CSP. Next
        // applies the last matching header of a key, as for /demo above.
        source: litepaperHref("html"),
        headers: [
          { key: "Content-Security-Policy", value: LITEPAPER_HTML_CSP },
        ],
      },
      {
        // Opens in the browser's PDF viewer, and saves under its clean name.
        source: litepaperHref("pdf"),
        headers: [
          {
            key: "Content-Disposition",
            value: 'inline; filename="orizon-agents-litepaper.pdf"',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
