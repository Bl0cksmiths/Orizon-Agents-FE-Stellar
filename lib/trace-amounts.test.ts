/**
 * The trace's amounts, read from the backend's real strings
 * (app/services/execution_svc.py on feat/5.02-integration) and shown in the
 * network's asset: XLM on testnet, no unit while it is unknown, and never the
 * "USDC" the backend's field names put in its prose.
 */
import { describe, expect, it } from "vitest";

import { traceLines } from "./mock-data";
import {
  amountIn,
  formatSpent,
  relabelAmounts,
  traceSpend,
} from "./trace-amounts";
import type { TraceLine } from "./types";

const line = (level: TraceLine["level"], msg: string): TraceLine => ({
  t: "0.00",
  level,
  msg,
});

// Verbatim shapes of every cost line the backend emits, and the lines
// outside `cost` that carry an amount.
const SIMULATED = "x402 payment → agt_09l5 :: 0.024 USDC (simulated)";
const CHARGE = "x402 charge → 0.162 USDC settled · tx 1a2b3c4d5e…";
const SETTLE =
  "x402 settle → 0.162 USDC paid to 3 operator payout(s), the rest released · tx 1a2b3c4d5e…";
const NOTHING_PAID =
  "x402 settle → nothing paid, custody released to the buyer · tx 1a2b3c4d5e…";
const RELEASED = "custody released to the buyer · tx 1a2b3c4d5e…";
const WINDOW =
  "dispute window open — any delivered step can be disputed until 2026-09-29 12:00 UTC";
const SEALED = "workflow sealed — 3 agents · 0.162 USDC · 4.21s";
const OVER_CAP =
  "charge 0.162 USDC exceeds cap 0.500 — skipping on-chain charge/seal";

describe("amountIn", () => {
  it.each([
    [CHARGE, 1_620_000n],
    [SETTLE, 1_620_000n],
    [SIMULATED, 240_000n],
    [SEALED, 1_620_000n],
  ])("reads the amount in %s, in stroops", (msg, n) => {
    expect(amountIn(msg)).toBe(n);
  });

  // A date, a clock time and a tx hash are not amounts.
  it.each([NOTHING_PAID, RELEASED, WINDOW])("reads no amount in %s", (msg) => {
    expect(amountIn(msg)).toBe(0n);
  });

  it("accepts the asset code the backend would write for XLM", () => {
    expect(amountIn("x402 charge → 0.162 XLM settled · tx 1a2b…")).toBe(
      1_620_000n,
    );
  });

  it("reads every stroop of a seven-place amount", () => {
    expect(amountIn("x402 charge → 0.1234567 XLM settled")).toBe(1_234_567n);
  });
});

describe("traceSpend", () => {
  it("totals a settled run's cost lines, skipping lines with no amount", () => {
    expect(
      traceSpend([
        line("cost", SETTLE),
        line("cost", WINDOW),
        line("proof", SEALED),
      ]),
    ).toEqual({ spent: 1_620_000n, simulatedOnly: false });
  });

  // 0.1 + 0.2 in floats is 0.30000000000000004, which printed to the stroop
  // is not what moved.
  it("totals in exact stroops, never in floats", () => {
    expect(
      traceSpend([
        line("cost", "x402 charge → 0.1 XLM settled"),
        line("cost", "x402 charge → 0.2 XLM settled"),
      ]).spent,
    ).toBe(3_000_000n);
  });

  it("never counts a simulated payment as spent", () => {
    expect(
      traceSpend([line("cost", SIMULATED), line("cost", SIMULATED)]),
    ).toEqual({ spent: 0n, simulatedOnly: true });
  });

  it("counts a released run as nothing spent, not as simulated", () => {
    expect(traceSpend([line("cost", NOTHING_PAID)])).toEqual({
      spent: 0n,
      simulatedOnly: false,
    });
  });

  it("totals the demo replay's lines as simulated only", () => {
    expect(traceSpend(traceLines as TraceLine[]).simulatedOnly).toBe(true);
  });
});

describe("relabelAmounts", () => {
  it("shows the backend's amounts in XLM on testnet", () => {
    expect(relabelAmounts(CHARGE, "native")).toBe(
      "x402 charge → 0.162 XLM settled · tx 1a2b3c4d5e…",
    );
    expect(relabelAmounts(OVER_CAP, "native")).toBe(
      "charge 0.162 XLM exceeds cap 0.500 — skipping on-chain charge/seal",
    );
    expect(relabelAmounts(SIMULATED, "native")).toBe(
      "x402 payment → agt_09l5 :: 0.024 XLM (simulated)",
    );
  });

  it("drops the unit while the asset is unknown", () => {
    expect(relabelAmounts(SEALED, null)).toBe(
      "workflow sealed — 3 agents · 0.162 · 4.21s",
    );
    expect(relabelAmounts(SEALED, undefined)).not.toMatch(/USDC|XLM/);
  });

  it("leaves a line with no amount exactly as sent", () => {
    for (const msg of [WINDOW, RELEASED, NOTHING_PAID]) {
      expect(relabelAmounts(msg, "native")).toBe(msg);
    }
  });
});

describe("formatSpent", () => {
  it("prints XLM on testnet, and no unit while the asset is unknown", () => {
    expect(formatSpent(1_620_000n, "native")).toBe("0.162 XLM");
    expect(formatSpent(1_620_000n, null)).toBe("0.162");
    expect(formatSpent(1_620_000n, undefined)).not.toMatch(/USDC/);
  });

  it("prints a summed spend to the stroop, never rounded to three places", () => {
    expect(formatSpent(1_234_567n, "native")).toBe("0.1234567 XLM");
  });

  // The dashboard's task rows carry the backend's float `spent`: converted
  // as the backend converts it, then printed exactly.
  it("prints a legacy float spend exactly as the backend counts it", () => {
    expect(formatSpent(0.0123456, "native")).toBe("0.0123456 XLM");
    expect(formatSpent(0.1 + 0.2, "native")).toBe("0.300 XLM");
    expect(formatSpent(0, "native")).toBe("0.000 XLM");
  });

  it("prints a dash for a spend that is not an amount", () => {
    expect(formatSpent(Number.NaN, "native")).toBe("—");
    expect(formatSpent(-1, "native")).toBe("—");
  });
});
