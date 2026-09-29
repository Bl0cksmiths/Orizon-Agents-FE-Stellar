/**
 * The /demo page is built from a manifest at build time, so its two states
 * cannot share one server. playwright.config.ts starts a second `next dev`
 * that serves the published fixture; the default server serves the
 * unpublished one. Both the config and e2e/demo.spec.ts read the port here.
 *
 * E2E_DEMO_PORT overrides it; by default it is the one after E2E_PORT.
 */

export const E2E_PORT = Number(process.env.E2E_PORT ?? 3000);

export const DEMO_PUBLISHED_PORT = Number(
  process.env.E2E_DEMO_PORT ?? E2E_PORT + 1,
);

/** The second server's own build directory; see tsconfig.json's include. */
export const DEMO_PUBLISHED_DIST_DIR = ".next/e2e-demo";
