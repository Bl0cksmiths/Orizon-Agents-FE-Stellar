import { describe, expect, it } from "vitest";

import {
  assetLabel,
  formatSettled,
  stroopsToUnits,
  STROOPS_PER_UNIT,
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
    expect(formatSettled(12_900_000, "native")).toBe("1.29 XLM");
  });

  it("renders zero without inventing a currency", () => {
    expect(formatSettled(0, null)).toBe("0.0");
  });
});
