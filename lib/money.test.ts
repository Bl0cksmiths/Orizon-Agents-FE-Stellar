import { describe, expect, it } from "vitest";

import {
  assetLabel,
  decimalToStroops,
  formatSettled,
  formatStroops,
  parseStroops,
  stroopsToDecimal,
  stroopsToUnits,
  STROOPS_PER_UNIT,
  unitsToStroops,
} from "./money";

describe("stroopsToUnits", () => {
  it("converts at the Soroban scale", () => {
    expect(STROOPS_PER_UNIT).toBe(10_000_000);
    expect(stroopsToUnits(12_900_000)).toBeCloseTo(1.29, 7);
  });
});

describe("assetLabel", () => {
  it("calls the native asset XLM, never USDC", () => {
    // The configured testnet SAC reports name and symbol "native". Labelling a
    // figure "USDC" there is wrong on the asset as well as the amount.
    expect(assetLabel("native")).toBe("XLM");
  });

  it("passes a real asset code through", () => {
    expect(assetLabel("usdc")).toBe("USDC");
  });

  it("says nothing when the asset is unknown", () => {
    // Better a bare number than a confidently wrong currency.
    expect(assetLabel(null)).toBe("");
    expect(assetLabel(undefined)).toBe("");
  });
});

describe("formatSettled", () => {
  it("renders the lifetime escrow total with its real unit", () => {
    // 12,900,000 stroops is the complete settled history of the escrow.
    expect(formatSettled(12_900_000, "native")).toBe("1.290 XLM");
  });

  it("renders zero without inventing a currency", () => {
    expect(formatSettled(0, null)).toBe("0.000");
  });
});

describe("parseStroops", () => {
  it("reads a JSON integer, an integer string and a bigint", () => {
    expect(parseStroops(120_000)).toBe(120_000n);
    expect(parseStroops("120000")).toBe(120_000n);
    expect(parseStroops(120_000n)).toBe(120_000n);
    expect(parseStroops(0)).toBe(0n);
    expect(parseStroops("0")).toBe(0n);
  });

  it("reads an amount past 2^53 exactly when it arrives as a string", () => {
    // i128 on the chain; a JSON number that size has already lost stroops.
    expect(parseStroops("170141183460469231731687303715884105727")).toBe(
      170141183460469231731687303715884105727n,
    );
  });

  it("refuses what is not a whole, non-negative stroop count", () => {
    for (const bad of [
      0.5,
      -1,
      "-1",
      "1.0",
      "1e7",
      " 12",
      "",
      "0x10",
      NaN,
      Infinity,
      Number.MAX_SAFE_INTEGER + 2,
      null,
      undefined,
      true,
      {},
      -1n,
    ]) {
      expect(parseStroops(bad)).toBeNull();
    }
  });
});

describe("unitsToStroops", () => {
  it("converts a legacy float the way the backend's usdc_to_i128 does", () => {
    expect(unitsToStroops(0.012)).toBe(120_000n);
    expect(unitsToStroops(0.054)).toBe(540_000n);
    expect(unitsToStroops(0.57)).toBe(5_700_000n);
    expect(unitsToStroops(0)).toBe(0n);
    expect(unitsToStroops(10_000)).toBe(100_000_000_000n);
  });

  it("rounds an exact half to even, as Python's round does", () => {
    // 0.00000025 * 1e7 is 2.5 in binary floating point as well.
    expect(0.00000025 * 1e7).toBe(2.5);
    expect(unitsToStroops(0.00000025)).toBe(2n);
    expect(unitsToStroops(0.00000035)).toBe(4n); // 3.5 → 4
    expect(unitsToStroops(0.00000015)).toBe(2n); // 1.5 → 2
  });

  it("refuses a figure that is not a finite, non-negative amount", () => {
    for (const bad of [NaN, Infinity, -0.001, 1e300]) {
      expect(unitsToStroops(bad)).toBeNull();
    }
  });
});

