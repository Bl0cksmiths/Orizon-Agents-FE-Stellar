/**
 * Unit tests for lib/ecosystem.ts: the adoption guard, the request, and the
 * rules that decide what the Ecosystem page claims.
 *
 * Every rule here exists to stop a flattering reading. A target the backend
 * calls met while its own numbers say otherwise reads as missed; a payer who
 * is one of our wallets is team-funded; a partial read says how much it
 * missed; and an exclusion reason this build does not know still excludes.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  TARGET_COPY,
  TARGET_KEYS,
  excludedOwners,
  exclusionReason,
  formatUsdcAmount,
  getEcosystemAdoption,
  isEcosystemAdoption,
  isTeamFunded,
  missSentence,
  shortAddress,
  targetRows,
  targetsVerdict,
  unverifiedSentence,
  type EcosystemAdoption,
} from "./ecosystem";

const TEAM = "GA7AI5TA6QKZ2V6SWKFOQDQBLNJ4HRFG2PYBEXAMPLETEAMXXXXXXXXXX";
const OUTSIDER = "GBOUTSIDERQKZ2V6SWKFOQDQBLNJ4HRFG2PYBEXAMPLEOUTXXXXXXXXX";
const BUYER = "GBUYER4H6QKZ2V6SWKFOQDQBLNJ4HRFG2PYBEXAMPLECUSTOMERXXXXX";

/** Today's honest answer: nothing counts, and every owner is ours. */
function zero(over: Partial<EcosystemAdoption> = {}): EcosystemAdoption {
  return {
    network: "testnet",
    generated_at: 1_759_046_400,
    targets: {
      external_agents: 2,
      unique_operator_wallets: 2,
      settled_external_workflows: 3,
    },
    totals: {
      external_agents: 0,
      unique_operator_wallets: 0,
      settled_external_workflows: 0,
    },
    met: {
      external_agents: false,
      unique_operator_wallets: false,
      settled_external_workflows: false,
    },
    operators: [],
    excluded: [
      {
        owner: TEAM,
        owner_explorer: `https://stellar.expert/explorer/testnet/account/${TEAM}`,
        reason: "platform_key",
        role: "settler",
        agent_ids: ["code.gen"],
      },
    ],
    degraded: false,
    unreadable_agents: [],
    ...over,
  };
}

/** One outsider with one agent and one settled workflow. */
function withOperator(payer = BUYER): EcosystemAdoption {
  return zero({
    operators: [
      {
        owner: OUTSIDER,
        owner_explorer: null,
        agents: [
          {
            agent_id: "ext.agent",
            name: "External",
            active: true,
            bound: true,
            settled_workflows: [
              {
                job_id_hex: "ab".repeat(16),
                tx_hash: "cd".repeat(32),
                explorer: null,
                amount_usdc: 0.01,
                payer,
                settled_at: 1_759_046_400,
              },
            ],
          },
        ],
      },
    ],
  });
}

