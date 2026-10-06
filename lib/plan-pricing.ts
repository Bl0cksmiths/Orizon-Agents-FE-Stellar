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
  parseStroops,
  stroopsToDecimal,
  unitsToStroops,
  type PlanAsset,
} from "./money";
import type { DecomposeResponse } from "./types";

/**
 * The smallest cap an authorization is signed for (0.001 of a unit). A plan
 * priced at zero still needs a positive cap: the backend refuses a
 * non-positive `max_amount`. Nothing of it is paid out — a run settles only
 * its steps' prices — and the escrow returns it all.
 */
export const MIN_CAP_STROOPS = 10_000n;

export type PricedPlan = {
  kind: "priced";
  /** Each step's price, in plan order. */
  steps: bigint[];
  /** The sum of `steps`: what the plan costs. */
  total: bigint;
  /** What the wallet authorizes: `total`, or `MIN_CAP_STROOPS` at zero. */
  cap: bigint;
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
  const asset = plan.asset ?? null;
  const stated = parseStroops(plan.total_stroops);
  if (stated !== null && stated !== total) {
    return { kind: "mismatch", stepsTotal: total, statedTotal: stated, asset };
  }
  return {
    kind: "priced",
    steps,
    total,
    cap: total > 0n ? total : MIN_CAP_STROOPS,
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
