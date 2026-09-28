/**
 * Unit tests for lib/readiness.ts: the guard, the request, and every rule the
 * onboarding checklist renders.
 *
 * The rules under test are the ones that fail quietly. A status the build
 * does not know must never read as done; a step the backend left out must
 * still be listed; the "next" step is the first one that is not done, even
 * when a later one is; and a re-check the backend answered from its cache
 * must say so rather than read as "nothing changed".
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  READINESS_STEP_KEYS,
  STATUS_TEXT,
  checklistSteps,
  evidenceLink,
  formatCheckedAt,
  getAgentReadiness,
  isAgentReadiness,
  nextStep,
  readinessPath,
  readinessStatus,
  recheckAnnouncement,
  stepLabel,
  stepLink,
  type AgentReadiness,
  type ChecklistStep,
  type ReadinessStep,
} from "./readiness";
import { explorerHref, httpsUrlOrNull } from "./explorer-href";

const AGENT = "weather_bot";
const TX = "9f2c41a8b7e04d5c8a1b2c3d4e5f60719f2c41a8b7e04d5c8a1b2c3d4e5f6071";

function step(over: Partial<ReadinessStep> = {}): ReadinessStep {
  return { key: "registered", status: "done", detail: "ok", ...over };
}

/** All seven steps, done unless `statuses` says otherwise. */
function readiness(
  statuses: Partial<Record<string, string>> = {},
  over: Partial<AgentReadiness> = {},
): AgentReadiness {
  return {
    agent_id: AGENT,
    checked_at: 1_759_046_400,
    ready: false,
    steps: READINESS_STEP_KEYS.map((key) => ({
      key,
      status: statuses[key] ?? "done",
      detail: `${key} detail`,
      action: null,
      evidence: null,
    })),
    ...over,
  };
}

function row(over: Partial<ChecklistStep> = {}): ChecklistStep {
  return {
    key: "bound",
    status: "todo",
    detail: "no endpoint",
    action: "Bind one",
    evidence: null,
    ...over,
  };
}

describe("isAgentReadiness", () => {
  it("accepts the frozen shape, with and without the optional fields", () => {
    expect(isAgentReadiness(readiness())).toBe(true);
    const r = readiness();
    r.steps[0] = {
      key: "registered",
      status: "done",
      detail: "on-chain",
      action: "nothing",
      evidence: { tx_hash: TX, explorer: "https://stellar.expert/x" },
    };
    delete r.steps[1].action;
    delete r.steps[1].evidence;
    expect(isAgentReadiness(r)).toBe(true);
  });

  it("accepts a status and a key it does not know — narrowing is the renderer's job", () => {
    expect(
      isAgentReadiness(
        readiness({}, { steps: [step({ key: "kyc", status: "pending" })] }),
      ),
    ).toBe(true);
  });

  it.each([
    ["a non-object", "nope"],
    ["an array", []],
    ["a missing agent_id", { ...readiness(), agent_id: undefined }],
    ["a string checked_at", { ...readiness(), checked_at: "1759046400" }],
    ["a NaN checked_at", { ...readiness(), checked_at: Number.NaN }],
    ["a truthy string ready", { ...readiness(), ready: "false" }],
    ["a missing ready", { ...readiness(), ready: undefined }],
    ["steps that are not a list", { ...readiness(), steps: {} }],
    [
      "a step without a key",
      { ...readiness(), steps: [{ status: "done", detail: "x" }] },
    ],
    [
      "a numeric status",
      { ...readiness(), steps: [step({ status: 1 as never })] },
    ],
    [
      "an object detail",
      { ...readiness(), steps: [step({ detail: {} as never })] },
    ],
    [
      "a numeric action",
      { ...readiness(), steps: [step({ action: 3 as never })] },
    ],
    [
      "evidence that is a string",
      { ...readiness(), steps: [step({ evidence: TX as never })] },
    ],
    [
      "a numeric tx hash",
      { ...readiness(), steps: [step({ evidence: { tx_hash: 7 as never } })] },
    ],
    [
      "an object explorer",
      {
        ...readiness(),
        steps: [step({ evidence: { explorer: {} as never } })],
      },
    ],
  ])("rejects %s", (_name, payload) => {
    expect(isAgentReadiness(payload)).toBe(false);
  });
});

describe("readinessStatus", () => {
  it.each(["done", "todo", "failed", "unknown"])("keeps %s", (s) => {
    expect(readinessStatus(s)).toBe(s);
  });

  it.each(["pending", "DONE", "", "complete"])(
    "narrows %j to unknown, never to done",
    (s) => {
      expect(readinessStatus(s)).toBe("unknown");
    },
  );
});

