import type { Page } from "@playwright/test";
import type { DecomposeResponse, StellarNetworkInfo } from "../lib/types";
import { mockPlanExcluded } from "./mocks";

/**
 * Plan-card fixtures for the Epic 3 hardening pass, kept apart from
 * e2e/mocks.ts so the shared defaults every other spec leans on stay put.
 *
 * The shared `mockApi` answers `GET /api/stellar/network` with its catch-all
 * `{}`, which the runtime guard rejects — so under it the card has no asset to
 * name, and prints amounts bare. That is the right rendering for an unknown
 * asset and the wrong one to use as evidence that the card names the real
 * unit, hence the network fixture below.
 */

/**
 * What GET /api/stellar/network answers on this sprint's testnet deployment.
 * `asset` is the field that matters: the escrow's SAC wraps the NATIVE asset,
 * so the cap a buyer signs is XLM — never USDC, whatever the plan's
 * `total_usdc` field is called. Contract ids are the deployed testnet ones.
 */
export const mockTestnetNetwork = {
  network: "testnet",
  rpc_url: "https://soroban-testnet.stellar.org",
  network_passphrase: "Test SDF Network ; September 2015",
  admin: "GA7AI5TA6QKZ2V6SWKFOQDQBLNJ4HRFG2PYBEXAMPLEPLATFORMXXXXX",
  contracts: {
    agent_registry: "CAPHXWU53UZUZJGV7IAE57NNMH3YYB5MTWO6YA53KKMXSFVLOITBJ3GQ",
    reputation_ledger:
      "CDCSOBEVZUPQZV5GV4D6KYHZCLNGW2KXY74RUHSZ3EZUXF34DPW422ZT",
    payment_escrow: "CBJPTMAPMGODGZCZ2IMEQSRUX3WGUXNMKDTNN2KMJ3NFGYZ5OJ5525PI",
    attestation_registry:
      "CBYUZKOET43UXTBXZUJIBBJW5ODGD2J2AZVVXCR3QONGOCAHOXQQHEGK",
  },
  asset: "native",
  asset_sac: "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
} satisfies StellarNetworkInfo;

/**
 * Serves a network payload over the shared mock. Call it AFTER `mockApi`:
 * Playwright tries routes in reverse registration order, so the later, more
 * specific route answers first and the catch-all never sees the request.
 */
export async function mockNetwork(
  page: Page,
  network: StellarNetworkInfo = mockTestnetNetwork,
): Promise<void> {
  await page.route("**/api/stellar/network", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(network),
    }),
  );
}

/**
 * Answers POST /api/orchestrator/decompose with each plan in turn — the last
 * one repeating — and records the intent every request asked for. Call it
 * AFTER `mockApi`, for the same reason as `mockNetwork`.
 *
 * The record is the point: it is how a spec proves a retry asked the planner
 * the same thing again, rather than whatever the intent box says by then.
 */
export async function mockDecomposeSequence(
  page: Page,
  plans: readonly DecomposeResponse[],
): Promise<string[]> {
  const asked: string[] = [];
  await page.route("**/api/orchestrator/decompose", (route) => {
    const { intent } = route.request().postDataJSON() as { intent: string };
    asked.push(intent);
    const plan = plans[Math.min(asked.length, plans.length) - 1];
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(plan),
    });
  });
  return asked;
}

/**
 * A plan whose steps carry the per-step reputation evidence the backend now
 * stamps (`rep_lower_bound_bps`, `rep_count`, `rep_dispute_rate_bps`,
 * `rep_degraded`), one step per thing the badge has to say. Figures follow
 * the table in e2e/mocks.ts, so each is what lib/reputation-math.ts returns
 * for the stated evidence:
 *
 *   - `design.figma` carries a dispute history — the count and rate a
 *     listener has to hear, not only a sighted buyer scanning the chip.
 *   - `scrape.fast` is the lower-bound case. Its headline is 5750 (2.88),
 *     ABOVE the 2.75 floor, and its bound is 5283 (2.64), below it. Routing
 *     gates on the bound, so the backstop had to re-admit it, and the chip
 *     has to say below-floor beside a score that looks like it clears.
 *   - `code.next`'s read FAILED, so it carries the prior (7000, bound 5677)
 *     in place of its real record. That is not a cold start, and the chip
 *     must not call it one.
 *
 * `reputation_degraded` is true because of `code.next`, which puts the
 * estimate banner — and the Authorize description pointing at it — on screen.
 */
