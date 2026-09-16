/**
 * Marketplace standing (story 3.05): what the registry says about an agent a
 * buyer cannot actually be routed to.
 *
 * Every assertion here defends one distinction the page is easy to collapse:
 * a score below the routing floor is not the same as no endpoint, neither is
 * the same as a score that is only an estimate, and none of them is the same
 * as "registered by someone other than us". Each reads as "unavailable" on a
 * screenshot, and each sends the buyer somewhere different.
 *
 * No wallet is connected on purpose. Standing is read from the registry
 * payload and the reputation batch, never from ownership, so this suite proves
 * the marks appear for a passing visitor — and, because `useBindingStatus`
 * then asks about nothing, no per-agent notice rows are injected and a row
 * count means exactly what it says.
 */
import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import {
  mockAgents,
  mockApi,
  mockReputationBatch,
  mockReputationBatchDegraded,
} from "./mocks";
import { scoreOutOfFive } from "../lib/reputation-math";

/** Seeded catalog, and `real: true` — the provenance trap. Nothing about it is
 *  external, and `real` is the field that says otherwise. */
const SEEDED_ID = "agt_11c0";
/** Registered on-chain, endpoint bound, above the floor: the healthy external
 *  agent, and the only on-chain row with nothing wrong with it. */
const BOUND_ID = "weather_bot";
/** Registered on-chain, no endpoint. Clears the floor — its reputation is not
 *  the problem. */
const UNBOUND_ID = "unbound_bot";
/** Registered on-chain, endpoint bound, rated down under the floor. Its
 *  endpoint is not the problem. */
const BELOW_FLOOR_ID = "rated_down_bot";

/** The two that pass both gates, and so the two a routable filter must keep. */
const ROUTABLE_IDS = [SEEDED_ID, BOUND_ID];
/** …and the two it must drop, one per gate. */
const UNROUTABLE_IDS = [UNBOUND_ID, BELOW_FLOOR_ID];

/** The floor as the page has to print it: bps over a 0–5 scale, converted by
 *  the app's own helper so a test can never disagree with the product about
 *  what 5500 bps looks like. 5500 → "2.75". */
const FLOOR_SCORE = scoreOutOfFive(mockReputationBatch.floor_bps);

/**
 * Text anchors, deliberately loose on wording and strict on concept — the copy
 * is still under review, so these match the idea rather than a sentence.
 *
 * `EXTERNAL` is the one worth explaining: it looks for "external", not
 * "on-chain", because on this page "on-chain" is already taken. `agt_11c0` is
 * a seeded agent with an on-chain reputation, so a row saying "on-chain" may
 * be talking about where the score came from rather than who registered the
 * agent — and conflating those two is exactly the failure AC-3 exists to
 * catch.
 */
const BELOW_FLOOR_MARK = /floor/i;
const EXTERNAL_MARK = /extern/i;
const NOT_OPERATIONAL_MARK = /not\s+(yet\s+)?operational/i;
const ESTIMATE_MARK = /estimat/i;
/** The standing filter in the existing `all | online | idle | offline` group,
 *  found by accessible name; "all" is therefore also the way back. */
const ROUTABLE_FILTER = /routable|eligible/i;

/** The agent's own row, found by the id in its row header — the same anchor
 *  `e2e/agents-unbound.spec.ts` uses, and for the same reason: a name filter
 *  would also match any notice row repeating that name. */
function row(page: Page, agentId: string) {
  return page.getByRole("row").filter({
    has: page.getByRole("rowheader", { name: agentId, exact: true }),
  });
}

/** Resolves once the registry has rendered — asserting an absence before the
 *  fetch lands would pass for the wrong reason. Every row carries a row
 *  header, and with no wallet connected nothing adds extra ones. */
async function registryLoaded(page: Page) {
  await expect(page.getByRole("rowheader")).toHaveCount(mockAgents.length);
}

