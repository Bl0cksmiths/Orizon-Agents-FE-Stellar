import { defineConfig, devices } from "@playwright/test";
import { E2E_PORT } from "./e2e/demo-server";

/**
 * The crawler checks (e2e/crawler.spec.ts) against a production build, which
 * is what Googlebot renders. The main suite runs the same spec against
 * `next dev`; only here does a failure in the root layout reach
 * app/global-error.tsx (development shows its error overlay instead), and
 * only here are the chunks split and named as they are live.
 *
 *   npm run e2e:crawl
 *
 * It builds into its own directory with fault injection on (inlined at build
 * time, so this build and no other has it), serves it with `next start` on
 * E2E_PORT, and answers the home page's network figures from the fake
 * backend (e2e/stats-backend.mjs) on the port after it, so the build reads
 * them at once. A run takes a few minutes, most of it the build.
 */
const PORT = E2E_PORT;
const BACKEND_PORT = PORT + 1;

// Read by the spec in every worker: the production-only checks run.
process.env.CRAWL_PRODUCTION = "1";

export default defineConfig({
  testDir: "e2e",
  testMatch: "crawler.spec.ts",
  timeout: 120_000,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    navigationTimeout: 60_000,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: `node --input-type=module -e "const { startStatsBackend } = await import('./e2e/stats-backend.mjs'); startStatsBackend(${BACKEND_PORT});"`,
      port: BACKEND_PORT,
      reuseExistingServer: false,
    },
    {
      command: `node scripts/litepaper-assets.mjs && npx next build && npx next start -p ${PORT}`,
      port: PORT,
      reuseExistingServer: false,
      timeout: 600_000,
      env: {
        E2E_DIST_DIR: ".next/e2e-crawl",
        NEXT_PUBLIC_FAULT_INJECTION: "1",
        NEXT_PUBLIC_API_BASE: `http://127.0.0.1:${BACKEND_PORT}`,
        NEXT_TELEMETRY_DISABLED: "1",
        // The same fixtures as the main suite's first server, so the spec's
        // titles and headings hold for both.
        GUIDE_CONTENT_DIR: "test/fixtures/guides",
        DEMO_CONTENT_DIR: "test/fixtures/demo/unpublished",
        EVIDENCE_CONTENT_DIR: "test/fixtures/evidence",
        LITEPAPER_DIR: "test/fixtures/litepaper",
      },
    },
  ],
});