export const mockPlanStepEvidence = {
  plan_id: "plan_e2e_evidence",
  intent: "scrape, design and build a pricing page",
  steps: [
    {
      agent_id: "seo.brief",
      agent_name: "seo.brief",
      rationale: "outline requirements and keywords",
      est_price_usdc: 0.009,
      est_eta_seconds: 1.2,
      rep_bps: 8714,
      rep_source: "onchain",
      rep_lower_bound_bps: 8197,
      rep_count: 31,
      rep_dispute_rate_bps: 0,
      rep_degraded: false,
    },
    {
      agent_id: "design.figma",
      agent_name: "design.figma",
      rationale: "produce the interface layout",
      est_price_usdc: 0.048,
      est_eta_seconds: 2.4,
      rep_bps: 7960,
      rep_source: "onchain",
      rep_lower_bound_bps: 7224,
      // One disputed job in twelve: 833 bps, which the chip reads as 8.3%.
      rep_count: 12,
      rep_dispute_rate_bps: 833,
      rep_degraded: false,
    },
    {
      agent_id: "scrape.fast",
      agent_name: "scrape.fast",
      rationale: "collect competitor pricing",
      est_price_usdc: 0.052,
      est_eta_seconds: 2.0,
      rep_bps: 5750,
      rep_source: "onchain",
      rep_lower_bound_bps: 5283,
      rep_count: 40,
      rep_dispute_rate_bps: 0,
      rep_degraded: false,
      // Re-admitted below the floor by the starvation backstop.
      degraded: true,
    },
    {
      agent_id: "code.next",
      agent_name: "code.next",
      rationale: "implement and wire up the page",
      est_price_usdc: 0.066,
      est_eta_seconds: 3.1,
      // The prior, served because the ledger read failed: a failed read
      // yields no evidence, so there is no count and no dispute rate.
      rep_bps: 7000,
      rep_source: "prior",
      rep_lower_bound_bps: 5677,
      rep_count: 0,
      rep_dispute_rate_bps: 0,
      rep_degraded: true,
    },
  ],
  total_usdc: 0.175,
  total_eta: 8.7,
  floor_bps: 5500,
  reputation_degraded: true,
  notices: [
    {
      kind: "degraded",
      agent_id: "scrape.fast",
      agent_name: "scrape.fast",
      reason:
        "re-admitted below the floor to keep the plan workable (fewer than 3 agents cleared it)",
      reason_code: "floor_relaxed",
      lower_bound_bps: 5283,
      floor_bps: 5500,
    },
  ],
} satisfies DecomposeResponse;

/** The sentence the backend attaches to every unbound notice
 *  (`_UNBOUND_REASON` in the backend's app/services/plan_notices.py). */
const UNBOUND_REASON =
  "registered on-chain but no endpoint bound (nothing to dispatch a step to, so the planner passed it over)";

/**
 * A plan built while registered agents sat unbound — which, with
 * permissionless registration, is most plans: the backend names up to eight
 * unbound on-chain agents on every one. Here there are three, beside a single
 * genuine floor exclusion.
 *
 * Unbound notices arrive as `kind: "excluded"` with `lower_bound_bps: null`,
 * and neither fact is a floor verdict. The agent was never a candidate, so its
 * standing was never consulted — which is why its bound is null, not because
 * it has no ratings. The card has to count one floor action here, not four,
 * and describe the other three without a verdict.
 */
