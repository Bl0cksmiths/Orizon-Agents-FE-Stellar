import { describe, expect, it } from "vitest";

import {
  FALLBACK_CONTRACT_IDS,
  fallbackReputationLedgerId,
} from "./contract-addresses";

// A Soroban contract id is a 56-character strkey: "C" plus 55 base32 digits.
const CONTRACT_ID = /^C[A-Z2-7]{55}$/;

// Scope note: nothing here can tell whether an id is the CURRENT deployment —
// that question is only answerable against the deploy scripts' address book in
// the contract repo, and `scripts/check-contract-addresses.mjs` is what asks
// it. This file pins the properties that are checkable from inside this repo,
// which are the ones whose violation produces a malformed or misrouted link.
describe("FALLBACK_CONTRACT_IDS", () => {
  it("carries exactly the two explorer segments for every contract", () => {
    // A missing segment resolves to `undefined` and interpolates into the
    // explorer URL as the literal string "undefined" — a 404 rather than a
    // visible failure, so the absence has to be caught here.
    for (const networks of Object.values(FALLBACK_CONTRACT_IDS)) {
      expect(Object.keys(networks).sort()).toEqual(["public", "testnet"]);
    }
  });

  it("holds well-formed contract ids", () => {
    for (const networks of Object.values(FALLBACK_CONTRACT_IDS)) {
      for (const id of Object.values(networks)) {
        expect(id).toMatch(CONTRACT_ID);
      }
    }
  });

  it("never uses the same id for both networks", () => {
    // The plausible mistake when hand-copying an address book is pasting one
    // id into both slots. It typechecks, it renders, and it quietly points
    // mainnet visitors at a testnet contract — which is exactly the class of
    // wrong-but-plausible link these fallbacks are on probation for.
    for (const networks of Object.values(FALLBACK_CONTRACT_IDS)) {
      expect(networks.public).not.toBe(networks.testnet);
    }
  });
});

describe("fallbackReputationLedgerId", () => {
  it("resolves the mainnet id for the public explorer segment", () => {
    expect(fallbackReputationLedgerId("public")).toBe(
      FALLBACK_CONTRACT_IDS.reputation_ledger.public,
    );
  });

  it("resolves the testnet id for the testnet explorer segment", () => {
    expect(fallbackReputationLedgerId("testnet")).toBe(
      FALLBACK_CONTRACT_IDS.reputation_ledger.testnet,
    );
  });
});
