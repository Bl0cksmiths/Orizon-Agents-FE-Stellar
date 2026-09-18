/**
 * The marketplace's reputation column: the right number, or no number.
 *
 * Two defects this suite pins, both of which rendered as plausible-looking
 * scores and so survived every screenshot:
 *
 *   - An unrated agent's chip printed its seeded catalog rating as a "prior
 *     estimate" — 4.58 to 4.95 across the first-party catalog — while the
 *     plan card printed the live 3.50 prior the agent is actually routed on.
 *   - A reputation batch that failed was never mentioned. Every chip fell
 *     back to that catalog rating and claimed "no on-chain ratings yet", a
 *     statement about each agent's history that nobody had read.
 *
 * No wallet is connected: the column is a buyer's view, and with no wallet no
 * per-agent notice rows are injected, so a row count means what it says.
 */
import { test, expect, type Page } from "@playwright/test";
import {
  mockAgents,
  mockApi,
  mockReputationBatch,
  mockReputationUnavailable,
  mockUnratedCatalogAgent,
  mockUnratedCatalogReputation,
  mockUnscoredAgent,
} from "./mocks";

/** The registry these tests read: the shared rows plus an unrated catalog
 *  agent that the batch carries at the live prior. */
const AGENTS = [...mockAgents, mockUnratedCatalogAgent];
const BATCH = {
  ...mockReputationBatch,
  reputations: {
    ...mockReputationBatch.reputations,
    [mockUnratedCatalogAgent.id]: mockUnratedCatalogReputation,
  },
};

/** The agent's own row, by the id in its row header (see agents-unbound). */
function row(page: Page, agentId: string) {
  return page.getByRole("row").filter({
    has: page.getByRole("rowheader", { name: agentId, exact: true }),
  });
}

async function registryLoaded(page: Page, count: number) {
  await expect(page.getByRole("rowheader")).toHaveCount(count);
}

test.describe("the marketplace reputation column", () => {
  test("shows an unrated agent at the live prior, not its catalog rating", async ({
    page,
  }) => {
    await mockApi(page, { agents: AGENTS, reputation: BATCH });
    await page.goto("/app/agents");
    await registryLoaded(page, AGENTS.length);

    // 3.50 is the prior the batch served (7000 bps) — the number the plan card
    // shows and the floor is measured against. 4.83 is catalog copy that
    // nothing routes on; printing it made one agent read two scores.
    const unrated = row(page, mockUnratedCatalogAgent.id);
    const asRendered = { useInnerText: true } as const;
    await expect(unrated).toContainText("3.50", asRendered);
    await expect(unrated).not.toContainText(
      mockUnratedCatalogAgent.rep.toFixed(2),
      asRendered,
    );
    // And it is honestly a cold start, so the chip may say so.
    await expect(
      unrated.locator('[aria-label*="no on-chain ratings yet"]'),
    ).toHaveCount(1);
  });

  test("invents no score for an agent the batch has no entry for", async ({
    page,
  }) => {
    const agents = [...AGENTS, mockUnscoredAgent];
    await mockApi(page, { agents, reputation: BATCH });
    await page.goto("/app/agents");
    await registryLoaded(page, agents.length);

    // The batch was read and simply does not carry this agent. The honest
    // cell says there is no score; the old one printed the catalog rating.
    const unscored = row(page, mockUnscoredAgent.id);
    await expect(unscored.getByText("no score", { exact: true })).toBeVisible();
    await expect(unscored).not.toContainText(mockUnscoredAgent.rep.toFixed(2), {
      useInnerText: true,
    });
    await expect(unscored).not.toContainText("★");
  });

  test("says so when the reputation batch fails, and scores nothing", async ({
    page,
  }) => {
    await mockApi(page, { agents: AGENTS });
    await mockReputationUnavailable(page);
    await page.goto("/app/agents");
    await registryLoaded(page, AGENTS.length);

    // Announced, once, above the registry — the registry itself rendered
    // fine, so nothing else on the page would have said a word.
    const notice = page
      .getByRole("alert")
      .filter({ hasText: "reputation unavailable" });
    await expect(notice).toHaveCount(1);
    await expect(notice).toBeVisible();

    // Every row says its score is unavailable, and none shows a score: the
    // old fallback printed each agent's catalog rating under a star.
    for (const agent of AGENTS) {
      await expect(
        row(page, agent.id).getByText("unavailable", { exact: true }),
      ).toBeVisible();
    }
    await expect(page.locator("table")).not.toContainText("★");

    // And nobody is told they have no ratings. That is a claim about an
    // agent's history, and the read that could have supported it failed.
    await expect(
      page.locator('[aria-label*="no on-chain ratings yet"]'),
    ).toHaveCount(0);
  });
});
