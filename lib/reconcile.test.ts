import { describe, expect, it } from "vitest";

import { reconcileSettlement } from "./reconcile";
import type {
  SettlementStepView,
  SettlementTotals,
  SettlementView,
  WireAmount,
} from "./types";

const amt = (stroops: number | string): WireAmount => ({
  stroops,
  display: "—",
});

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

/** A step as the pricing contract sends it: exact planned/charged/returned. */
const exactStep = (
  i: number,
  planned: number | string,
  charged: number | string,
  returned: number | string,
  over: Partial<SettlementStepView> = {},
) =>
  step(i, {
    planned: amt(planned),
    charged: amt(charged),
    returned: amt(returned),
    ...over,
  });

const totals = (
  t: Record<keyof SettlementTotals, number | string | null>,
): SettlementTotals => ({
  authorized: t.authorized === null ? null : amt(t.authorized),
  planned: t.planned === null ? null : amt(t.planned),
  charged: amt(t.charged ?? 0),
  returned: t.returned === null ? null : amt(t.returned),
  surplus: t.surplus === null ? null : amt(t.surplus),
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
    exactStep(0, 90_000, 0, 90_000),
    exactStep(1, 120_000, 0, 120_000, { delivered: false }),
    exactStep(2, 540_000, 540_000, 0),
  ],
  totals: totals({
    authorized: 750_000,
    planned: 750_000,
    charged: 540_000,
    returned: 210_000,
    surplus: 0,
  }),
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
      settlement({
        steps: [exactStep(0, 100, 60, 39)],
        totals: totals({
          authorized: 100,
          planned: 100,
          charged: 60,
          returned: 40,
          surplus: 0,
        }),
      }),
      "settled",
    );
    expect(off?.balanced).toBe(false);
    expect(off?.rows[0].balanced).toBe(false);
    expect(off?.issues).toContain("step 1: charged + returned ≠ planned");
  });

  it("flags totals that disagree with the settlement's own", () => {
    const off = reconcileSettlement(
      {
        ...exact,
        totals: { ...exact.totals!, charged: amt(540_001) },
      },
      "settled",
    );
    expect(off?.balanced).toBe(false);
    expect(off?.issues).toContain(
      "the steps' charges do not sum to the settlement's total",
    );
    expect(off?.issues).toContain("charged + returned ≠ authorized");
  });

  it("shows the authorization's surplus the escrow also returned", () => {
    // A plan priced at zero still authorizes the minimum cap: the escrow
    // returns all of it, and that is more than the steps' returns.
    const r0 = reconcileSettlement(
      settlement({
        steps: [exactStep(0, 0, 0, 0)],
        totals: totals({
          authorized: 10_000,
          planned: 0,
          charged: 0,
          returned: 10_000,
          surplus: 10_000,
        }),
      }),
      "settled",
    );
    expect(r0?.headroom).toBe(10_000n);
    expect(r0?.balanced).toBe(true);
  });

  it("flags a surplus that is not what the escrow returned beyond the steps", () => {
    const off = reconcileSettlement(
      settlement({
        steps: [exactStep(0, 0, 0, 0)],
        totals: totals({
          authorized: 10_000,
          planned: 0,
          charged: 0,
          returned: 10_000,
          surplus: 9_999,
        }),
      }),
      "settled",
    );
    expect(off?.balanced).toBe(false);
  });

  it("handles amounts past 2^53 exactly", () => {
    const big = "90071992547409930001";
    const r1 = reconcileSettlement(
      settlement({
        steps: [exactStep(0, big, big, 0)],
        totals: totals({
          authorized: big,
          planned: big,
          charged: big,
          returned: 0,
          surplus: 0,
        }),
      }),
      "settled",
    );
    expect(r1?.charged).toBe(90_071_992_547_409_930_001n);
    expect(r1?.balanced).toBe(true);
  });

  it("leaves a price the record did not keep unknown, never zero", () => {
    const r2 = reconcileSettlement(
      settlement({
        steps: [
          step(0, { planned: null, charged: amt(0), returned: null }),
          exactStep(1, 540_000, 540_000, 0),
        ],
        totals: totals({
          authorized: null,
          planned: null,
          charged: 540_000,
          returned: null,
          surplus: null,
        }),
      }),
      "settled",
    );
    expect(r2?.rows[0].planned).toBeNull();
    expect(r2?.planned).toBeNull();
    expect(r2?.balanced).toBeNull();
  });
});

describe("reconcileSettlement — an older backend", () => {
  // Escrow v2 with only the floats: converted as the backend converts them,
  // and each step's return is its price less its payout.
  const legacy = settlement({
    steps: [
      step(0, { price_usdc: 0.009, paid_usdc: 0 }),
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

  // The backend's own rule: a delivered step paid nothing for a named reason
  // kept no plan price on an old record (its price_usdc is the 0.0 credit
  // basis), so its price is unknown.
  it("does not read a paid-nothing step's credit basis as its price", () => {
    const r = reconcileSettlement(
      settlement({
        steps: [
          step(0, {
            price_usdc: 0,
            paid_usdc: 0,
            unpaid_reason: "no_onchain_owner",
          }),
        ],
      }),
      "settled",
    );
    expect(r?.rows[0].planned).toBeNull();
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
          step(0, { planned: amt(5), delivered: false }),
          step(1, { planned: amt(7), delivered: false }),
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
