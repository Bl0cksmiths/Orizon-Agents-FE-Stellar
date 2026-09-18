/**
 * An agent its operator has delisted, on every surface that answers "can this
 * agent be picked?".
 *
 * The backend routes listed agents only — `status !== "offline"`, on every
 * planning path, with no fallback that re-admits a withdrawn one. The
 * marketplace's "routable" filter, the operator's routing standing and the
 * dashboard's "eligible" count each checked the endpoint and the floor and
 * nothing else, so `paused_bot` — bound, rated well clear of the floor,
 * delisted — read as routable in all three while no plan could pick it.
 *
 * The other half of the claim is tone. Delisting is the operator's own
 * decision about their own service, so every surface says it as that: a
 * calm mark, never a failure.
 */
import { test, expect, type Page } from "@playwright/test";
import {
  mockAgents,
  mockApi,
  mockDelistedAgent,
  mockDelistedReputation,
  mockReputationBatch,
} from "./mocks";

const DELISTED_ID = mockDelistedAgent.id;
const AGENTS = [...mockAgents, mockDelistedAgent];
const BATCH = {
  ...mockReputationBatch,
  reputations: {
    ...mockReputationBatch.reputations,
    [DELISTED_ID]: mockDelistedReputation,
  },
};

/** The agent's own row, by the id in its row header (see agents-unbound). */
function row(page: Page, agentId: string) {
  return page.getByRole("row").filter({
    has: page.getByRole("rowheader", { name: agentId, exact: true }),
  });
}

test.describe("a delisted agent in the marketplace", () => {
  test("is marked as withdrawn by its operator, and nothing else", async ({
    page,
  }) => {
    await mockApi(page, { agents: AGENTS, reputation: BATCH });
    await page.goto("/app/agents");
    await expect(page.getByRole("rowheader")).toHaveCount(AGENTS.length);

    const delisted = row(page, DELISTED_ID);
    await expect(delisted.getByText(/delisted by operator/i)).toBeVisible();
    // One reason, not a pile of them. Its gates are healthy anyway, but the
    // point is that none of their verdicts belongs on a withdrawn agent.
    await expect(delisted.getByText(/not\s+yet\s+operational/i)).toHaveCount(0);
    await expect(delisted.getByText(/below floor/i)).toHaveCount(0);
  });
});
