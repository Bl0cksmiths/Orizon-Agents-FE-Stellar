import { describe, expect, it } from "vitest";

import { readSettlementState, traceSettlementState } from "./settlement-state";
import type { TraceLine } from "./types";

describe("readSettlementState", () => {
  it("passes the states it knows, and keeps absent and null apart", () => {
    for (const s of [
      "settled",
      "released",
      "skipped",
      "unconfirmed",
      "failed",
    ]) {
      expect(readSettlementState(s)).toBe(s);
    }
    expect(readSettlementState(undefined)).toBeUndefined();
    expect(readSettlementState(null)).toBeNull();
  });

  // Least claim: never paid, never failed, never returned.
  it("reads a word it cannot name as unconfirmed", () => {
    expect(readSettlementState("rebalanced")).toBe("unconfirmed");
  });
});

describe("traceSettlementState", () => {
  const line = (over: Partial<TraceLine> = {}): TraceLine => ({
    t: "1.0",
    level: "cost",
    msg: "x",
    ...over,
  });

  it("is undefined until a line reports the outcome", () => {
    expect(traceSettlementState([])).toBeUndefined();
    expect(
      traceSettlementState([line(), line({ settlement: null })]),
    ).toBeUndefined();
  });

  it("takes the last line that reports it", () => {
    expect(
      traceSettlementState([
        line({ settlement: "unconfirmed" }),
        line(),
        line({ settlement: "settled" }),
        line({ settlement: null }),
      ]),
    ).toBe("settled");
  });
});
