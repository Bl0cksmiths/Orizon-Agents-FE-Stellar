/**
 * The seal state's reading and wording (lib/seal-state.ts).
 */
import { describe, expect, it } from "vitest";
import {
  SEAL_LABEL,
  SEAL_SENTENCE,
  isSealPending,
  readSealKind,
  readSealState,
  sealWords,
} from "./seal-state";
import { SEAL_STATES } from "./types";

describe("readSealState", () => {
  it("passes every known state through", () => {
    for (const s of SEAL_STATES) expect(readSealState(s)).toBe(s);
  });

  it("keeps absent and null apart", () => {
    expect(readSealState(undefined)).toBeUndefined();
    expect(readSealState(null)).toBeNull();
  });

  it("reads a word it does not know as the state that claims least", () => {
    expect(readSealState("anchored")).toBe("unconfirmed");
  });
});

describe("isSealPending", () => {
  it("is true only while the backend is still confirming", () => {
    expect(isSealPending("pending")).toBe(true);
    for (const s of ["sealed", "unconfirmed", "failed", null, undefined]) {
      expect(isSealPending(s)).toBe(false);
    }
  });
});

describe("the wording", () => {
  it("names every state, in words a buyer can act on", () => {
    expect(SEAL_LABEL).toEqual({
      sealed: "Sealed on Stellar",
      pending: "Sealing… checking the ledger",
      unconfirmed: "Seal not confirmed yet",
      failed: "Seal failed — your payment stands",
    });
  });

  it("never lets a seal that did not land read as a lost payment", () => {
    expect(SEAL_SENTENCE.failed).toMatch(/payment .* stands/);
    expect(SEAL_SENTENCE.unconfirmed).toMatch(/may still land/);
  });
});

describe("readSealKind", () => {
  it("passes both kinds through and keeps absent and null apart", () => {
    expect(readSealKind("paid")).toBe("paid");
    expect(readSealKind("delivery_only")).toBe("delivery_only");
    expect(readSealKind(null)).toBeNull();
    expect(readSealKind(undefined)).toBeUndefined();
  });

  it("reads a kind it does not know as unknown, keeping today's wording", () => {
    expect(readSealKind("partial")).toBeUndefined();
  });
});

describe("sealWords", () => {
  it("keeps the paid wording for a paid seal, a missing kind, or none", () => {
    for (const kind of ["paid", null, undefined] as const) {
      expect(sealWords("failed", kind)).toEqual({
        label: SEAL_LABEL.failed,
        sentence: SEAL_SENTENCE.failed,
      });
    }
  });

  it("says a delivery-only seal attests delivery and that no payment was made", () => {
    expect(sealWords("sealed", "delivery_only").label).toBe(
      "Attested on Stellar — delivered, no payment made",
    );
    for (const state of SEAL_STATES) {
      const { label, sentence } = sealWords(state, "delivery_only");
      const said = `${label} ${sentence}`;
      expect(said).toMatch(/no payment/i);
      // Never a payment that "stands", never something to dispute.
      expect(said).not.toMatch(/payment (stands|for this run is unaffected)/i);
      expect(said).not.toMatch(/disput/i);
    }
  });
});