describe("decimalToStroops", () => {
  it("reads a decimal string exactly, with no float in between", () => {
    expect(decimalToStroops("0.1")).toBe(1_000_000n);
    expect(decimalToStroops("0.2")).toBe(2_000_000n);
    expect(decimalToStroops("10000.0000000")).toBe(100_000_000_000n);
    expect(decimalToStroops("0.0000001")).toBe(1n);
    expect(decimalToStroops("12")).toBe(120_000_000n);
    expect(decimalToStroops("99999999999.9999999")).toBe(
      999_999_999_999_999_999n,
    );
  });

  it("accepts trailing zeros past the stroop but never a finer figure", () => {
    expect(decimalToStroops("0.120000000")).toBe(1_200_000n);
    expect(decimalToStroops("0.00000001")).toBeNull();
  });

  it("refuses what is not a plain non-negative decimal", () => {
    for (const bad of ["", ".5", "5.", "-1", "1e3", "1,5", " 1", "abc"]) {
      expect(decimalToStroops(bad)).toBeNull();
    }
  });
});

describe("stroopsToDecimal", () => {
  it("prints every stroop, and trailing zeros only up to three places", () => {
    expect(stroopsToDecimal(120_000n)).toBe("0.012");
    expect(stroopsToDecimal(1_800_000n)).toBe("0.180");
    expect(stroopsToDecimal(1n)).toBe("0.0000001");
    expect(stroopsToDecimal(1_234_567n)).toBe("0.1234567");
    expect(stroopsToDecimal(100_000_000_000n)).toBe("10000.000");
  });

  it("prints zero as 0.000", () => {
    expect(stroopsToDecimal(0n)).toBe("0.000");
  });

  it("prints an amount far past 2^53 exactly", () => {
    expect(stroopsToDecimal(170141183460469231731687303715884105727n)).toBe(
      "17014118346046923173168730371588.4105727",
    );
  });

  it("prints a negative difference with its sign", () => {
    expect(stroopsToDecimal(-5n)).toBe("-0.0000005");
  });

  it("reads back to the same stroops for the authorize request", () => {
    // `max_amount_usdc` is parsed as a float and rounded with `round(x*1e7)`
    // by the backend; the decimal must survive that for every cap it accepts.
    for (const s of [
      1n,
      9n,
      120_000n,
      1_234_567n,
      99_999_999_999n,
      100_000_000_000n,
    ]) {
      const back = Math.round(Number(stroopsToDecimal(s)) * 1e7);
      expect(BigInt(back)).toBe(s);
    }
  });
});

describe("assetLabel with the plan's asset", () => {
  it("names native XLM by its code", () => {
    expect(assetLabel({ code: "XLM", issuer: null, decimals: 7 })).toBe("XLM");
    expect(assetLabel({ code: "native", issuer: null, decimals: 7 })).toBe(
      "XLM",
    );
  });

  it("only says USDC when the asset is USDC", () => {
    expect(assetLabel({ code: "USDC", issuer: "GA5Z…", decimals: 7 })).toBe(
      "USDC",
    );
  });

  it("says nothing for an asset object with no code", () => {
    expect(assetLabel({ code: "", issuer: null, decimals: 7 })).toBe("");
  });
});

describe("formatStroops", () => {
  it("prints the exact figure with the asset's label", () => {
    expect(formatStroops(120_000n, "native")).toBe("0.012 XLM");
    expect(formatStroops(1n, { code: "XLM", issuer: null, decimals: 7 })).toBe(
      "0.0000001 XLM",
    );
  });

  it("prints bare while the asset is unknown", () => {
    expect(formatStroops(120_000n, null)).toBe("0.012");
  });

  it("formats in the asset's own decimals", () => {
    expect(
      formatStroops(1_234n, { code: "ABC", issuer: "G…", decimals: 2 }),
    ).toBe("12.34 ABC");
  });
});

describe("formatSettled with exact stroops", () => {
  it("accepts a bigint and prints it to the stroop", () => {
    expect(formatSettled(1_234_567n, "native")).toBe("0.1234567 XLM");
  });

  it("does not lose stroops on a large number", () => {
    expect(formatSettled(99_999_999_999, "native")).toBe("9999.9999999 XLM");
  });
});
