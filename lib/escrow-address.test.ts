import { describe, expect, it } from "vitest";

import pins from "./escrow-address.json";
import { escrowAgreement, pinnedEscrowId } from "./escrow-address";
import type { StellarNetworkInfo } from "./types";

const V2 = `C${"V".repeat(55)}`;
const V1 = `C${"W".repeat(55)}`;

const network = (payment_escrow?: string): StellarNetworkInfo => ({
  network: "testnet",
  rpc_url: "https://soroban-testnet.stellar.org",
  network_passphrase: "Test SDF Network ; September 2015",
  admin: `G${"A".repeat(55)}`,
  contracts: payment_escrow === undefined ? {} : { payment_escrow },
  asset: "native",
  asset_sac: `C${"S".repeat(55)}`,
});

describe("the escrow v2 pin", () => {
  // Never a guessed id: each segment is either a strkey or null, and both
  // segments are present so a missing one cannot read as "unpinned".
  it("holds a contract id or null for exactly the two explorer segments", () => {
    expect(Object.keys(pins).sort()).toEqual(["public", "testnet"]);
    for (const pin of Object.values(pins) as unknown[]) {
      expect(pin === null || /^C[A-Z2-7]{55}$/.test(String(pin))).toBe(true);
    }
  });

  it("reads the pin for this build's network", () => {
    expect(pinnedEscrowId("testnet")).toBe(pins.testnet);
    expect(pinnedEscrowId("public")).toBe(pins.public);
  });
});

describe("escrowAgreement", () => {
  it("decides nothing before the network read lands", () => {
    expect(escrowAgreement(undefined, V2)).toEqual({ kind: "unknown" });
    expect(escrowAgreement(null, V2)).toEqual({ kind: "unknown" });
  });

  it("has nothing to compare while no v2 id is pinned", () => {
    expect(escrowAgreement(network(V1), null)).toEqual({ kind: "unpinned" });
  });

  it("agrees only when the live escrow is the pinned one", () => {
    expect(escrowAgreement(network(V2), V2)).toEqual({ kind: "match", id: V2 });
    expect(escrowAgreement(network(V1), V2)).toEqual({
      kind: "mismatch",
      live: V1,
      pinned: V2,
    });
  });

  // An unset backend reports "" — that is not the pinned escrow either.
  it("treats a missing or empty live escrow as a mismatch", () => {
    expect(escrowAgreement(network(), V2)).toEqual({
      kind: "mismatch",
      live: null,
      pinned: V2,
    });
    expect(escrowAgreement(network(""), V2)).toEqual({
      kind: "mismatch",
      live: null,
      pinned: V2,
    });
  });
});
