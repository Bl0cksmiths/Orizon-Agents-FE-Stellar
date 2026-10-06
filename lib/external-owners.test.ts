/**
 * The external-agent and operator-wallet derivation, against a fake register:
 * team wallets and the deployment's runtime keys are excluded the way the
 * backend's adoption rule excludes them.
 */
import { StrKey } from "@stellar/stellar-sdk";
import { describe, expect, it } from "vitest";

import { TEAM_WALLETS, deriveExternalOwners, ourKeys } from "./external-owners";
import register from "./team-wallets.json";
import type { Agent } from "./types";

const TEAM_A = "GTEAMAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
const TEAM_B = "GTEAMBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB";
const ADMIN = "GADMINAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
const DISPATCH = "GDISPATCHAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
const SIGNER = "GSIGNERAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
const SCORER = "GSCORERAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
const OUT_1 = "GOUTSIDE1AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
const OUT_2 = "GOUTSIDE2AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

const FAKE_TEAM = new Set([TEAM_A, TEAM_B]);
const NETWORK = { admin: ADMIN, dispatch_signer: DISPATCH };
const READINESS = { ratings: { signer: SIGNER, scorer: SCORER } };

const agent = (
  id: string,
  owner: string | null,
  source: Agent["source"] = "onchain",
): Agent => ({
  id,
  name: id,
  skills: [],
  price: 0.01,
  rep: 4,
  status: "online",
  runs: 0,
  owner,
  source,
  bound: null,
});

const REGISTRY: Agent[] = [
  agent("agt_seed1", null, "seeded"),
  agent("agt_seed2", null, "seeded"),
  // In the seeded namespace on chain: never an operator's.
  agent("agt_squat", OUT_1),
  agent("team_a1", TEAM_A),
  agent("team_b1", TEAM_B),
  agent("admin_1", ADMIN),
  agent("dispatch_1", DISPATCH),
  agent("signer_1", SIGNER),
  agent("scorer_1", SCORER),
  agent("out1_a", OUT_1),
  agent("out1_b", OUT_1),
  agent("out2_a", OUT_2),
  agent("ownerless", null),
];

describe("deriveExternalOwners", () => {
  const ours = ourKeys(NETWORK, READINESS, FAKE_TEAM)!;

  it("counts only outside owners' on-chain agents, and their distinct wallets", () => {
    expect(deriveExternalOwners(REGISTRY, ours)).toEqual({
      external: 3,
      operatorWallets: 2,
      unowned: 1,
    });
  });

  it("excludes every team wallet in the register", () => {
    const withoutTeam = ourKeys(NETWORK, READINESS, new Set())!;
    expect(deriveExternalOwners(REGISTRY, withoutTeam).external).toBe(5);
  });

  it("excludes the deployment's published keys", () => {
    const teamOnly = new Set(FAKE_TEAM);
    expect(deriveExternalOwners(REGISTRY, teamOnly)).toEqual({
      external: 7,
      operatorWallets: 6,
      unowned: 1,
    });
  });

  it("never counts the seeded catalog, on chain or off", () => {
    const seededOnly = [
      agent("agt_x", OUT_1),
      agent("agt_y", null, "seeded"),
      agent("catalog_z", OUT_2, "seeded"),
    ];
    expect(deriveExternalOwners(seededOnly, ours).external).toBe(0);
  });
});

describe("ourKeys", () => {
  it("is null when the network read does not name its admin", () => {
    expect(ourKeys(null, READINESS, FAKE_TEAM)).toBeNull();
    expect(ourKeys({ dispatch_signer: DISPATCH }, null, FAKE_TEAM)).toBeNull();
    expect(ourKeys({ admin: "" }, null, FAKE_TEAM)).toBeNull();
  });

  it("is the register plus the published keys", () => {
    expect(ourKeys(NETWORK, READINESS, FAKE_TEAM)).toEqual(
      new Set([TEAM_A, TEAM_B, ADMIN, DISPATCH, SIGNER, SCORER]),
    );
  });

  it("does without readiness, and without a dispatch signer", () => {
    expect(
      ourKeys({ admin: ADMIN, dispatch_signer: null }, "x", FAKE_TEAM),
    ).toEqual(new Set([TEAM_A, TEAM_B, ADMIN]));
  });
});

describe("the vendored register", () => {
  // The backend refuses to boot on any of these (load_team_register); a copy
  // that would fail there must not be trusted here.
  it("is a non-empty list of distinct, valid Stellar account ids", () => {
    const addresses = register.wallets.map((w) => w.address);
    expect(addresses.length).toBeGreaterThan(0);
    expect(new Set(addresses).size).toBe(addresses.length);
    for (const a of addresses) {
      expect(StrKey.isValidEd25519PublicKey(a), a).toBe(true);
    }
    expect(TEAM_WALLETS.size).toBe(addresses.length);
  });

  it("holds the live deployment's admin, signer and dispatch signer", () => {
    for (const key of [
      "GA7AI5TAJEZA27I666DSJC4MUJYBEWUYNNZWPU7R2ONA7IZQVO6R5OQV",
      "GDB4N25UYM3YNTTAWX7LSGI2P7OR62QZQXRNQWAGF5TFVENDKCTTCDHP",
      "GB5MKHDFLJZ6OFPAHM7R4HGBUPFV5PZYL3W27VTIUZZ25JMQSDZBKCMR",
    ]) {
      expect(TEAM_WALLETS.has(key), key).toBe(true);
    }
  });

  // The backend's register at 66844d2 (BE feat/agent-pipelines): the twelve
  // wallets before it, plus the platform treasury that owns the built-in
  // agents on-chain. A count here catches a stale copy that the shape checks
  // above would pass.
  it("is the backend's thirteen declared wallets, the treasury among them", () => {
    expect(register.wallets).toHaveLength(13);
    for (const key of [
      "GBE6AUTEQDC7HN2453JY4SCPMMGDVAXIX7IOXLQM7K3KTVLL5R3UOQ4J",
      "GAGOZVEZ43HDMIU367HADCNRD6O425JUX3PQOEZEDYZP5HFKXXJ7HJNC",
      "GDOGIRT73NAQ7VRCIOK7G76EK7MAOC55EDT5GG4EKRE4VPVWSWG7KSP3",
    ]) {
      expect(TEAM_WALLETS.has(key), key).toBe(true);
    }
  });
});
