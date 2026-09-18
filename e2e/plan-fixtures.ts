import type { Page } from "@playwright/test";
import type { DecomposeResponse, StellarNetworkInfo } from "../lib/types";

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
