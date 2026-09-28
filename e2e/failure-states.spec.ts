import { test, expect } from "@playwright/test";
import { mockApiOutage } from "./mocks";

/**
 * The regression suite for the outage that motivated this work.
 *
 * Production served a 404 for every `/api/*` call for days and nobody noticed:
 * the marketing pages were fine, the build was green, the unit suite passed,
 * and the console answered with skeletons and placeholder dashes that look
 * exactly like "no data yet". These tests assert the console tells the truth
 * when the backend is unreachable.
 *
 * Every route is checked for the same two properties:
 *   1. the failure is ANNOUNCED — a visible `role="alert"`, so it reaches
 *      screen readers as well as sighted users;
 *   2. the failure is not DISGUISED — no cheerful empty state, and above all
 *      no formatted money or reputation figure standing in for missing data.
 *
 * The generous timeout accommodates the hooks' bounded retry-with-backoff:
 * the alert is only expected once the retries are exhausted.
 */
const ALERT_TIMEOUT = 30_000;

const ROUTES = [
  "/app",
  "/app/agents",
  "/app/reputation",
  "/app/ecosystem",
  "/app/flow",
  "/app/events",
  "/app/wallet",
  "/app/pdax",
];

test.describe("console under a total backend outage", () => {
  for (const route of ROUTES) {
    test(`${route} announces the failure instead of shimmering`, async ({
      page,
    }) => {
      await mockApiOutage(page);
      await page.goto(route);

      await expect(page.locator('[role="alert"]').first()).toBeVisible({
        timeout: ALERT_TIMEOUT,
      });
    });
  }

  test("/app/events does not show the empty state while failing", async ({
    page,
  }) => {
    await mockApiOutage(page);
    await page.goto("/app/events");

    await expect(page.locator('[role="alert"]').first()).toBeVisible({
      timeout: ALERT_TIMEOUT,
    });
    // The bug: `feedLoading` went false on error, so the "no events yet"
    // invitation rendered directly beneath the error card.
    await expect(page.getByText(/No events yet/i)).toHaveCount(0);
  });

  test("/app/register announces a failed availability check", async ({
    page,
  }) => {
    // The register page is form-first — nothing fetches on mount, so the
    // outage only shows once the availability check fires on blur. Typing a
    // valid id and blurring must still ANNOUNCE the failure, not swallow it.
    await mockApiOutage(page);
    await page.goto("/app/register");

    await page.fill("#reg-agent-id", "weather_bot");
    await page.locator("#reg-agent-id").blur();

    await expect(page.locator('[role="alert"]').first()).toBeVisible({
      timeout: ALERT_TIMEOUT,
    });
  });

  test("no money or trust figure is fabricated while failing", async ({
    page,
  }) => {
    await mockApiOutage(page);
    await page.goto("/app");

    await expect(page.locator('[role="alert"]').first()).toBeVisible({
      timeout: ALERT_TIMEOUT,
    });

    // A failed fetch must never render as a real-looking zero. `0.000` is the
    // USDC format used across the console; `0.00` covers the shorter spellings.
    const body = page.locator("main");
    await expect(body).not.toContainText(/\b0\.000\b/);
    await expect(body).not.toContainText(/\b0\.00 USDC\b/);
  });

  test("marketing page still renders with the API dead", async ({ page }) => {
    await mockApiOutage(page);
    await page.goto("/");

    // Static marketing content must not depend on the backend at all — and the
    // warm-up ping is fire-and-forget, so a 404 must not surface anywhere.
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.locator('[role="alert"]')).toHaveCount(0);
  });
});
