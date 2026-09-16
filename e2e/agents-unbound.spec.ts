/**
 * An unbound agent, made visible in the marketplace (story 2.05, AC-3/AC-4).
 *
 * The assertion that earns its keep is the negative one: the twelve seeded
 * catalog agents have no endpoint and never will — they run on workers inside
 * the backend — so a flag keyed off "has no binding" rather than off
 * `needsBinding` would mark the whole catalog broken on the console's busiest
 * page. Every test here therefore checks not only what is flagged but which
 * agents were asked about at all, because the cheapest way to get this wrong is
 * to interrogate rows we have no business interrogating.
 */
import { test, expect, type Page, type Route } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mockAgents, mockApi, mockWallet, mockWalletAddress } from "./mocks";
import { bindHref, UNBOUND_WARNING } from "../lib/binding-status";

/** The seeded catalog row: no owner, no endpoint, and nothing wrong with it. */
const SEEDED_ID = "agt_11c0";
/** The wallet's own agents — one bound below, one deliberately left unbound. */
const BOUND_ID = "weather_bot";
const UNBOUND_ID = "unbound_bot";

/** Another operator's agent. `mockAgents` has no such row and the mock module
 *  belongs to another lane, so the marketplace response is extended here —
 *  spread from a real fixture row so only the owner is actually different. */
const FOREIGN_OWNER =
  "GA7AI5TAJEZA27I666DSJC4MUJYBEWUYNNZWPU7R2ONA7IZQVO6R5OQV";
const FOREIGN_ID = "foreign_bot";
const foreignAgent = {
  ...mockAgents[mockAgents.length - 1],
  id: FOREIGN_ID,
  name: "Foreign Bot",
  owner: FOREIGN_OWNER,
};

/** `GET /agents/{id}/binding` as the backend answers it for an agent that has
 *  never been bound: a 404 whose code is `binding_not_found`, which
 *  `getAgentBindingOrNull` folds into a plain null. */
function fulfillUnbound(route: Route) {
  return route.fulfill({
    status: 404,
    contentType: "application/json",
    body: JSON.stringify({
      detail: "Not Found",
      error: {
        code: "binding_not_found",
        message: "no endpoint bound for this agent",
        request_id: "e2e0000000000002",
      },
    }),
  });
}

/** …and for one that is bound. Shaped to satisfy `isAgentBinding`. */
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

/**
 * The marketplace as these tests need it: the shared fixtures, plus a foreign
 * row, plus a bound answer for `weather_bot`.
 *
 * The shared binding mock answers 404 for *every* id, so it cannot on its own
 * say "this one is bound and that one is not". Registering per-id routes after
 * it is what expresses that — the last matching route wins.
 *
 * Returns the ids the page actually asked about, so a test can assert on the
 * requests that were *not* made.
 */
async function setUpMarketplace(page: Page): Promise<string[]> {
  await mockWallet(page);
  await mockApi(page);

  await page.route("**/api/agents", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([...mockAgents, foreignAgent]),
    }),
  );
  await page.route(`**/api/agents/${BOUND_ID}/binding`, (route) =>
    fulfillBound(route, BOUND_ID),
  );

  const asked: string[] = [];
  page.on("request", (request) => {
    const match = /^\/api\/agents\/([^/]+)\/binding$/.exec(
      new URL(request.url()).pathname,
    );
    if (match) asked.push(decodeURIComponent(match[1]));
  });
  return asked;
}

/**
 * The agent's own row, found by the id in its row header.
 *
 * Deliberately not `hasText: <name>`: the warning is a second row carrying the
 * same agent name, so a text filter would match both and every assertion
 * inside it would be ambiguous.
 */
function row(page: Page, agentId: string) {
  return page
    .getByRole("row")
    .filter({
      has: page.getByRole("rowheader", { name: agentId, exact: true }),
    });
}

/** The badge itself — `exact` because the row header carries the agent id
 *  (`unbound_bot`), which a substring match would hit first. */
function unboundBadge(scope: ReturnType<typeof row>) {
  return scope.getByText("unbound", { exact: true });
}

/** Resolves once the page has finished deciding — asserting an *absence*
 *  before then would pass for the wrong reason. */
async function flagResolved(page: Page) {
  await expect(
    page.getByRole("link", { name: new RegExp(`bind ${UNBOUND_ID}`, "i") }),
  ).toBeVisible();
  await expect(page.getByText("checking endpoint")).toHaveCount(0);
}