describe("isEcosystemAdoption", () => {
  it("accepts today's all-zero answer and one with an operator", () => {
    expect(isEcosystemAdoption(zero())).toBe(true);
    expect(isEcosystemAdoption(withOperator())).toBe(true);
  });

  it("accepts a backend that omits the optional fields", () => {
    const a: Record<string, unknown> = { ...zero() };
    delete a.degraded;
    delete a.unreadable_agents;
    expect(isEcosystemAdoption(a)).toBe(true);
  });

  it("accepts an exclusion reason it does not know — it must still be listed", () => {
    const a = zero();
    a.excluded[0].reason = "audit_key";
    expect(isEcosystemAdoption(a)).toBe(true);
  });

  const broken: [string, (a: Record<string, unknown>) => void][] = [
    ["a missing network", (a) => delete a.network],
    ["a string generated_at", (a) => (a.generated_at = "now")],
    [
      "a target that is a string",
      (a) => (a.targets = { ...zero().targets, external_agents: "2" }),
    ],
    [
      "a total that is missing",
      (a) => (a.totals = { external_agents: 0, unique_operator_wallets: 0 }),
    ],
    [
      "a met flag that is the string false",
      (a) => (a.met = { ...zero().met, external_agents: "false" }),
    ],
    ["operators that are not a list", (a) => (a.operators = {})],
    ["an operator without an owner", (a) => (a.operators = [{ agents: [] }])],
    [
      "an agent whose active flag is a string",
      (a) => {
        const w = withOperator();
        (w.operators[0].agents[0] as Record<string, unknown>).active = "yes";
        a.operators = w.operators;
      },
    ],
    [
      "a workflow amount that is a string",
      (a) => {
        const w = withOperator();
        (
          w.operators[0].agents[0].settled_workflows[0] as Record<
            string,
            unknown
          >
        ).amount_usdc = "0.01";
        a.operators = w.operators;
      },
    ],
    [
      "a workflow without a payer",
      (a) => {
        const w = withOperator();
        delete (
          w.operators[0].agents[0].settled_workflows[0] as Record<
            string,
            unknown
          >
        ).payer;
        a.operators = w.operators;
      },
    ],
    ["excluded that is not a list", (a) => (a.excluded = null)],
    [
      "an excluded wallet with numeric agent ids",
      (a) =>
        (a.excluded = [{ owner: TEAM, reason: "team_wallet", agent_ids: [1] }]),
    ],
    [
      "an excluded wallet without a reason",
      (a) => (a.excluded = [{ owner: TEAM, agent_ids: [] }]),
    ],
    ["a degraded flag that is the string true", (a) => (a.degraded = "true")],
    [
      "unreadable agents that are not strings",
      (a) => (a.unreadable_agents = [1]),
    ],
  ];
  it.each(broken)("rejects %s", (_name, breakIt) => {
    const a: Record<string, unknown> = { ...zero() };
    breakIt(a);
    expect(isEcosystemAdoption(a)).toBe(false);
  });

  it.each([null, "", [], 42])("rejects %j", (v) => {
    expect(isEcosystemAdoption(v)).toBe(false);
  });
});

describe("targetRows", () => {
  it("reads today's zeros as three misses, each short by the whole target", () => {
    const rows = targetRows(zero());
    expect(rows.map((r) => r.key)).toEqual([...TARGET_KEYS]);
    expect(rows.every((r) => !r.met)).toBe(true);
    expect(rows.map((r) => r.shortBy)).toEqual([2, 2, 3]);
  });

  it("reads a target as met when the backend says so and the numbers agree", () => {
    const a = zero({
      totals: {
        external_agents: 3,
        unique_operator_wallets: 2,
        settled_external_workflows: 1,
      },
      met: {
        external_agents: true,
        unique_operator_wallets: true,
        settled_external_workflows: false,
      },
    });
    expect(targetRows(a).map((r) => [r.met, r.shortBy])).toEqual([
      [true, 0],
      [true, 0],
      [false, 2],
    ]);
  });

  it("reads met-but-below-target as the miss the numbers show", () => {
    const a = zero({ met: { ...zero().met, external_agents: true } });
    const row = targetRows(a)[0];
    expect(row.met).toBe(false);
    expect(row.shortBy).toBe(2);
  });

  it("does not call a target met because the numbers reach it — the backend decides what counts", () => {
    const a = zero({ totals: { ...zero().totals, external_agents: 5 } });
    expect(targetRows(a)[0].met).toBe(false);
    expect(targetRows(a)[0].shortBy).toBe(0);
  });
});