describe("checklistSteps", () => {
  it("lists the seven steps in the documented order whatever order they arrived in", () => {
    const r = readiness();
    r.steps.reverse();
    expect(checklistSteps(r).map((s) => s.key)).toEqual([
      ...READINESS_STEP_KEYS,
    ]);
  });

  it("lists a step the backend left out as couldn't-check, not as missing", () => {
    const r = readiness();
    r.steps = r.steps.filter((s) => s.key !== "reachable");
    const reachable = checklistSteps(r).find((s) => s.key === "reachable");
    expect(reachable?.status).toBe("unknown");
    expect(reachable?.detail).toBe("The backend did not report this step.");
  });

  it("appends a step this build does not know, after the seven", () => {
    const r = readiness();
    r.steps.splice(2, 0, step({ key: "kyc_passed", status: "todo" }));
    const keys = checklistSteps(r).map((s) => s.key);
    expect(keys).toHaveLength(8);
    expect(keys[7]).toBe("kyc_passed");
  });

  it("keeps the first answer for a repeated key", () => {
    const r = readiness();
    r.steps.push(step({ key: "registered", status: "failed" }));
    expect(checklistSteps(r)[0].status).toBe("done");
    expect(checklistSteps(r)).toHaveLength(7);
  });

  it("narrows an unknown status and defaults absent action and evidence to null", () => {
    const r = readiness({ bound: "weird" });
    delete r.steps[2].action;
    delete r.steps[2].evidence;
    expect(checklistSteps(r)[2]).toEqual({
      key: "bound",
      status: "unknown",
      detail: "bound detail",
      action: null,
      evidence: null,
    });
  });
});

describe("nextStep", () => {
  it("is null only when every step is done", () => {
    expect(nextStep(checklistSteps(readiness()))).toBeNull();
  });

  it("is the FIRST step not done, not the first todo", () => {
    const steps = checklistSteps(
      readiness({ reachable: "failed", routable: "todo", first_run: "todo" }),
    );
    expect(nextStep(steps)?.key).toBe("reachable");
  });

  it("treats an unchecked step as the next thing to look at", () => {
    const steps = checklistSteps(
      readiness({ active: "unknown", bound: "todo" }),
    );
    expect(nextStep(steps)?.key).toBe("active");
  });

  it("treats a status it cannot read as not done", () => {
    const steps = checklistSteps(readiness({ registered: "complete" }));
    expect(nextStep(steps)?.key).toBe("registered");
  });
});

describe("stepLabel and STATUS_TEXT", () => {
  it("names every documented step", () => {
    expect(READINESS_STEP_KEYS.map(stepLabel)).toEqual([
      "Registered on-chain",
      "Active",
      "Endpoint bound",
      "Endpoint reachable",
      "Routable",
      "First workflow run",
      "First settlement",
    ]);
  });

  it("shows an undocumented key as sent", () => {
    expect(stepLabel("kyc_passed")).toBe("kyc passed");
  });

  it("says every status in words", () => {
    expect(STATUS_TEXT).toEqual({
      done: "Done",
      todo: "To do",
      failed: "Failed",
      unknown: "Couldn't check",
    });
  });
});

describe("stepLink", () => {
  it.each([
    ["registered", "/app/register", "Open Register"],
    ["bound", "/app/bind?agent=weather_bot", "Open Bind"],
    ["reachable", "/app/bind?agent=weather_bot", "Open Bind"],
    ["routable", "/app/agents", "Open the marketplace"],
  ])("links %s to %s", (key, href, label) => {
    expect(stepLink(row({ key }), AGENT)).toEqual({ href, label });
  });

  it.each(["active", "first_run", "first_settlement", "kyc"])(
    "gives %s no page",
    (key) => {
      expect(stepLink(row({ key }), AGENT)).toBeNull();
    },
  );

  it("offers no link for a step that is already done", () => {
    expect(stepLink(row({ key: "bound", status: "done" }), AGENT)).toBeNull();
  });

  it("escapes the agent id into the bind link", () => {
    expect(stepLink(row({ key: "bound" }), "a b/c")?.href).toBe(
      "/app/bind?agent=a%20b%2Fc",
    );
  });
});

