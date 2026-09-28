import { defineConfig, devices } from "@playwright/test";

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
const PORT = Number(process.env.E2E_PORT ?? 3000);

/**
 * The guide pages read their Markdown from content/guides/ at build. The suite
 * serves the fixture guide instead, which exercises every construct of the
 * dialect, so e2e/guide.spec.ts does not change when the prose does. Set
 * GUIDE_CONTENT_DIR=content/guides to run the same spec against the real one.
 */
const GUIDE_CONTENT_DIR =
  process.env.GUIDE_CONTENT_DIR ?? "test/fixtures/guides";

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
  webServer: {
    command: `npx next dev -p ${PORT}`,
    port: PORT,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: { GUIDE_CONTENT_DIR },
  },
});
