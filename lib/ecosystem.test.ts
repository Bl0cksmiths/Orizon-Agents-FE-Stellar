/**
 * Unit tests for lib/ecosystem.ts: the adoption guard, the request, and the
 * rules that decide what the Ecosystem page claims.
 *
 * Every rule here exists to stop a flattering reading. A target the backend
 * calls met while its own numbers say otherwise reads as missed; a payer who
 * is one of our wallets is team-funded; a partial read says how much it
 * missed; and an exclusion reason this build does not know still excludes.
 */

import { isComputingError } from "./api-freshness";
import { isTransientFetchError } from "./use-fetch";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  TARGET_COPY,
  TARGET_KEYS,
  excludedOwners,
  exclusionReason,
  formatSettledAmount,
  getEcosystemAdoption,
  isEcosystemAdoption,
  teamFundedLabel,
  teamFunding,
  missSentence,
  noSettledSentence,
  partialReport,
  settledWindowSentence,
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

  it("accepts a payer team role, and a null one", () => {
    const a = withOperator(TEAM);
    a.operators[0].agents[0].settled_workflows[0].payer_team_role = "settler";
    expect(isEcosystemAdoption(a)).toBe(true);
    a.operators[0].agents[0].settled_workflows[0].payer_team_role = null;
    expect(isEcosystemAdoption(a)).toBe(true);
  });

  it("accepts a backend that omits the optional fields", () => {
    const a: Record<string, unknown> = { ...zero() };
    delete a.degraded;
    delete a.unreadable_agents;
    expect(isEcosystemAdoption(a)).toBe(true);
  });

  it("accepts a settled window, a null one, and none at all", () => {
    expect(isEcosystemAdoption(zero({ window_days: 7.0 }))).toBe(true);
    expect(isEcosystemAdoption(zero({ window_days: 6.5 }))).toBe(true);
    expect(isEcosystemAdoption(zero({ window_days: null }))).toBe(true);
    // 0.0 is what the backend sends when no scan ran: a real answer.
    expect(isEcosystemAdoption(zero({ window_days: 0.0 }))).toBe(true);
    const a: Record<string, unknown> = { ...zero() };
    delete a.window_days;
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
    [
      "a payer team role that is not a string",
      (a) => {
        const w = withOperator();
        (
          w.operators[0].agents[0].settled_workflows[0] as Record<
            string,
            unknown
          >
        ).payer_team_role = true;
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
    ["a settled window that is the string 7", (a) => (a.window_days = "7")],
    ["a settled window that is not finite", (a) => (a.window_days = NaN)],
    ["an infinite settled window", (a) => (a.window_days = Infinity)],
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
  const ours = excludedOwners(zero());

  it("takes the role from payer_team_role when the backend sends one", () => {
    expect(
      teamFunding({ payer: BUYER, payer_team_role: "developer" }, ours),
    ).toEqual({ role: "developer" });
  });

  it("does not label an outside payer the backend says is not ours", () => {
    expect(
      teamFunding({ payer: BUYER, payer_team_role: null }, ours),
    ).toBeNull();
  });

  it("falls back to the excluded list, with its role, when the field is absent", () => {
    expect(teamFunding({ payer: TEAM }, ours)).toEqual({
      role: "settler",
    });
    expect(teamFunding({ payer: BUYER }, ours)).toBeNull();
  });

  it("still labels a payer the same payload lists as ours, whatever the field says", () => {
    expect(teamFunding({ payer: TEAM, payer_team_role: null }, ours)).toEqual({
      role: "settler",
    });
  });

  it("labels a team payer whose role is blank without inventing one", () => {
    expect(teamFunding({ payer: BUYER, payer_team_role: "  " }, ours)).toEqual({
      role: null,
    });
    const noRole = excludedOwners(
      zero({
        excluded: [{ owner: TEAM, reason: "team_wallet", agent_ids: [] }],
      }),
    );
    expect(teamFunding({ payer: TEAM }, noRole)).toEqual({ role: null });
  });

  it("words the label with the role when there is one", () => {
    expect(teamFundedLabel({ role: "developer" })).toBe(
      "team-funded: developer",
    );
    expect(teamFundedLabel({ role: null })).toBe("team-funded");
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

describe("the settled window", () => {
  it("states the window the backend sends beside what it leaves out", () => {
    expect(settledWindowSentence(zero({ window_days: 7.0 }))).toBe(
      "Settled workflows counted over the last 7 days of ledger history — older settlements are not shown here; each transaction stays verifiable on Stellar Expert.",
    );
    expect(noSettledSentence(zero({ window_days: 7.0 }))).toBe(
      "No settled workflows in the last 7 days.",
    );
  });

  it("keeps a fractional window and a single day as sent", () => {
    expect(settledWindowSentence(zero({ window_days: 6.5 }))).toContain(
      "over the last 6.5 days of ledger history",
    );
    expect(settledWindowSentence(zero({ window_days: 1 }))).toContain(
      "over the last 1 day of ledger history",
    );
    expect(noSettledSentence(zero({ window_days: 1 }))).toBe(
      "No settled workflows in the last 1 day.",
    );
  });

  it("rounds a measured window down to one decimal, never up to a whole one", () => {
    const over = (d: number) => settledWindowSentence(zero({ window_days: d }));
    expect(over(6.96)).toContain("over the last 6.9 days of ledger history");
    expect(over(6.9)).toContain("over the last 6.9 days of ledger history");
    expect(over(6.94)).toContain("over the last 6.9 days of ledger history");
    expect(over(0.3)).toContain("over the last 0.3 days of ledger history");
    expect(over(1.05)).toContain("over the last 1 day of ledger history");
    // Float noise on exactly seven days is still seven, not 6.9.
    expect(over(7 - 1e-12)).toContain("over the last 7 days of ledger history");
    expect(noSettledSentence(zero({ window_days: 6.96 }))).toBe(
      "No settled workflows in the last 6.9 days.",
    );
  });

  it("does not call a window under a tenth of a day zero", () => {
    expect(settledWindowSentence(zero({ window_days: 0.04 }))).toContain(
      "over the last 0.1 days or less of ledger history",
    );
    expect(noSettledSentence(zero({ window_days: 0.04 }))).toBe(
      "No settled workflows in the last 0.1 days or less.",
    );
  });

  it("says nothing about a window when no scan ran", () => {
    for (const d of [0, 0.0, -1]) {
      expect(settledWindowSentence(zero({ window_days: d }))).toBeNull();
      expect(noSettledSentence(zero({ window_days: d }))).toBe(
        "No settled workflows yet.",
      );
    }
  });

  it("says nothing about a window the backend does not send", () => {
    const a: Record<string, unknown> = { ...zero() };
    delete a.window_days;
    expect(settledWindowSentence(a as EcosystemAdoption)).toBeNull();
    expect(settledWindowSentence(zero({ window_days: null }))).toBeNull();
    expect(noSettledSentence(zero({ window_days: null }))).toBe(
      "No settled workflows yet.",
    );
  });
});

describe("formatting", () => {
  it("shortens an address, and leaves a short one alone", () => {
    expect(shortAddress(TEAM)).toBe("GA7A…XXXX");
    expect(shortAddress("GABC")).toBe("GABC");
  });

  it("prints an amount in the asset the network reports, XLM on testnet", () => {
    expect(formatSettledAmount(0.01, "native")).toBe("0.01 XLM");
    expect(formatSettledAmount(0.0000001, "native")).toBe("0.0000001 XLM");
    expect(formatSettledAmount(1234.5, "usdc")).toBe("1,234.5 USDC");
  });

  it("never labels an amount USDC off the field name, and claims no unit it does not know", () => {
    expect(formatSettledAmount(0.01, null)).toBe("0.01");
    expect(formatSettledAmount(0.01, undefined)).toBe("0.01");
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

  it("reads the adoption path every time, as a cached read", async () => {
    fetchMock.mockResolvedValue(answer(zero()));
    await getEcosystemAdoption();
    await getEcosystemAdoption();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/ecosystem/adoption");
    // Never `no-store`: its Pragma would make Vercel's CDN refresh the
    // minutes-long read in the foreground instead of serving the snapshot.
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ cache: "default" });
  });

  it("rejects a 202 as a report still being built, with its Retry-After", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 202,
      headers: new Headers({ "retry-after": "30" }),
      json: async () => ({
        status: "computing",
        message: "The adoption report is being computed.",
        retry_after_seconds: 30,
      }),
      text: async () => "",
    });
    const err = await getEcosystemAdoption().catch((e: unknown) => e);
    expect(isComputingError(err)).toBe(true);
    expect(err).toMatchObject({ status: 202, retryAfterMs: 30_000 });
    expect(isTransientFetchError(err)).toBe(true);
  });

  it("lets the caller cancel the read", async () => {
    fetchMock.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () =>
            reject(new Error("The operation was aborted")),
          );
        }),
    );
    const caller = new AbortController();
    const out = getEcosystemAdoption(caller.signal).catch((e: unknown) => e);
    caller.abort();
    expect((await out) as Error).toMatchObject({ name: "AbortError" });
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

describe("a partial report (complete: false)", () => {
  const coverage = {
    agents_listed: 9,
    agents_accounted: 7,
    settlement_ledgers_scanned: 4_200,
    settlement_ledgers_in_window: 120_960,
    external_charges: 12,
    external_charges_unattributed: 3,
  };

  it("is accepted with its coverage, and from a backend predating both", () => {
    expect(isEcosystemAdoption(zero({ complete: false, coverage }))).toBe(true);
    expect(isEcosystemAdoption(zero({ complete: true, coverage: null }))).toBe(
      true,
    );
    expect(
      isEcosystemAdoption(
        zero({ coverage: { ...coverage, agents_listed: null } }),
      ),
    ).toBe(true);
    expect(isEcosystemAdoption(zero())).toBe(true);
  });

  // Strict, like `met`: the string "false" is truthy, and a non-boolean here
  // decides whether every figure on the page is called a lower bound.
  it("is refused when complete is not a boolean", () => {
    for (const complete of ["false", 0, 1, {}]) {
      expect(
        isEcosystemAdoption({ ...zero(), complete }),
        JSON.stringify(complete),
      ).toBe(false);
    }
  });

  it("is refused when a coverage figure is missing or not a number", () => {
    const { external_charges: _drop, ...missing } = coverage;
    for (const bad of [
      missing,
      { ...coverage, agents_accounted: "7" },
      { ...coverage, agents_listed: "9" },
      "partial",
    ]) {
      expect(
        isEcosystemAdoption({ ...zero(), coverage: bad }),
        JSON.stringify(bad),
      ).toBe(false);
    }
  });

  it("says nothing for a complete report, or one predating the field", () => {
    expect(partialReport(zero({ complete: true, coverage }))).toBeNull();
    expect(partialReport(zero())).toBeNull();
    expect(partialReport(zero({ complete: null }))).toBeNull();
  });

  it("marks the figures as lower bounds being refreshed", () => {
    const p = partialReport(zero({ complete: false, coverage }));
    expect(p?.headline).toBe("Partial — figures are lower bounds, refreshing.");
  });

  it("says how much was read, in plain counts", () => {
    expect(partialReport(zero({ complete: false, coverage }))?.details).toEqual(
      [
        "Agents accounted for: 7 of 9 listed.",
        "Settlement history read: 4,200 of 120,960 ledgers.",
        "3 of 12 charges to external agents have no payer read yet, so they are not counted.",
      ],
    );
  });

  it("says a listing or a history it could not read, never a zero", () => {
    const p = partialReport(
      zero({
        complete: false,
        coverage: {
          ...coverage,
          agents_listed: null,
          settlement_ledgers_scanned: 0,
          settlement_ledgers_in_window: 0,
          external_charges: 0,
          external_charges_unattributed: 0,
        },
      }),
    );
    expect(p?.details).toEqual([
      "Agents accounted for: 7 — the registry listing could not be read, so how many exist is unknown.",
      "Settlement history could not be read in this build.",
    ]);
  });

  it("has no details when the backend sent no coverage", () => {
    expect(
      partialReport(zero({ complete: false, coverage: null }))?.details,
    ).toEqual([]);
  });

  it("leaves the degraded sentence to the partial marker unless agents are named", () => {
    expect(
      unverifiedSentence(zero({ complete: false, degraded: true })),
    ).toBeNull();
    expect(
      unverifiedSentence(
        zero({ complete: false, degraded: true, unreadable_agents: ["a"] }),
      ),
    ).toMatch(/^Couldn't verify 1 agent/);
  });
});
