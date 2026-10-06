/**
 * Exact pricing, end to end against a MOCKED backend on the pricing
 * contract: the plan card's per-step and total prices, the amount sent to
 * the wallet's authorization, and the receipt's reconciliation all agree to
 * the stroop — and a multi-agent plan reads as the pipeline it is.
 */
import AxeBuilder from "@axe-core/playwright";
import { test, expect, type Page } from "@playwright/test";
import type { DecomposeResponse, SettlementStepView } from "../lib/types";
import { stroopsToDecimal } from "../lib/money";
import { disputeScan } from "./dispute-axe";
import {
  mockApi,
  mockDisputeApi,
  mockDisputeTaskId,
  mockSettlementView,
  mockTaskReadToken,
  mockTraceStream,
  mockWallet,
} from "./mocks";
import { motionSettled } from "./motion-settled";
import {
  escrowV2Pin,
  mockDecomposeSequence,
  mockEscrowV2Network,
  mockNetwork,
  overflowingDescendants,
} from "./plan-fixtures";

/** A five-agent pipeline priced in stroops, one price with all seven
 *  places, so a card that rounded anywhere would show it. */
const PIPELINE: DecomposeResponse = {
  plan_id: "pln_e2e_exact",
  intent: "a landing page for a coffee roaster",
  steps: [
    [
      "agt_09l5",
      "research.pro",
      240_000,
      "researches the market, hands a brief to seo.brief",
    ],
    [
      "agt_05x7",
      "seo.brief",
      90_000,
      "turns the brief into keywords for the copy",
    ],
    [
      "agt_01h8",
      "copywrite.v3",
      123_457,
      "writes the page copy from the keywords",
    ],
    ["agt_11c0", "code.gen", 540_000, "builds the page from the copy"],
    ["agt_12r0", "code.critic", 520_000, "reviews the build for accessibility"],
  ].map(([agent_id, agent_name, price, rationale]) => ({
    agent_id: agent_id as string,
    agent_name: agent_name as string,
    rationale: rationale as string,
    price_stroops: price as number,
    est_price_usdc: (price as number) / 1e7,
    est_eta_seconds: 2,
  })),
  // 0.1513457: the float total would be 0.15134570000000002.
  total_stroops: 1_513_457,
  total_usdc: 0.1513457,
  asset: { code: "XLM", issuer: null, decimals: 7 },
  total_eta: 10,
};

const STEP_FIGURES = [
  "0.024 XLM",
  "0.009 XLM",
  "0.0123457 XLM",
  "0.054 XLM",
  "0.052 XLM",
];

async function openPlan(page: Page, plan: DecomposeResponse = PIPELINE) {
  await mockWallet(page);
  await mockApi(page);
  // The escrow this build pins, so the card asks for a signature at all: a
  // backend reporting any other escrow pauses on-chain payment.
  await mockNetwork(page, escrowV2Pin ? mockEscrowV2Network : undefined);
  await mockDecomposeSequence(page, [plan]);
  await page.goto("/app/orchestrator");
  await page.getByRole("textbox", { name: /intent/i }).fill(plan.intent);
  await page.getByRole("button", { name: /decompos/i }).click();
  await expect(page.locator("[data-plan-total]")).toBeVisible();
}

/** The website pipeline at its longest: six specialists, one handing to the
 *  next, as the planner now composes them. */
const SIX: DecomposeResponse = {
  ...PIPELINE,
  plan_id: "pln_e2e_six",
  steps: [
    ...PIPELINE.steps.slice(0, 3),
    {
      agent_id: "agt_02k2",
      agent_name: "design.figma",
      rationale: "turns the copy into layout tokens for the build",
      price_stroops: 180_000,
      est_price_usdc: 0.018,
      est_eta_seconds: 2,
    },
    ...PIPELINE.steps.slice(3),
  ],
  total_stroops: 1_693_457,
  total_usdc: 0.1693457,
};

