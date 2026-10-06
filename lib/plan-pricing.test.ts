import { describe, expect, it } from "vitest";

import {
  MIN_CAP_STROOPS,
  authorizeCap,
  planPricing,
  type PricedPlan,
} from "./plan-pricing";
import { unitsToStroops } from "./money";
import type { DecomposeResponse, PlanStep } from "./types";

const step = (over: Partial<PlanStep>): PlanStep => ({
  agent_id: "agt_11c0",
  rationale: "builds it",
  est_price_usdc: 0,
  est_eta_seconds: 1,
  ...over,
});

const plan = (over: Partial<DecomposeResponse>): DecomposeResponse => ({
  plan_id: "pln_0000aaaa",
  intent: "x",
  steps: [],
  total_usdc: 0,
  total_eta: 0,
  ...over,
});

const priced = (p: DecomposeResponse): PricedPlan => {
  const r = planPricing(p);
  if (r.kind !== "priced") throw new Error(`not priced: ${r.kind}`);
  return r;
};

describe("planPricing — a backend that prices in stroops", () => {
  const exact = plan({
    steps: [
      step({
        agent_id: "agt_09l5",
        price_stroops: 240_000,
        est_price_usdc: 0.024,
      }),
      step({
        agent_id: "agt_05x7",
        price_stroops: "90000",
        est_price_usdc: 0.009,
      }),
      step({
        agent_id: "agt_11c0",
        price_stroops: 540_000,
        est_price_usdc: 0.054,
      }),
    ],
    total_stroops: 870_000,
    total_usdc: 0.087,
    asset: { code: "XLM", issuer: null, decimals: 7 },
  });

  it("reads each step's stroops and totals them exactly", () => {
    const p = priced(exact);
    expect(p.steps).toEqual([240_000n, 90_000n, 540_000n]);
    expect(p.total).toBe(870_000n);
    expect(p.source).toBe("stroops");
  });

  it("authorizes exactly the total", () => {
    expect(priced(exact).cap).toBe(870_000n);
  });

  it("carries the plan's own asset", () => {
    expect(priced(exact).asset).toEqual({
      code: "XLM",
      issuer: null,
      decimals: 7,
    });
  });

  it("prefers stroops over a legacy float that disagrees with them", () => {
    const p = priced(
      plan({
        steps: [step({ price_stroops: 1_234_567, est_price_usdc: 0.123 })],
        total_stroops: 1_234_567,
      }),
    );
    expect(p.steps).toEqual([1_234_567n]);
  });

  it("refuses a plan whose stated total is not the sum of its steps", () => {
    const r = planPricing({ ...exact, total_stroops: 870_001 });
    expect(r).toEqual({
      kind: "mismatch",
      steps: [240_000n, 90_000n, 540_000n],
      stepsTotal: 870_000n,
      statedTotal: 870_001n,
      asset: exact.asset,
    });
  });

  it("totals amounts far past 2^53 without losing a stroop", () => {
    const huge = "90071992547409930000"; // > 2^53 stroops
    const p = priced(
      plan({
        steps: [step({ price_stroops: huge }), step({ price_stroops: 1 })],
        total_stroops: "90071992547409930001",
      }),
    );
    expect(p.total).toBe(90_071_992_547_409_930_001n);
  });
});

describe("planPricing — an older backend (legacy floats)", () => {
  it("converts each step as the backend's usdc_to_i128 does", () => {
    const p = priced(
      plan({
        steps: [step({ est_price_usdc: 0.1 }), step({ est_price_usdc: 0.2 })],
        total_usdc: 0.30000000000000004,
      }),
    );
    expect(p.steps).toEqual([1_000_000n, 2_000_000n]);
    expect(p.total).toBe(3_000_000n);
    expect(p.source).toBe("legacy");
  });

  it("authorizes the sum of the steps' stroops, not the float total", () => {
    // Three steps of 1.5 stroops each: the backend charges round(1.5) = 2
    // per step and refuses an authorization under 6; the float total rounds
    // to 4 — a cap the backend would refuse as not covering the plan.
    const p = priced(
      plan({
        steps: [0, 1, 2].map(() => step({ est_price_usdc: 0.00000015 })),
        total_usdc: 0.00000045,
      }),
    );
    expect(p.total).toBe(6n);
    expect(p.cap).toBe(6n);
  });

  it("has no asset of its own", () => {
    expect(
      priced(plan({ steps: [step({ est_price_usdc: 0.01 })] })).asset,
    ).toBe(null);
  });
});

describe("planPricing — edges", () => {
  it("prices an empty plan at zero, with the minimum cap", () => {
    const p = priced(plan({ steps: [] }));
    expect(p.total).toBe(0n);
    expect(p.cap).toBe(MIN_CAP_STROOPS);
  });

  it("gives a zero-priced plan the minimum positive cap", () => {
    const p = priced(
      plan({ steps: [step({ price_stroops: 0 })], total_stroops: 0 }),
    );
    expect(p.total).toBe(0n);
    expect(p.cap).toBe(MIN_CAP_STROOPS);
  });

  it("refuses a step whose price cannot be read", () => {
    const r = planPricing(
      plan({ steps: [step({ est_price_usdc: Number.NaN })] }),
    );
    expect(r).toEqual({ kind: "unpriced", stepIndex: 0 });
    const neg = planPricing(plan({ steps: [step({ est_price_usdc: -0.01 })] }));
    expect(neg.kind).toBe("unpriced");
  });

  it("mixes a stroop-priced step with a legacy one step by step", () => {
    const p = priced(
      plan({
        steps: [
          step({ price_stroops: 7 }),
          step({ price_stroops: undefined, est_price_usdc: 0.0000003 }),
        ],
      }),
    );
    expect(p.steps).toEqual([7n, 3n]);
    expect(p.source).toBe("mixed");
  });
});

describe("authorizeCap", () => {
  it("sends the cap as exact stroops and as a decimal that rounds back to them", () => {
    for (const cap of [
      1n,
      9n,
      10_000n,
      870_000n,
      1_234_567n,
      100_000_000_000n,
    ]) {
      const body = authorizeCap(cap);
      expect(body.max_amount_stroops).toBe(Number(cap));
      // The backend's usdc_to_i128: round(max_amount_usdc * 10_000_000).
      expect(unitsToStroops(body.max_amount_usdc)).toBe(cap);
    }
  });

  it("is the exact decimal of the stroops", () => {
    expect(authorizeCap(1n).max_amount_usdc).toBe(0.0000001);
    expect(authorizeCap(870_000n).max_amount_usdc).toBe(0.087);
  });
});
