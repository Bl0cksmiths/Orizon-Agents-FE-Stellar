import { beforeEach, describe, expect, it, vi } from "vitest";

import type { StellarNetworkInfo } from "./types";

// The v2 pin ships null until v2 is deployed; each case sets its own.
const { escrowPin } = vi.hoisted(() => ({
  escrowPin: { value: null as string | null },
}));
vi.mock("./escrow-address", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./escrow-address")>()),
  pinnedEscrowId: () => escrowPin.value,
}));

import { escrowGeneration, generationOf } from "./escrow-generation";

const V2 = `C${"V".repeat(55)}`;
const V1 = "CBJPTMAPMGODGZCZ2IMEQSRUX3WGUXNMKDTNN2KMJ3NFGYZ5OJ5525PI";

const network = (payment_escrow?: string): StellarNetworkInfo => ({
  network: "testnet",
  rpc_url: "https://soroban-testnet.stellar.org",
  network_passphrase: "Test SDF Network ; September 2015",
  admin: `G${"A".repeat(55)}`,
  contracts: payment_escrow === undefined ? {} : { payment_escrow },
  asset: "native",
  asset_sac: `C${"S".repeat(55)}`,
});

beforeEach(() => {
  escrowPin.value = null;
});

describe("escrowGeneration", () => {
  it("is v2 only when the pin is set and the backend reports that escrow", () => {
    escrowPin.value = V2;
    expect(escrowGeneration(network(V2))).toBe("v2");
  });

  it("is v1 when no v2 escrow is pinned, whatever the backend reports", () => {
    expect(escrowGeneration(network(V1))).toBe("v1");
    expect(escrowGeneration(network())).toBe("v1");
  });

  // The mismatch guard pauses Authorize; the copy claims neither story.
  it("is unknown when a v2 pin is set and the backend reports another escrow", () => {
    escrowPin.value = V2;
    expect(escrowGeneration(network(V1))).toBe("unknown");
    expect(escrowGeneration(network())).toBe("unknown");
    expect(escrowGeneration(network(""))).toBe("unknown");
  });

  it("is unknown until the network read answers, pinned or not", () => {
    expect(escrowGeneration(undefined)).toBe("unknown");
    expect(escrowGeneration(null)).toBe("unknown");
    escrowPin.value = V2;
    expect(escrowGeneration(undefined)).toBe("unknown");
  });
});

describe("generationOf", () => {
  it("maps every agreement to one generation", () => {
    expect(generationOf({ kind: "match", id: V2 })).toBe("v2");
    expect(generationOf({ kind: "unpinned" })).toBe("v1");
    expect(generationOf({ kind: "unknown" })).toBe("unknown");
    expect(generationOf({ kind: "mismatch", live: V1, pinned: V2 })).toBe(
      "unknown",
    );
  });
});
