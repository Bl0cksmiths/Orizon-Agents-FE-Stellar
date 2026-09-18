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
import { test, expect, type Page, type Route } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import {
  mockAgents,
  mockApi,
  mockDelistedAgent,
  mockDelistedReputation,
  mockReputationBatch,
  mockWallet,
  mockWalletAddress,
} from "./mocks";
import { UNBOUND_WARNING } from "../lib/binding-status";

const DELISTED_ID = mockDelistedAgent.id;
const AGENTS = [...mockAgents, mockDelistedAgent];
const BATCH = {
  ...mockReputationBatch,
  reputations: {
    ...mockReputationBatch.reputations,
    [DELISTED_ID]: mockDelistedReputation,
  },
};

/**
 * `GET /agents/{id}/binding` for an agent with an endpoint bound. The shared
 * mock answers "never bound" for every id, so per-id routes registered after
 * it are how a spec says which of the wallet's agents are bound.
 */
function fulfillBound(route: Route, agentId: string) {
  return route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      agent_id: agentId,
      endpoint_url: "https://agent.example.com/run",
      owner: mockWalletAddress,
      bound_at: new Date().toISOString(),
      replaced: false,
    }),
  });
}

async function bindingIsBound(page: Page, agentId: string) {
  await page.route(`**/api/agents/${agentId}/binding`, (route) =>
    fulfillBound(route, agentId),
  );
}

/**
 * Neither surface's delisted state is reached by the default a11y sweep, and
 * both put new words and a new tone on screen. Checked at a phone width,
 * because the marketplace row gains a mark and the operator verdict gains a
 * sentence, and either could push something off the side.
 */
async function accessibleAt390(page: Page) {
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);

  const { violations } = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(
    violations.map(
      (v) => `${v.id} [${v.impact}] ${v.nodes.length} node(s) — ${v.help}`,
    ),
  ).toEqual([]);
}

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

  test("drops out of the routable filter, and stays under offline", async ({
    page,
  }) => {
    await mockApi(page, { agents: AGENTS, reputation: BATCH });
    await page.goto("/app/agents");
    await expect(page.getByRole("rowheader")).toHaveCount(AGENTS.length);

    // Bound and clear of the floor: before the listing rule this was the one
    // row the filter kept that no plan could route to.
    await page.getByRole("button", { name: /^routable$/i }).click();
    await expect(row(page, DELISTED_ID)).toHaveCount(0);
    // …while the agents that do clear every gate are still offered.
    for (const id of ["agt_11c0", "weather_bot"]) {
      await expect(row(page, id)).toBeVisible();
    }

    // Withdrawn is not deleted: the status filter still finds it.
    await page.getByRole("button", { name: /^offline$/i }).click();
    await expect(page.getByRole("rowheader")).toHaveCount(1);
    await expect(row(page, DELISTED_ID)).toBeVisible();
  });

  // On its owner's screen the binding lookup runs for it too, and the fixture
  // answers "never bound". The shared warning would then say the agent "is
  // listed, but the orchestrator passes over it" — false twice over for an
  // agent its operator withdrew.
  test("does not tell its owner it is listed but unbound", async ({ page }) => {
    await mockWallet(page);
    await mockApi(page, { agents: AGENTS, reputation: BATCH });
    await bindingIsBound(page, "weather_bot");
    await page.goto("/app/agents");

    const delisted = row(page, DELISTED_ID);
    // The missing endpoint is still recorded — it matters for relisting.
    await expect(delisted.getByText("unbound", { exact: true })).toBeVisible();
    await expect(delisted.getByText(/delisted by operator/i)).toBeVisible();

    // …but the only warning and the only bind action on the page belong to
    // the listed agent that is genuinely being passed over.
    await expect(
      page.getByRole("link", { name: /^bind unbound_bot$/i }),
    ).toBeVisible();
    await expect(page.getByText(UNBOUND_WARNING)).toHaveCount(1);
    await expect(page.getByRole("link", { name: /^bind /i })).toHaveCount(1);
  });

  test("the owner's marketplace with a delisted row is accessible at 390px", async ({
    page,
  }) => {
    await mockWallet(page);
    await mockApi(page, { agents: AGENTS, reputation: BATCH });
    await bindingIsBound(page, "weather_bot");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/app/agents");
    await expect(
      row(page, DELISTED_ID).getByText(/delisted by operator/i),
    ).toBeVisible();
    await expect(page.getByText("checking endpoint")).toHaveCount(0);

    await accessibleAt390(page);
  });
});

test.describe("a delisted agent on its operator's dashboard", () => {
  test("gets its own verdict, and is not counted as eligible", async ({
    page,
  }) => {
    await mockWallet(page);
    await mockApi(page, { agents: AGENTS, reputation: BATCH });
    // Both bound, both clear of the floor. The only difference between them
    // is that one is listed.
    await bindingIsBound(page, "weather_bot");
    await bindingIsBound(page, DELISTED_ID);
    await page.goto("/app/operator");

    await expect(
      page.getByRole("heading", { name: mockDelistedAgent.name, exact: true }),
    ).toBeVisible();

    // The verdict names the operator's own decision rather than a gate, and
    // never calls the agent eligible.
    await expect(
      page.getByText(/^Delisted — you withdrew this agent/),
    ).toHaveCount(1);
    await expect(
      page.getByText("This is your own setting, not a fault.", {
        exact: false,
      }),
    ).toBeVisible();
    await expect(page.getByText(/^Eligible — /)).toHaveCount(1);

    // Three owned, one eligible: `weather_bot`. Before the listing rule the
    // tile read 2 of 3, counting an agent no plan can pick.
    const tile = page
      .locator("div", { hasText: /^eligible$/ })
      .locator("xpath=..");
    await expect(tile).toContainText("1of 3");
  });

  test("the dashboard with a delisted agent is accessible at 390px", async ({
    page,
  }) => {
    await mockWallet(page);
    await mockApi(page, { agents: AGENTS, reputation: BATCH });
    await bindingIsBound(page, "weather_bot");
    await bindingIsBound(page, DELISTED_ID);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/app/operator");
    await expect(
      page.getByText(/^Delisted — you withdrew this agent/),
    ).toBeVisible();
    await expect(
      page.getByText(/endpoint lookup has not come back/),
    ).toHaveCount(0);

    await accessibleAt390(page);
  });
});