describe("evidenceLink", () => {
  it("is null without evidence", () => {
    expect(evidenceLink(row())).toBeNull();
    expect(evidenceLink(row({ evidence: {} }))).toBeNull();
  });

  it("links a tx hash to stellar.expert and labels it by its prefix", () => {
    expect(evidenceLink(row({ evidence: { tx_hash: TX } }))).toEqual({
      href: `https://stellar.expert/explorer/testnet/tx/${TX}`,
      label: "tx 9f2c41a8…",
    });
  });

  it("prefers the backend's https explorer URL", () => {
    const explorer = "https://stellar.expert/explorer/testnet/account/GABC";
    expect(evidenceLink(row({ evidence: { explorer } }))).toEqual({
      href: explorer,
      label: "evidence",
    });
  });

  it("never links a javascript: explorer URL, and falls back to the hash", () => {
    expect(
      evidenceLink(
        row({ evidence: { explorer: "javascript:alert(1)", tx_hash: TX } }),
      )?.href,
    ).toBe(`https://stellar.expert/explorer/testnet/tx/${TX}`);
    expect(
      evidenceLink(row({ evidence: { explorer: "javascript:alert(1)" } })),
    ).toBeNull();
  });
});

describe("httpsUrlOrNull and explorerHref", () => {
  it.each([
    ["https://stellar.expert/x", "https://stellar.expert/x"],
    ["http://stellar.expert/x", null],
    ["javascript:alert(1)", null],
    ["not a url", null],
    ["", null],
    [null, null],
    [undefined, null],
  ])("%j → %j", (raw, out) => {
    expect(httpsUrlOrNull(raw)).toBe(out);
  });

  it("builds an account link on the network it is given", () => {
    expect(explorerHref(null, "account", "GABC", "mainnet")).toBe(
      "https://stellar.expert/explorer/public/account/GABC",
    );
    expect(explorerHref(null, "account", null)).toBeNull();
  });
});

describe("formatCheckedAt", () => {
  it("prints a 24-hour HH:MM:SS", () => {
    expect(formatCheckedAt(1_759_046_400)).toMatch(/^\d{2}:\d{2}:\d{2}$/);
  });
});

describe("recheckAnnouncement", () => {
  it("names the agent, the count and the next step", () => {
    expect(
      recheckAnnouncement(
        readiness({ bound: "todo", reachable: "todo" }),
        1_759_046_000,
      ),
    ).toBe("Re-checked weather_bot: 5 of 7 steps done. Next: Endpoint bound.");
  });

  it("says when nothing is left", () => {
    expect(recheckAnnouncement(readiness(), null)).toBe(
      "Re-checked weather_bot: 7 of 7 steps done. Nothing left to do.",
    );
  });

  it("says the backend served its cached check when checked_at did not move", () => {
    const r = readiness({ bound: "todo" });
    const text = recheckAnnouncement(r, r.checked_at);
    expect(text).toContain(
      `Same check as before, from ${formatCheckedAt(r.checked_at)}: the backend caches it for about 30 seconds.`,
    );
  });
});

describe("getAgentReadiness", () => {
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);

  afterEach(() => fetchMock.mockReset());

  const ok = (body: unknown) => ({
    ok: true,
    status: 200,
    json: async () => body,
    text: async () => JSON.stringify(body),
  });

  it("reads the one readiness path, escaped", async () => {
    fetchMock.mockResolvedValue(ok(readiness()));
    await getAgentReadiness("a b");
    expect(fetchMock.mock.calls[0][0]).toBe("/api/agents/a%20b/readiness");
    // Nor by the browser's HTTP cache: only the backend's own cache is
    // allowed to answer, because that is the one the checklist explains.
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ cache: "no-store" });
    expect(readinessPath("x")).toBe("/agents/x/readiness");
  });

  it("goes to the network on every call — a re-check is never deduped", async () => {
    fetchMock.mockResolvedValue(ok(readiness()));
    await getAgentReadiness(AGENT);
    await getAgentReadiness(AGENT);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("rejects a malformed payload instead of rendering it", async () => {
    fetchMock.mockResolvedValue(ok({ ...readiness(), ready: "yes" }));
    await expect(getAgentReadiness(AGENT)).rejects.toThrow(
      "malformed response from /agents/weather_bot/readiness",
    );
  });

  it("surfaces an HTTP failure with its status", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({ error: { code: "x", message: "rpc down" } }),
      text: async () => "",
    });
    await expect(getAgentReadiness(AGENT)).rejects.toThrow(
      "GET /agents/weather_bot/readiness → 503 — rpc down",
    );
  });
});