test.describe("unbound agents in the marketplace", () => {
  test("flags the owned agent with no endpoint, and offers a direct bind", async ({
    page,
  }) => {
    await setUpMarketplace(page);
    await page.goto("/app/agents");

    // The restored session is what makes the console consider a wallet
    // connected, and ownership is what reveals any of this. Both the topbar and
    // the page render a wallet control, hence first().
    await expect(
      page
        .getByRole("button", {
          name: new RegExp(mockWalletAddress.slice(0, 4)),
        })
        .first(),
    ).toBeVisible();

    await expect(unboundBadge(row(page, UNBOUND_ID))).toBeVisible();

    // The warning is the shared constant verbatim: it says the agent cannot be
    // *selected* for work, not that work will fail — an unbound agent is passed
    // over when the plan is built, so "will fail" would send its owner hunting
    // for errors that never happen.
    await expect(page.getByText(UNBOUND_WARNING)).toBeVisible();

    const bind = page.getByRole("link", {
      name: new RegExp(`bind ${UNBOUND_ID}`, "i"),
    });
    await expect(bind).toHaveAttribute("href", bindHref(UNBOUND_ID));

    // The owned agent that *is* bound is left alone — proof the flag reflects a
    // per-agent answer rather than "owned" or "any 404".
    await expect(unboundBadge(row(page, BOUND_ID))).toHaveCount(0);
    await expect(page.getByRole("link", { name: /^bind /i })).toHaveCount(1);
  });

  test("never flags — or even asks about — a seeded catalog agent", async ({
    page,
  }) => {
    const asked = await setUpMarketplace(page);
    await page.goto("/app/agents");
    await flagResolved(page);

    // The regression that would matter most: the catalog has no endpoint by
    // design, so flagging it would report the whole registry as broken.
    const seeded = row(page, SEEDED_ID);
    await expect(seeded).toBeVisible();
    await expect(unboundBadge(seeded)).toHaveCount(0);
    await expect(seeded.getByRole("link", { name: /bind/i })).toHaveCount(0);
    // The only bind action on the page belongs to the one agent that needs it.
    await expect(page.getByRole("link", { name: /^bind /i })).toHaveCount(1);
    expect(asked).not.toContain(SEEDED_ID);
  });

  test("never flags — or asks about — another wallet's agent", async ({
    page,
  }) => {
    const asked = await setUpMarketplace(page);
    await page.goto("/app/agents");
    await flagResolved(page);

    const foreign = row(page, FOREIGN_ID);
    await expect(foreign).toBeVisible();
    await expect(unboundBadge(foreign)).toHaveCount(0);
    await expect(foreign.getByRole("link", { name: /bind/i })).toHaveCount(0);
    expect(asked).not.toContain(FOREIGN_ID);

    // The whole cost of the page, stated: the wallet's own on-chain agents and
    // nothing else, against a rate limit that is one bucket for the service.
    // Deduplicated because `next dev` runs with React strict mode, which
    // double-invokes effects — the claim here is *which* agents were asked
    // about, not how many times a development build asked.
    expect([...new Set(asked)].sort()).toEqual([BOUND_ID, UNBOUND_ID].sort());
  });

  test("does not call an agent unbound before its status resolves", async ({
    page,
  }) => {
    await setUpMarketplace(page);

    let release = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route(`**/api/agents/${UNBOUND_ID}/binding`, async (route) => {
      await held;
      await fulfillUnbound(route);
    });

    await page.goto("/app/agents");

    // Listed, and visibly being looked at — but not accused. Rendering an
    // unresolved row as unbound would tell an operator their live agent is
    // unroutable on no evidence at all.
    const pending = row(page, UNBOUND_ID);
    await expect(pending.getByText("checking endpoint")).toBeVisible();
    await expect(page.getByText(UNBOUND_WARNING)).toHaveCount(0);
    await expect(page.getByRole("link", { name: /^bind /i })).toHaveCount(0);

    release();
    await expect(unboundBadge(pending)).toBeVisible();
    await expect(page.getByText(UNBOUND_WARNING)).toBeVisible();
  });

  test("the flagged marketplace has no WCAG A/AA violations", async ({
    page,
  }) => {
    await setUpMarketplace(page);
    await page.goto("/app/agents");
    await flagResolved(page);

    // e2e/a11y.spec.ts sweeps this route with no wallet connected, so the
    // flagged state — the only state that renders the warning and its action —
    // would otherwise never reach the axe gate.
    const { violations } = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    expect(
      violations.map(
        (v) => `${v.id} [${v.impact}] ${v.nodes.length} node(s) — ${v.help}`,
      ),
    ).toEqual([]);
  });
});