describe("the miss copy", () => {
  it("states the verdict as a count", () => {
    expect(targetsVerdict(targetRows(zero()))).toBe("0 of 3 targets met.");
  });

  it("states a miss plainly", () => {
    expect(missSentence(targetRows(zero())[0])).toBe(
      "Not met: 0 of 2, short by 2.",
    );
    expect(missSentence(targetRows(zero())[2])).toBe(
      "Not met: 0 of 3, short by 3.",
    );
  });

  it("never softens a miss", () => {
    const copy = [
      ...targetRows(zero()).map(missSentence),
      ...Object.values(TARGET_COPY).flatMap((c) => [c.label, c.counts]),
    ].join(" ");
    expect(copy).not.toMatch(/almost|nearly|close to|on track|progress/i);
  });
});

describe("team-funded payers", () => {
  it("labels a payer who is one of our wallets", () => {
    const a = withOperator(TEAM);
    const payer = a.operators[0].agents[0].settled_workflows[0].payer;
    expect(isTeamFunded(payer, excludedOwners(a))).toBe(true);
  });

  it("does not label an outside payer", () => {
    expect(isTeamFunded(BUYER, excludedOwners(withOperator()))).toBe(false);
  });
});

describe("exclusionReason", () => {
  it.each([
    ["team_wallet", "Team wallet"],
    ["platform_key", "Platform key"],
    ["audit_key", "audit key"],
    ["", "Excluded"],
  ])("%j → %j", (raw, out) => {
    expect(exclusionReason(raw)).toBe(out);
  });
});

describe("unverifiedSentence", () => {
  it("is silent for a whole read", () => {
    expect(unverifiedSentence(zero())).toBeNull();
    expect(
      unverifiedSentence(
        zero({ degraded: undefined, unreadable_agents: null }),
      ),
    ).toBeNull();
  });

  it("counts the agents it could not see, never as zero", () => {
    const s = unverifiedSentence(
      zero({ degraded: true, unreadable_agents: ["a", "b"] }),
    );
    expect(s).toBe(
      "Couldn't verify 2 agents right now. Whatever they would add is missing from the figures below until they can be read again — a gap, not a zero.",
    );
  });

  it("uses the singular for one agent", () => {
    expect(unverifiedSentence(zero({ unreadable_agents: ["a"] }))).toMatch(
      /^Couldn't verify 1 agent right now\./,
    );
  });

  it("still speaks when degraded without naming anyone", () => {
    expect(unverifiedSentence(zero({ degraded: true }))).toMatch(
      /^Couldn't verify every agent right now\./,
    );
  });
});

describe("formatting", () => {
  it("shortens an address, and leaves a short one alone", () => {
    expect(shortAddress(TEAM)).toBe("GA7A…XXXX");
    expect(shortAddress("GABC")).toBe("GABC");
  });

  it("prints a USDC amount without inventing precision", () => {
    expect(formatUsdcAmount(0.01)).toBe("0.01 USDC");
    expect(formatUsdcAmount(0.0000001)).toBe("0.0000001 USDC");
    expect(formatUsdcAmount(1234.5)).toBe("1,234.5 USDC");
  });
});

describe("getEcosystemAdoption", () => {
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  afterEach(() => fetchMock.mockReset());

  const answer = (body: unknown) => ({
    ok: true,
    status: 200,
    json: async () => body,
    text: async () => "",
  });

  it("reads the adoption path, uncached, every time", async () => {
    fetchMock.mockResolvedValue(answer(zero()));
    await getEcosystemAdoption();
    await getEcosystemAdoption();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/ecosystem/adoption");
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ cache: "no-store" });
  });

  it("rejects a malformed payload", async () => {
    fetchMock.mockResolvedValue(answer({ ...zero(), met: {} }));
    await expect(getEcosystemAdoption()).rejects.toThrow(
      "malformed response from /ecosystem/adoption",
    );
  });

  it("surfaces an HTTP failure with its status", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ detail: "Not Found" }),
      text: async () => "",
    });
    await expect(getEcosystemAdoption()).rejects.toThrow(
      "GET /ecosystem/adoption → 404 — Not Found",
    );
  });
});
