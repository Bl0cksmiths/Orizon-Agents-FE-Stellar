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
    [CHARGE, 0.162],
    [SETTLE, 0.162],
    [SIMULATED, 0.024],
    [SEALED, 0.162],
  ])("reads the amount in %s", (msg, n) => {
    expect(amountIn(msg)).toBe(n);
  });

  // A date, a clock time and a tx hash are not amounts.
  it.each([NOTHING_PAID, RELEASED, WINDOW])("reads no amount in %s", (msg) => {
    expect(amountIn(msg)).toBe(0);
  });

  it("accepts the asset code the backend would write for XLM", () => {
    expect(amountIn("x402 charge → 0.162 XLM settled · tx 1a2b…")).toBe(0.162);
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
    ).toEqual({ spent: 0.162, simulatedOnly: false });
  });

  it("never counts a simulated payment as spent", () => {
    expect(
      traceSpend([line("cost", SIMULATED), line("cost", SIMULATED)]),
    ).toEqual({ spent: 0, simulatedOnly: true });
  });

  it("counts a released run as nothing spent, not as simulated", () => {
    expect(traceSpend([line("cost", NOTHING_PAID)])).toEqual({
      spent: 0,
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
    expect(formatSpent(0.162, "native")).toBe("0.162 XLM");
    expect(formatSpent(0.162, null)).toBe("0.162");
    expect(formatSpent(0.162, undefined)).not.toMatch(/USDC/);
  });
});
