import { describe, expect, it } from "vitest";

import { reconcileSettlement } from "./reconcile";
import type { SettlementStepView, SettlementView } from "./types";

const step = (
  i: number,
  over: Partial<SettlementStepView> = {},
): SettlementStepView => ({
  step_index: i,
  agent_id: `agt_${i}`,
  agent_name: `agent ${i}`,
  price_usdc: 0,
  delivered: true,
  creditable_usdc: 0,
  output_summary: null,
  ...over,
});

const settlement = (over: Partial<SettlementView> = {}): SettlementView => ({
  job_id_hex: "ab".repeat(16),
  payer: "GPAYER",
  settled_at: 1,
  window_closes_at: 2,
  settled_usdc: 0,
  charge_tx: "a".repeat(64),
  proof_tx: null,
  steps: [],
  policy: {
    credited_fraction: 0.5,
    funded_by: "platform",
    adjudicated_by: "platform",
  },
  ...over,
});

/** A v2 settlement on the pricing contract: three steps, the second
 *  undelivered, the first a platform agent nobody could pay. */
const exact = settlement({
  steps: [
    step(0, {
      price_stroops: 90_000,
      paid_stroops: 0,
      returned_stroops: 90_000,
    }),
    step(1, {
      delivered: false,
      price_stroops: 120_000,
      paid_stroops: 0,
      returned_stroops: 120_000,
    }),
    step(2, {
      price_stroops: 540_000,
      paid_stroops: 540_000,
      returned_stroops: 0,
    }),
  ],
  authorized_stroops: 750_000,
  settled_stroops: 540_000,
  returned_stroops: 210_000,
  settled_usdc: 0.054,
  asset: { code: "XLM", issuer: null, decimals: 7 },
});

describe("reconcileSettlement — a settlement on the pricing contract", () => {
  const r = reconcileSettlement(exact, "settled");

  it("lists planned, charged and returned per step in stroops", () => {
    expect(r?.rows.map((x) => [x.planned, x.charged, x.returned])).toEqual([
      [90_000n, 0n, 90_000n],
      [120_000n, 0n, 120_000n],
      [540_000n, 540_000n, 0n],
    ]);
  });

  it("totals each column, and the totals add up", () => {
    expect(r?.planned).toBe(750_000n);
    expect(r?.charged).toBe(540_000n);
    expect(r?.returned).toBe(210_000n);
    expect(r?.authorized).toBe(750_000n);
    expect(r?.balanced).toBe(true);
    expect(r?.issues).toEqual([]);
  });

  it("carries the asset and the settlement transaction", () => {
    expect(r?.asset).toEqual({ code: "XLM", issuer: null, decimals: 7 });
    expect(r?.settleTx).toBe("a".repeat(64));
    expect(r?.exact).toBe(true);
  });

  it("flags a step whose charge and return do not make its price", () => {
    const off = reconcileSettlement(
      {
        ...exact,
        steps: [
          step(0, {
            price_stroops: 100,
            paid_stroops: 60,
            returned_stroops: 39,
          }),
        ],
        authorized_stroops: 100,
        settled_stroops: 60,
        returned_stroops: 39,
      },
      "settled",
    );
    expect(off?.balanced).toBe(false);
    expect(off?.rows[0].balanced).toBe(false);
    expect(off?.issues).toContain("step 1: charged + returned ≠ planned");
  });

  it("flags totals that disagree with the settlement's own", () => {
    const off = reconcileSettlement(
      { ...exact, settled_stroops: 540_001 },
      "settled",
    );
    expect(off?.balanced).toBe(false);
    expect(off?.issues).toContain(
      "the steps' charges do not sum to the settlement's total",
    );
  });

  it("shows a return above the steps' prices as the authorization's headroom", () => {
    // A plan priced at zero still authorizes the minimum cap: the escrow
    // returns all of it, and that is more than the steps' returns.
    const r0 = reconcileSettlement(
      {
        ...exact,
        steps: [
          step(0, { price_stroops: 0, paid_stroops: 0, returned_stroops: 0 }),
        ],
        authorized_stroops: 10_000,
        settled_stroops: 0,
        returned_stroops: 10_000,
      },
      "settled",
    );
    expect(r0?.headroom).toBe(10_000n);
    expect(r0?.balanced).toBe(true);
  });

  it("handles amounts past 2^53 exactly", () => {
    const big = "90071992547409930001";
    const r1 = reconcileSettlement(
      {
        ...exact,
        steps: [
          step(0, {
            price_stroops: big,
            paid_stroops: big,
            returned_stroops: 0,
          }),
        ],
        authorized_stroops: big,
        settled_stroops: big,
        returned_stroops: 0,
      },
      "settled",
    );
    expect(r1?.charged).toBe(90_071_992_547_409_930_001n);
    expect(r1?.balanced).toBe(true);
  });
});

