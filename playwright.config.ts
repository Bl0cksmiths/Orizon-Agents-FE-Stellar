import { defineConfig, devices } from "@playwright/test";
import {
  DEMO_PUBLISHED_DIST_DIR,
  DEMO_PUBLISHED_PORT,
  E2E_PORT,
} from "./e2e/demo-server";

/**
 * Minimal E2E smoke suite. Runs against `next dev` (no build needed); every
 * /api/* call is route-intercepted in the specs, so no backend — and no
 * NEXT_PUBLIC_API_BASE — is required.
 */
/**
 * The port is overridable because `reuseExistingServer` is a trap when more
 * than one checkout is live. It reuses whatever already holds the port —
 * including another worktree's `next dev` — so the suite happily tests code
 * that is not yours and fails with a goto timeout that reads like a product
 * bug. That cost four separate false-failure investigations in one session.
 *
 * Set E2E_PORT to isolate a checkout:  E2E_PORT=3117 npx playwright test
 */
const PORT = E2E_PORT;

/**
 * The guide pages read their Markdown from content/guides/ at build. The suite
 * serves the fixture guide instead, which exercises every construct of the
 * dialect, so e2e/guide.spec.ts does not change when the prose does. Set
 * GUIDE_CONTENT_DIR=content/guides to run the same spec against the real one.
 */
const GUIDE_CONTENT_DIR =
  process.env.GUIDE_CONTENT_DIR ?? "test/fixtures/guides";

/**
 * /litepaper and its files come from the fixture book, a tiny fake, so the
 * spec does not change when the litepaper does. The copy step runs before the
 * server starts, as `prebuild` does before a build, publishing the fixture's
 * files under public/litepaper/. LITEPAPER_DIR=litepaper serves the real one.
 */
const LITEPAPER_DIR = process.env.LITEPAPER_DIR ?? "test/fixtures/litepaper";

export default defineConfig({
  testDir: "e2e",
  // First on-demand compile of a route under `next dev` can be slow.
  timeout: 120_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "on-first-retry",
    navigationTimeout: 60_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: [
    {
      command: `node scripts/litepaper-assets.mjs && npx next dev -p ${PORT}`,
      port: PORT,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      // /demo here is the unpublished fixture: the honest notice, no player.
      env: {
        GUIDE_CONTENT_DIR,
        DEMO_CONTENT_DIR: "test/fixtures/demo/unpublished",
        // /evidence from its fixture index (fake hashes), so
        // e2e/evidence.spec.ts does not change when the real index is filled.
        EVIDENCE_CONTENT_DIR: "test/fixtures/evidence",
        LITEPAPER_DIR,
      },
    },
    {
      // /demo published, from its fixture manifest (e2e/demo-server.ts). A
      // second server because the page is built from the manifest; its own
      // build directory because two dev servers cannot share one.
      command: `npx next dev -p ${DEMO_PUBLISHED_PORT}`,
      port: DEMO_PUBLISHED_PORT,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        GUIDE_CONTENT_DIR,
        E2E_DIST_DIR: DEMO_PUBLISHED_DIST_DIR,
        DEMO_CONTENT_DIR: "test/fixtures/demo/published",
        DEMO_PUBLIC_DIR: "test/fixtures/demo/public",
        // /evidence here is the REAL index, so e2e/evidence.spec.ts can run
        // axe, print and 360px checks on what reviewers will actually read.
        EVIDENCE_CONTENT_DIR: "content/evidence",
      },
    },
  ],
});