test.describe("exact pricing · the plan card", () => {
  test("prints every step and the total to the stroop, in XLM", async ({
    page,
  }) => {
    await openPlan(page);
    await expect(page.locator("[data-step-price]")).toHaveText(STEP_FIGURES);
    await expect(page.getByText(/Freighter will prompt/i)).toContainText(
      "0.1513457 XLM",
    );
    await expect(page.getByRole("main")).not.toContainText("USDC");
  });

  test("authorizes exactly the plan's total", async ({ page }) => {
    const bodies: Record<string, unknown>[] = [];
    await openPlan(page);
    await page.route("**/api/stellar/build/authorize", (route) => {
      bodies.push(route.request().postDataJSON());
      return route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({ detail: "build_failed" }),
      });
    });
    await page.getByRole("button", { name: /authorize/i }).click();
    await expect.poll(() => bodies.length).toBe(1);
    expect(bodies[0].max_amount_stroops).toBe(PIPELINE.total_stroops);
    // The legacy decimal an older backend reads rounds back to the same.
    expect(Math.round((bodies[0].max_amount_usdc as number) * 1e7)).toBe(
      PIPELINE.total_stroops,
    );
    expect(bodies[0].agent_id).toBe(PIPELINE.plan_id);
  });

  test("reads as a pipeline: the order, and where each output goes", async ({
    page,
  }) => {
    await openPlan(page);
    await expect(page.getByText("pipeline · 5 agents in order")).toBeVisible();
    await expect(page.locator("[data-pipeline-agent]")).toHaveText([
      "research.pro",
      "seo.brief",
      "copywrite.v3",
      "code.gen",
      "code.critic",
    ]);
    await expect(page.getByText(/hands its output to step/)).toHaveText([
      "↓ hands its output to step 02",
      "↓ hands its output to step 03",
      "↓ hands its output to step 04",
      "↓ hands its output to step 05",
    ]);
    await motionSettled(page.locator("main"));
    const { violations } = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });

  test("lays six steps out at 360px: every agent in order, nothing cut off", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await openPlan(page, SIX);
    await expect(page.locator("[data-plan-total]")).toHaveText("0.1693457 XLM");
    await expect(page.getByText("pipeline · 6 agents in order")).toBeVisible();
    const chips = page.locator("[data-pipeline-agent]");
    await expect(chips).toHaveCount(6);
    // Inside the width, whatever row each wraps onto.
    for (const chip of await chips.all()) {
      const box = await chip.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(360);
    }
    await expect(page.getByText(/hands its output to step/)).toHaveCount(5);
    await motionSettled(page.locator("main"));
    const card = page
      .getByRole("heading", { name: /execution plan/i })
      .locator("xpath=ancestor::div[contains(@class,'glow-card')][1]");
    expect(await overflowingDescendants(card)).toEqual([]);
    const sideways = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(sideways).toBeLessThanOrEqual(0);
  });

  test("names each step's real sources when the planner states them", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    const sources = [null, [1], [1, 2], [3], [4]];
    await openPlan(page, {
      ...PIPELINE,
      steps: PIPELINE.steps.map((s, i) => ({ ...s, inputs_from: sources[i] })),
    });
    await expect(page.getByText(/uses output from/)).toHaveText([
      "↑ uses output from step 01",
      "↑ uses output from steps 01 and 02",
      "↑ uses output from step 03",
      "↑ uses output from step 04",
    ]);
    await expect(page.getByText(/hands its output/)).toHaveCount(0);
    await motionSettled(page.locator("main"));
    const card = page
      .getByRole("heading", { name: /execution plan/i })
      .locator("xpath=ancestor::div[contains(@class,'glow-card')][1]");
    expect(await overflowingDescendants(card)).toEqual([]);
  });

  for (const width of [360, 768, 1920]) {
    test(`keeps the pipeline card inside a ${width}px screen`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await openPlan(page);
      await motionSettled(page.locator("main"));
      const card = page
        .getByRole("heading", { name: /execution plan/i })
        .locator("xpath=ancestor::div[contains(@class,'glow-card')][1]");
      expect(await overflowingDescendants(card)).toEqual([]);
    });
  }
});

/** The Orizon platform treasury: every built-in agent's on-chain owner. */
const TREASURY = "GDOGIRT73NAQ7VRCIOK7G76EK7MAOC55EDT5GG4EKRE4VPVWSWG7KSP3";

/** An exact amount as the backend sends it: stroops, and its display. */
const amt = (stroops: number) => ({
  stroops,
  display: stroopsToDecimal(BigInt(stroops)),
});

/** The receipt of that pipeline run: copywrite.v3 did not deliver, and
 *  seo.brief is a platform agent nobody could pay. */
const STEPS: SettlementStepView[] = PIPELINE.steps.map((s, i) => {
  const price = s.price_stroops as number;
  const paid = i === 1 || i === 2 ? 0 : price;
  return {
    step_index: i,
    agent_id: s.agent_id,
    agent_name: s.agent_name ?? null,
    price_usdc: price / 1e7,
    delivered: i !== 2,
    creditable_usdc: paid / 2 / 1e7,
    output_summary: null,
    paid_usdc: paid / 1e7,
    unpaid_reason: i === 1 ? "no_onchain_owner" : null,
    planned: amt(price),
    charged: amt(paid),
    returned: amt(price - paid),
    // Built-in agents are owned on-chain by the platform treasury.
    payee: paid > 0 ? TREASURY : null,
    payee_role: paid > 0 ? "platform_treasury" : null,
  };
});