test.describe("agent standing in the marketplace", () => {
  test("AC-1 marks the below-floor agent in its own row, in words", async ({
    page,
  }) => {
    await mockApi(page);
    await page.goto("/app/agents");
    await registryLoaded(page);

    // `getByText` reads rendered text, never a `title` or `aria-label` — which
    // is the whole assertion. The reputation chip already carries "below the
    // 2.75 network floor" in its tooltip, and a buyer scanning the table with
    // a keyboard, a phone, or their eyes never sees a tooltip. An excluded
    // agent that looks identical to an available one is a buyer picking it.
    await expect(
      row(page, BELOW_FLOOR_ID).getByText(BELOW_FLOOR_MARK).first(),
    ).toBeVisible();

    // And the mark is a verdict about this agent, not decoration on the table:
    // if it appeared on rows that clear the floor it would say nothing at all.
    for (const id of [SEEDED_ID, BOUND_ID, UNBOUND_ID]) {
      await expect(row(page, id).getByText(BELOW_FLOOR_MARK)).toHaveCount(0);
    }
  });

  test("AC-2 states the routing floor once, at page level", async ({
    page,
  }) => {
    await mockApi(page);
    await page.goto("/app/agents");
    await registryLoaded(page);

    // The floor is one network-wide number. Printed per row it becomes four
    // chances to disagree with itself after a deployment changes it, and it
    // reads as a property of the agent rather than of the marketplace.
    const floor = page.getByText(FLOOR_SCORE);
    await expect(floor).toHaveCount(1);
    await expect(floor).toBeVisible();

    // Page level means outside the registry table: the table is a horizontal
    // scroll container, and a threshold parked inside it can sit off-screen
    // while every score it governs is on-screen.
    await expect(page.locator("table").getByText(FLOOR_SCORE)).toHaveCount(0);
  });

  test("AC-3 marks on-chain agents as external and leaves seeded ones alone", async ({
    page,
  }) => {
    await mockApi(page);
    await page.goto("/app/agents");
    await registryLoaded(page);

    for (const id of [BOUND_ID, UNBOUND_ID, BELOW_FLOOR_ID]) {
      await expect(
        row(page, id).getByText(EXTERNAL_MARK).first(),
      ).toBeVisible();
    }

    // `agt_11c0` is seeded and `real: true`, while all three on-chain rows are
    // `real: false` — so anything that reads provenance off `real` marks the
    // exact opposite set. A buyer would be told the first-party catalog is
    // third-party code, and that every stranger's agent is ours.
    await expect(row(page, SEEDED_ID).getByText(EXTERNAL_MARK)).toHaveCount(0);
  });

  test("AC-4 marks the on-chain agent with no endpoint as not operational", async ({
    page,
  }) => {
    await mockApi(page);
    await page.goto("/app/agents");
    await registryLoaded(page);

    await expect(
      row(page, UNBOUND_ID).getByText(NOT_OPERATIONAL_MARK).first(),
    ).toBeVisible();

    // The two rows it must not spread to. `weather_bot` is on-chain and bound,
    // so the mark would be a lie; `agt_11c0` is seeded and has no endpoint to
    // bind at all, so the mark would condemn the whole first-party catalog —
    // the same mistake story 2.05 already had to design around.
    for (const id of [BOUND_ID, SEEDED_ID]) {
      await expect(row(page, id).getByText(NOT_OPERATIONAL_MARK)).toHaveCount(
        0,
      );
    }
  });

  test("AC-5 says scores are estimates when the chain reads failed", async ({
    page,
  }) => {
    await mockApi(page, { reputation: mockReputationBatchDegraded });
    await page.goto("/app/agents");
    await registryLoaded(page);

    // A degraded batch is the prior wearing a measurement's clothes: the
    // numbers render identically to real ones, so without this line a buyer
    // reads "3.50, on record" when the truth is "we could not reach the
    // ledger". It is stated once, for the page, because the condition is the
    // reputation service's and not any one agent's.
    const estimate = page.getByText(ESTIMATE_MARK);
    await expect(estimate).toHaveCount(1);
    await expect(estimate).toBeVisible();
    await expect(page.locator("table").getByText(ESTIMATE_MARK)).toHaveCount(0);
  });

  test("AC-5 does not cry degraded when the batch is healthy", async ({
    page,
  }) => {
    await mockApi(page);
    await page.goto("/app/agents");
    await registryLoaded(page);

    // The negative half is what gives the notice its meaning. A banner that is
    // always up is furniture, and the first real outage goes unread.
    await expect(page.getByText(ESTIMATE_MARK)).toHaveCount(0);
  });

  test("AC-6 keeps the below-floor agent's evidence on screen", async ({
    page,
  }) => {
    await mockApi(page);
    await page.goto("/app/agents");
    await registryLoaded(page);

    const rep = mockReputationBatch.reputations[BELOW_FLOOR_ID];
    const agent = mockAgents.find((a) => a.id === BELOW_FLOOR_ID);
    if (agent === undefined) throw new Error("missing below-floor fixture");
    const disputePct = rep.dispute_rate_bps / 100;

    // Excluded from routing is not erased from the market. The figures behind
    // the verdict — 24 rated jobs, 25% of them disputed, 41 lifetime runs —
    // are what let a buyer check it and an owner argue with it. Strip them and
    // the row says "no" with no way to ask why, which is indistinguishable
    // from the agent having no history at all.
    const evidence = row(page, BELOW_FLOOR_ID);
    await expect(evidence).toBeVisible();
    await expect(evidence).toContainText(new RegExp(`\\b${rep.count}\\b`));
    await expect(evidence).toContainText(
      new RegExp(`\\b${disputePct}(\\.0)?\\s*%`),
    );
    await expect(evidence).toContainText(new RegExp(`\\b${agent.runs}\\b`));
  });

  test("the standing filter narrows the registry to routable agents, and back", async ({
    page,
  }) => {
    await mockApi(page);
    await page.goto("/app/agents");
    await registryLoaded(page);

    // One control, sitting in the existing status-filter group, so exactly one
    // button answers to it — two would mean the page offers a buyer two
    // different definitions of routable.
    const routable = page.getByRole("button", { name: ROUTABLE_FILTER });
    await expect(routable).toHaveCount(1);
    await routable.click();

    // Both gates, in one count: `unbound_bot` clears the floor and has no
    // endpoint, `rated_down_bot` is bound and fails the floor. A filter that
    // implemented only one of them would still look like it worked — it would
    // just quietly offer the buyer an agent no plan can route to.
    await expect(page.getByRole("rowheader")).toHaveCount(ROUTABLE_IDS.length);
    for (const id of ROUTABLE_IDS) {
      await expect(row(page, id)).toBeVisible();
    }
    for (const id of UNROUTABLE_IDS) {
      await expect(row(page, id)).toHaveCount(0);
    }

    // And back: the filter is a view, not a deletion. An operator who cannot
    // get the excluded rows back cannot see the agent they came to fix.
    await page.getByRole("button", { name: /^all$/i }).click();
    await registryLoaded(page);
  });

  test("the degraded, filtered registry has no WCAG A/AA violations", async ({
    page,
  }) => {
    await mockApi(page, { reputation: mockReputationBatchDegraded });
    await page.goto("/app/agents");
    await registryLoaded(page);
    await expect(page.getByText(ESTIMATE_MARK).first()).toBeVisible();

    const routable = page.getByRole("button", { name: ROUTABLE_FILTER });
    await expect(routable).toHaveCount(1);
    await routable.click();

    // Narrowed, and never to nothing: a degraded read puts every score back on
    // the prior, whose lower bound clears the floor, so only the endpoint gate
    // still bites. Losing the ledger must not empty the marketplace.
    const rows = page.getByRole("rowheader");
    await expect(rows).not.toHaveCount(mockAgents.length);
    await expect(rows).not.toHaveCount(0);

    // `e2e/a11y.spec.ts` only ever sweeps this route in its default state, so
    // neither the degraded notice nor a filtered table has reached axe before.
    // Both are states where meaning is easy to leave in colour alone — an
    // estimate that only looks different, a filter whose selected option is
    // never announced — and a buyer using a screen reader would then be given
    // a prior as a measurement, with no way to tell which agents were hidden.
    const { violations } = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    expect(
      violations.map(
        (v) => `${v.id} [${v.impact}] ${v.nodes.length} node(s) — ${v.help}`,
      ),
    ).toEqual([]);
  });

  test("keeps the page-level notice inside a 390px viewport", async ({
    page,
  }) => {
    const WIDTH = 390;
    await mockApi(page);
    await page.setViewportSize({ width: WIDTH, height: 844 });
    await page.goto("/app/agents");
    await registryLoaded(page);

    // The registry table scrolls sideways at this width by design; the notice
    // that explains the whole table must not be part of that bargain. A floor
    // a buyer has to discover by dragging a table is a floor they never read,
    // and it is the only thing on the page that explains why rows are marked.
    const box = await page.getByText(FLOOR_SCORE).evaluate((el) => {
      // Measure the block that carries the notice, not the inline run holding
      // the number: an inline span wraps, so it fits inside the viewport even
      // when the element around it hangs off the edge.
      let node = el as HTMLElement;
      while (
        node.parentElement !== null &&
        getComputedStyle(node).display.startsWith("inline")
      ) {
        node = node.parentElement;
      }
      const rect = node.getBoundingClientRect();
      return { x: rect.x, width: rect.width };
    });
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(WIDTH);

    // Outside the scroll container, which is the structural half of the same
    // claim — a notice inside the table would satisfy the box check whenever
    // the table happens to start at x=0, and still scroll away on touch.
    await expect(page.locator("table").getByText(FLOOR_SCORE)).toHaveCount(0);

    // …and the page itself still does not scroll sideways. One pixel of slack
    // for sub-pixel layout rounding, as `e2e/agents-unbound.spec.ts` allows.
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });
});
