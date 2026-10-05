/**
 * The seal state's reading and wording (lib/seal-state.ts).
 */
import { describe, expect, it } from "vitest";
import {
  SEAL_LABEL,
  SEAL_SENTENCE,
  isSealPending,
  readSealState,
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
