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
/** Escrow v1's testnet id, as the address book records it. */
const V1 = "CBJPTMAPMGODGZCZ2IMEQSRUX3WGUXNMKDTNN2KMJ3NFGYZ5OJ5525PI";
const OTHER = `C${"O".repeat(55)}`;

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

  it("is v1 when the backend reports escrow v1's own id", () => {
    expect(escrowGeneration(network(V1))).toBe("v1");
  });

  // Never inferred from a missing pin: a backend switched to v2 before this
  // build pins it must not be told "no funds move".
  it("is unknown when nothing is pinned and the backend reports another escrow", () => {
    expect(escrowGeneration(network(V2))).toBe("unknown");
    expect(escrowGeneration(network(OTHER))).toBe("unknown");
  });

  it("is unknown when the backend reports no escrow", () => {
    expect(escrowGeneration(network())).toBe("unknown");
    expect(escrowGeneration(network(""))).toBe("unknown");
    escrowPin.value = V2;
    expect(escrowGeneration(network())).toBe("unknown");
    expect(escrowGeneration(network(""))).toBe("unknown");
  });

  // A pin set against an escrow that is neither: the mismatch guard pauses
  // Authorize and the copy claims neither story.
  it("is unknown when a v2 pin is set and the backend reports a third escrow", () => {
    escrowPin.value = V2;
    expect(escrowGeneration(network(OTHER))).toBe("unknown");
  });

  // Pinned ahead of the backend switch: the backend is still on v1, and says
  // so by id, so v1's story is still the true one.
  it("is v1 when a v2 pin is set but the backend still reports v1", () => {
    escrowPin.value = V2;
    expect(escrowGeneration(network(V1))).toBe("v1");
  });

  it("is unknown until the network read answers, pinned or not", () => {
    expect(escrowGeneration(undefined)).toBe("unknown");
    expect(escrowGeneration(null)).toBe("unknown");
    escrowPin.value = V2;
    expect(escrowGeneration(undefined)).toBe("unknown");
  });
});

describe("generationOf", () => {
  it("claims a story only on a positive match", () => {
    expect(generationOf(V2, V2, V1)).toBe("v2");
    expect(generationOf(V1, V2, V1)).toBe("v1");
    expect(generationOf(V1, null, V1)).toBe("v1");
    expect(generationOf(OTHER, null, V1)).toBe("unknown");
    expect(generationOf(OTHER, V2, V1)).toBe("unknown");
    expect(generationOf(null, V2, V1)).toBe("unknown");
    expect(generationOf(undefined, null, V1)).toBe("unknown");
    expect(generationOf("", null, V1)).toBe("unknown");
  });
});