export const mockPlanUnbound = {
  ...mockPlanExcluded,
  plan_id: "plan_e2e_unbound",
  notices: [
    mockPlanExcluded.notices[0],
    ...["unbound_bot", "ledger.watch", "summarize.pro"].map((agentId) => ({
      kind: "excluded" as const,
      agent_id: agentId,
      agent_name: agentId,
      reason: UNBOUND_REASON,
      reason_code: "unbound_endpoint" as const,
      lower_bound_bps: null,
      floor_bps: 5500,
    })),
  ],
} satisfies DecomposeResponse;

/**
 * A plan the backend served WITHOUT the planner. The LLM planner failed or
 * answered with nothing usable, so the free-form path fell back to one step
 * from its shortlist: the preferred copywriter (`agt_01h8`, `copywrite.v3`),
 * carrying the rationale the backend stamps on it (`_fallback_agent` and the
 * empty-plan branch of `decompose` in the backend's
 * app/services/orchestrator_svc.py).
 *
 * The fallback is still a routing decision, so the agent cleared the floor
 * like any planned step; its figures follow the table in e2e/mocks.ts (9400
 * over 30 USDC → 8714, bound 8197). Nothing was excluded from the shortlist,
 * so the exclusions panel stays off the card and the fallback notice is the
 * only thing between the step and the pay panel.
 *
 * The intent matches no demo kit on purpose: kit plans never set the flag.
 */
export const mockPlanPlannerFallback = {
  plan_id: "plan_e2e_fallback",
  intent: "write a launch announcement for a budgeting app",
  steps: [
    {
      agent_id: "agt_01h8",
      agent_name: "copywrite.v3",
      rationale: "fallback: generate copy for the intent",
      est_price_usdc: 0.012,
      est_eta_seconds: 0.8,
      rep_bps: 8714,
      rep_source: "onchain",
      rep_lower_bound_bps: 8197,
      rep_count: 31,
      rep_dispute_rate_bps: 0,
      rep_degraded: false,
      degraded: false,
    },
  ],
  total_usdc: 0.012,
  total_eta: 0.8,
  notices: [],
  floor_bps: 5500,
  reputation_degraded: false,
  planner_fallback: true,
} satisfies DecomposeResponse;

/**
 * The same fallback, built while the copywriter's reputation read failed —
 * so both notices sit above Authorize at once, which is the case its
 * description has to compose rather than choose between. The step carries
 * the prior (7000, bound 5677) in place of its record, and a failed read
 * yields no evidence, so no count and no dispute rate.
 */
export const mockPlanPlannerFallbackUnread = {
  ...mockPlanPlannerFallback,
  plan_id: "plan_e2e_fallback_unread",
  steps: [
    {
      ...mockPlanPlannerFallback.steps[0],
      rep_bps: 7000,
      rep_source: "prior",
      rep_lower_bound_bps: 5677,
      rep_count: 0,
      rep_dispute_rate_bps: 0,
      rep_degraded: true,
    },
  ],
  reputation_degraded: true,
} satisfies DecomposeResponse;

/**
 * What asking the planner again returns once it answers: its own plan for the
 * SAME intent, with the flag explicitly false. Two steps rather than one, so
 * the swap is visible on the card as well as in the missing notice. Figures
 * follow the table in e2e/mocks.ts.
 */
export const mockPlanPlannerAnswered = {
  plan_id: "plan_e2e_planned",
  intent: mockPlanPlannerFallback.intent,
  steps: [
    {
      agent_id: "seo.brief",
      agent_name: "seo.brief",
      rationale: "outline the announcement's audience and key messages",
      est_price_usdc: 0.009,
      est_eta_seconds: 1.2,
      rep_bps: 8714,
      rep_source: "onchain",
      rep_lower_bound_bps: 8197,
      rep_count: 31,
      rep_dispute_rate_bps: 0,
      rep_degraded: false,
    },
    {
      ...mockPlanPlannerFallback.steps[0],
      rationale: "write the announcement from the outline",
      est_eta_seconds: 2.6,
    },
  ],
  total_usdc: 0.021,
  total_eta: 3.8,
  notices: [],
  floor_bps: 5500,
  reputation_degraded: false,
  planner_fallback: false,
} satisfies DecomposeResponse;
