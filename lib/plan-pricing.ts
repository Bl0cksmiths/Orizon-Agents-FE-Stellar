/**
 * What a plan costs, exactly: each step's price, the total, and the cap the
 * buyer's wallet authorizes — all integer stroops, from one reading of the
 * plan, so the card, the authorize request and the funds check cannot
 * disagree.
 *
 * A backend on the pricing contract sends `price_stroops` per step,
 * `total_stroops = sum(price_stroops)` and the plan's `asset`. One that
 * predates it sends only the legacy floats, converted step by step exactly as
 * the backend converts them (`usdc_to_i128`). Either way the total is the SUM
 * OF THE STEPS — what escrow v2 checks an authorization against
 * (`plan_total > auth.max_amount` refuses the run) — never the legacy
 * `total_usdc`, a float sum that can round a stroop under it.
 */
import {
  knownAsset,
  parseStroops,
  stroopsToDecimal,
  unitsToStroops,
  type PlanAsset,
} from "./money";
import type { DecomposeResponse } from "./types";

export type PricedPlan = {
  kind: "priced";
  /** Each step's price, in plan order. */
  steps: bigint[];
  /** The sum of `steps`: what the plan costs. */
  total: bigint;
  /** What the wallet authorizes: exactly `total` — or null for a plan
   *  priced at zero, which has nothing to authorize. The backend refuses any
   *  other amount (409 `authorization_amount_mismatch`) and a non-positive
   *  one, and a stand-in cap would lock custody no step is paid from. */
  cap: bigint | null;
  /** The plan's own asset, or null when the backend did not name one (the
   *  network route's asset names the unit then). */
  asset: PlanAsset | null;
  /** Where the figures came from: the exact fields, the legacy floats, or
   *  some of each. */
  source: "stroops" | "legacy" | "mixed";
};

export type PlanPricing =
  | PricedPlan
  /** The backend's `total_stroops` is not the sum of its steps: the card
   *  cannot say what the buyer would be paying for, so nothing is signed. */
  | {
      kind: "mismatch";
      /** Each step's price, read as for a priced plan. */
      steps: bigint[];
      stepsTotal: bigint;
      statedTotal: bigint;
      asset: PlanAsset | null;
    }
  /** A step's price could not be read at all. */
  | { kind: "unpriced"; stepIndex: number };

export function planPricing(plan: DecomposeResponse): PlanPricing {
  const steps: bigint[] = [];
  let exact = 0;
  for (const [i, s] of plan.steps.entries()) {
    const fromStroops = parseStroops(s.price_stroops);
    if (fromStroops !== null) {
      exact += 1;
      steps.push(fromStroops);
      continue;
    }
    const fromUnits =
      typeof s.est_price_usdc === "number"
        ? unitsToStroops(s.est_price_usdc)
        : null;
    if (fromUnits === null) return { kind: "unpriced", stepIndex: i };
    steps.push(fromUnits);
  }
  const total = steps.reduce((a, b) => a + b, 0n);
  const asset = knownAsset(plan.asset);
  const stated = parseStroops(plan.total_stroops);
  if (stated !== null && stated !== total) {
    return {
      kind: "mismatch",
      steps,
      stepsTotal: total,
      statedTotal: stated,
      asset,
    };
  }
  return {
    kind: "priced",
    steps,
    total,
    cap: total > 0n ? total : null,
    asset,
    source:
      exact === steps.length && (steps.length > 0 || stated !== null)
        ? "stroops"
        : exact === 0
          ? "legacy"
          : "mixed",
  };
}

/**
 * The cap as `POST /stellar/build/authorize` takes it: the exact stroops, and
 * the legacy decimal an older backend reads instead. The decimal is parsed
 * from `stroopsToDecimal`, so it is the double nearest the exact figure, and
 * `round(x * 10_000_000)` on the backend gives back the same stroops for
 * every cap it accepts (up to 10,000 units, far inside 2^53).
 */
export function authorizeCap(cap: bigint): {
  max_amount_usdc: number;
  max_amount_stroops: number;
} {
  return {
    max_amount_usdc: Number(stroopsToDecimal(cap)),
    max_amount_stroops: Number(cap),
  };
}
