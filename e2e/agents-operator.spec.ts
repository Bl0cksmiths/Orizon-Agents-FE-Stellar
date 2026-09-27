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

/** The panel for one owned agent, found by the id its intro names. */
function standing(page: Page, agentId: string) {
  return page
    .getByRole("region", { name: "Routing standing" })
    .filter({ hasText: agentId });
}

test.describe("operator dashboard on data that is not healthy", () => {
  test("states rated jobs and eligibility plainly on a healthy read", async ({
    page,
  }) => {
    await mockWallet(page);
    await mockApi(page);
    await bindingIsBound(page);
    await page.goto("/app/operator");

    // The control for the degraded case below: the same wallet, the same
    // agents, a healthy batch. `weather_bot` has 8 rated jobs and clears.
    const opts = { useInnerText: true } as const;
    await expect(tile(page, /^rated jobs$/)).toContainText(
      /^rated jobs\s*8\s*completed work rated on-chain$/i,
      opts,
    );
    await expect(tile(page, /^eligible$/)).toContainText(
      /1\s*of 2\s*listed, bound and above the routing floor/i,
      opts,
    );
    await expect(standing(page, BOUND_ID).getByRole("status")).toHaveText(
      "✓Eligible — the planner selects per request.",
    );
  });

  test("does not state a count or a verdict it read from a failed read", async ({
    page,
  }) => {
    await mockWallet(page);
    await mockApi(page, { reputation: mockReputationBatchDegraded });
    await bindingIsBound(page);
    await page.goto("/app/operator");

    const opts = { useInnerText: true } as const;
    // `count: 0` on a degraded entry is the prior's, not the agent's: this
    // agent has 8 rated jobs. The tile says the read failed instead.
    const rated = tile(page, /^rated jobs$/);
    await expect(rated).toContainText(
      /^rated jobs\s*—\s*on-chain read failed/i,
      opts,
    );
    await expect(rated).not.toContainText(/\b0\b/, opts);
    // The count still stands, but as what it is: computed from an estimate.
    await expect(tile(page, /^eligible$/)).toContainText(
      /provisional — the on-chain reputation read failed/i,
      opts,
    );

    // The live region, which is what a screen reader announces. Never a
    // cyan "✓ Eligible" with the caveat far below.
    const verdict = standing(page, BOUND_ID).getByRole("status");
    await expect(verdict).toHaveText(/^⋯Provisionally eligible — /);
    await expect(verdict).not.toHaveClass(/cyan/);
  });

  test("says the reputation read failed rather than that the agent is missing", async ({
    page,
  }) => {
    await mockWallet(page);
    await mockApi(page);
    await mockReputationUnavailable(page);
    await bindingIsBound(page);
    await page.goto("/app/operator");

    const panel = standing(page, BOUND_ID);
    await expect(panel.getByRole("status")).toHaveText(
      "⋯Standing not confirmed — the reputation read failed.",
    );
    await expect(panel).toContainText("it says nothing about its record");
    await expect(
      page.getByText(/not in the batch|came back without it/),
    ).toHaveCount(0);
  });

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