describe("reconcileSettlement — an older backend", () => {
  // Escrow v2 with only the floats: converted as the backend converts them,
  // and each step's return is its price less its payout.
  const legacy = settlement({
    steps: [
      step(0, {
        price_usdc: 0.009,
        paid_usdc: 0,
        unpaid_reason: "no_onchain_owner",
      }),
      step(1, { price_usdc: 0.054, paid_usdc: 0.054 }),
      step(2, { delivered: false, price_usdc: 0.014, paid_usdc: 0 }),
    ],
    settled_usdc: 0.054,
    returned_usdc: 0.023,
  });

  it("derives each step's return from its price and payout", () => {
    const r = reconcileSettlement(legacy, "settled");
    expect(r?.rows.map((x) => x.returned)).toEqual([90_000n, 0n, 140_000n]);
    expect(r?.planned).toBe(770_000n);
    expect(r?.charged).toBe(540_000n);
    expect(r?.returned).toBe(230_000n);
    expect(r?.balanced).toBe(true);
    expect(r?.exact).toBe(false);
  });

  it("is not drawn for a v1 settlement, which reports no payouts", () => {
    const v1 = settlement({ steps: [step(0, { price_usdc: 0.054 })] });
    expect(reconcileSettlement(v1, "settled")).toBeNull();
    expect(reconcileSettlement(v1, undefined)).toBeNull();
  });
});

describe("reconcileSettlement — by settlement state", () => {
  it("returns every step's price when the settlement released the custody", () => {
    const r = reconcileSettlement(
      settlement({
        steps: [
          step(0, { price_stroops: 5, delivered: false }),
          step(1, { price_stroops: 7, delivered: false }),
        ],
      }),
      "released",
    );
    expect(r?.charged).toBe(0n);
    expect(r?.returned).toBe(12n);
    expect(r?.balanced).toBe(true);
  });

  it("states nothing as charged or returned while the settlement is unconfirmed", () => {
    const r = reconcileSettlement(exact, "unconfirmed");
    expect(r?.charged).toBeNull();
    expect(r?.returned).toBeNull();
    expect(r?.balanced).toBeNull();
    expect(
      r?.rows.every((x) => x.charged === null && x.returned === null),
    ).toBe(true);
  });

  it("states nothing as returned when the settlement failed: the custody is held", () => {
    const r = reconcileSettlement(exact, "failed");
    expect(r?.charged).toBe(0n);
    expect(r?.returned).toBeNull();
    expect(r?.held).toBe(true);
  });

  it("leaves a step whose payout is unreported unknown, never zero", () => {
    const r = reconcileSettlement(
      settlement({
        steps: [
          step(0, { price_usdc: 0.01, paid_usdc: 0.01 }),
          step(1, { price_usdc: 0.02, paid_usdc: null }),
        ],
        settled_usdc: 0.01,
      }),
      "settled",
    );
    expect(r?.rows[1].charged).toBeNull();
    expect(r?.charged).toBeNull();
    expect(r?.balanced).toBeNull();
  });
});
