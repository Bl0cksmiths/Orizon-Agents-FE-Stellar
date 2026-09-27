/**
 * The operator dashboard's standing surfaces on data that is not simply
 * healthy: a failed refresh, a degraded reputation read, and a reputation
 * read that never landed.
 *
 * Each one used to be told as a confident answer. A single failed `/agents`
 * revalidation blanked every owned agent; a degraded batch — which the live
 * backend served on alternate reads — produced "✓ Eligible" and "RATED JOBS
 * 0" for an agent with eight rated jobs; and a failed batch was worded as
 * "it was not in the batch". These specs pin the honest version of each.
 */
import { test, expect, type Page, type Route } from "@playwright/test";
import {
  mockApi,
  mockReputationBatchDegraded,
  mockReputationUnavailable,
  mockWallet,
  mockWalletAddress,
} from "./mocks";

/** The wallet's bound, on-chain agent — the one that can be eligible. */
const BOUND_ID = "weather_bot";

/** `weather_bot`'s lookup answers bound, so both of its gates can be read. */
async function bindingIsBound(page: Page): Promise<void> {
  await page.route(`**/api/agents/${BOUND_ID}/binding`, (route: Route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        agent_id: BOUND_ID,
        endpoint_url: "https://agent.example.com/run",
        owner: mockWalletAddress,
        bound_at: "2026-09-10T08:15:00Z",
        replaced: false,
      }),
    }),
  );
}

/** A Routing standing panel, one per owned agent. */
function panels(page: Page) {
  return page.getByRole("heading", { name: "Routing standing" });
}

/** One StatTile, found by its label and read as rendered text. */
function tile(page: Page, label: RegExp) {
  return page.locator("div", { hasText: label }).locator("xpath=..").first();
}

test.describe("operator dashboard on data that is not healthy", () => {
  test("keeps the owned agents on screen through a failed refresh", async ({
    page,
  }) => {
    await page.clock.install();
    await mockWallet(page);
    await mockApi(page);
    await page.goto("/app/operator");
    await expect(panels(page)).toHaveCount(2);

    // The next `/agents` read fails, as a revalidation after the tab was away
    // for more than the minute `useFetch` treats as fresh.
    await page.route("**/api/agents", (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          detail: "Service Unavailable",
          error: {
            code: "unavailable",
            message: "service unavailable",
            request_id: "e2e0000000000009",
          },
        }),
      }),
    );
    await page.clock.fastForward(61_000);
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));

    // Said, once the failed read has landed…
    await expect(
      page.getByRole("alert").filter({ hasText: /agent registry/i }),
    ).toBeVisible();
    // …with the data it failed to refresh still there, and dated rather than
    // passed off as live.
    await expect(panels(page)).toHaveCount(2);
    await expect(page.getByText(/⚠ stale · updated/)).toBeVisible();
    await expect(
      page.getByText(/could not refresh the agent registry/i),
    ).toBeVisible();
  });
});