async function openReceipt(page: Page) {
  const settlement = {
    ...mockSettlementView({ settledAtS: Math.floor(Date.now() / 1000) - 3600 }),
    steps: STEPS,
    settled_usdc: 0.13,
    returned_usdc: 0.0213457,
    totals: {
      authorized: amt(1_513_457),
      planned: amt(1_513_457),
      charged: amt(1_300_000),
      returned: amt(213_457),
      surplus: amt(0),
    },
    asset: { code: "XLM", issuer: null, decimals: 7 },
  };
  await mockTaskReadToken(page);
  await mockWallet(page);
  await mockApi(page);
  await mockNetwork(page);
  await mockTraceStream(page, mockDisputeTaskId);
  await mockDisputeApi(page, { settlement, settlementState: "settled" });
  await page.goto(`/app/trace?task=${mockDisputeTaskId}`);
  return settlement;
}

test.describe("exact pricing · the receipt's reconciliation", () => {
  test("reconciles planned, charged and returned, and the totals add up", async ({
    page,
  }) => {
    const settlement = await openReceipt(page);
    const table = page.getByRole("table");
    await expect(table).toBeVisible();
    const total = table.locator("tfoot tr");
    await expect(total.locator("td")).toHaveText([
      "0.1513457",
      "0.130",
      "0.0213457",
    ]);
    await expect(table.locator("caption")).toContainText("in XLM");
    await expect(
      page.getByText("Charged plus returned equals planned, to the stroop."),
    ).toBeVisible();
    await expect(page.getByText("Authorized 0.1513457 XLM")).toBeVisible();
    await expect(
      page.getByRole("link", {
        name: /view the settlement that paid and returned on stellar\.expert/i,
      }),
    ).toHaveAttribute(
      "href",
      `https://stellar.expert/explorer/testnet/tx/${settlement.charge_tx}`,
    );
    expect(await disputeScan(page)).toEqual([]);
  });

  test("says each payout went to the platform treasury, and links it", async ({
    page,
  }) => {
    await openReceipt(page);
    const research = page
      .getByRole("region", { name: "Receipt" })
      .getByRole("listitem")
      .filter({ hasText: "research.pro" });
    await expect(research).toContainText(
      "paid 0.024 XLM to the Orizon platform treasury",
    );
    await expect(
      research.getByRole("link", {
        name: "view step 1 payee on stellar.expert",
      }),
    ).toHaveAttribute(
      "href",
      `https://stellar.expert/explorer/testnet/account/${TREASURY}`,
    );
    expect(await disputeScan(page)).toEqual([]);
  });

  test("keeps the reconciliation inside a 360px screen", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await openReceipt(page);
    await expect(page.getByRole("table")).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    expect(
      await overflowingDescendants(
        page.getByRole("region", { name: "Receipt" }),
      ),
    ).toEqual([]);
  });
});

test.describe("the pipeline in the run's trace and the plan's notices", () => {
  test("marks each handoff line in the trace", async ({ page }) => {
    await mockTaskReadToken(page);
    await mockApi(page);
    await mockNetwork(page);
    await mockTraceStream(page, mockDisputeTaskId, [
      { t: "00.000", level: "input", msg: "intent received → 'landing page'" },
      { t: "00.400", level: "exec", msg: "research.pro → brief drafted" },
      {
        t: "00.500",
        level: "exec",
        msg: "seo.brief uses output from: research.pro",
      },
      { t: "00.900", level: "exec", msg: "seo.brief → keywords drafted" },
      { t: "01.000", level: "out", msg: "workflow settled" },
    ]);
    await mockDisputeApi(page, { settlement: null, settlementState: null });
    await page.goto(`/app/trace?task=${mockDisputeTaskId}`);
    const handoff = page
      .getByText("seo.brief uses output from: research.pro")
      .locator("xpath=..");
    await expect(handoff).toContainText("handoff");
    await expect(
      page.getByText("research.pro → brief drafted"),
    ).not.toContainText("handoff");
  });

  test("says in plain words that operator agents were left out", async ({
    page,
  }) => {
    await mockWallet(page);
    await mockApi(page);
    await mockNetwork(page);
    await mockDecomposeSequence(page, [
      {
        ...PIPELINE,
        floor_bps: 5500,
        notices: [
          {
            kind: "excluded",
            agent_id: "acme_writer",
            agent_name: "acme.writer",
            reason: "external agents are not routed",
            reason_code: "external_not_routed",
            lower_bound_bps: null,
            floor_bps: 5500,
          },
        ],
      },
    ]);
    await page.goto("/app/orchestrator");
    await page.getByRole("textbox", { name: /intent/i }).fill(PIPELINE.intent);
    await page.getByRole("button", { name: /decompos/i }).click();
    await expect(page.getByRole("main")).toContainText(
      "1 operator agent was left out: plans use only the platform's own agents for now",
    );
    await page.getByText(/Reputation floor ·/).click();
    await expect(page.getByRole("main")).toContainText(
      "Plans currently use only the platform's own agents, so this operator's agent was not considered.",
    );
  });
});
