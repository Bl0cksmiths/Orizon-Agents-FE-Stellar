/**
 * Unit tests for lib/disputes.ts — the buyer's side of story 4.05.
 *
 * Everything the receipt panel and the dispute dialog decide is decided here,
 * so this suite is where each product rule is pinned: who may act on which
 * step until when, what a shared-trace viewer may see, how an old backend is
 * tolerated, and the challenge → sign → open sequence with its single retry.
 *
 * `globalThis.fetch` is stubbed exactly as lib/api.test.ts stubs it — no
 * network, no DOM — and `window.sessionStorage` is a Map so the task read
 * token wiring is observable.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "./api";
import {
  DisputeRefusal,
  createDisputeChallenge,
  disputeErrorCode,
  disputeView,
  getTaskDisputes,
  MAX_DISPUTE_REASON_CHARS,
  openDispute,
  raiseDispute,
  serverClockOffsetMs,
} from "./disputes";
import { rememberTaskToken } from "./task-tokens";
import { classifyError } from "./wallet-errors";
import type {
  CreditPolicy,
  Dispute,
  DisputeChallenge,
  DisputeErrorCode,
  DisputePanelView,
  SettlementStepView,
  SettlementView,
  TaskDisputes,
} from "./types";

type FetchMockResponse = {
  ok: boolean;
  status: number;
  headers?: { get: (name: string) => string | null };
  json: () => Promise<unknown>;
  text: () => Promise<string>;
};

const fetchMock =
  vi.fn<(input: string, init?: RequestInit) => Promise<FetchMockResponse>>();
vi.stubGlobal("fetch", fetchMock);

const sessionStore = new Map<string, string>();
vi.stubGlobal("window", {
  sessionStorage: {
    getItem: (k: string) => sessionStore.get(k) ?? null,
    setItem: (k: string, v: string) => void sessionStore.set(k, v),
    removeItem: (k: string) => void sessionStore.delete(k),
    clear: () => sessionStore.clear(),
  },
});

afterEach(() => {
  fetchMock.mockReset();
  sessionStore.clear();
  vi.restoreAllMocks();
});

function jsonResponse(status: number, body: unknown): FetchMockResponse {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  };
}

/** The backend's error envelope, as app/main.py builds it. */
function refusal(status: number, code: string): FetchMockResponse {
  return jsonResponse(status, {
    detail: code,
    error: { code, message: code.replace(/_/g, " "), request_id: "req_1" },
  });
}

/** The init the Nth fetch was made with. */
function initOf(call: number): RequestInit {
  const init = fetchMock.mock.calls[call]?.[1];
  if (!init) throw new Error(`fetch call ${call} had no init`);
  return init;
}

// ── fixtures ────────────────────────────────────────────────────

const PAYER = "GBPAYER".padEnd(56, "A");
const OTHER = "GBOTHER".padEnd(56, "B");
const JOB = "0123456789abcdef0123456789abcdef";
const TASK = "task_9f2c";
/** Epoch seconds, server clock. */
const SETTLED_AT = 1_790_000_000;
const CLOSES_AT = SETTLED_AT + 86_400;

const policy: CreditPolicy = {
  credited_fraction: 0.5,
  funded_by: "platform",
  adjudicated_by: "platform",
};

function step(
  i: number,
  over: Partial<SettlementStepView> = {},
): SettlementStepView {
  return {
    step_index: i,
    agent_id: `agt_${i}`,
    agent_name: `agent ${i}`,
    price_usdc: 0.01,
    delivered: true,
    creditable_usdc: 0.005,
    output_summary: "wrote the summary",
    ...over,
  };
}

function settlement(over: Partial<SettlementView> = {}): SettlementView {
  return {
    job_id_hex: JOB,
    payer: PAYER,
    settled_at: SETTLED_AT,
    window_closes_at: CLOSES_AT,
    settled_usdc: 0.03,
    charge_tx: "tx_charge",
    proof_tx: "tx_proof",
    steps: [step(0), step(1), step(2)],
    policy,
    ...over,
  };
}

function dispute(i: number, over: Partial<Dispute> = {}): Dispute {
  return {
    id: `dsp_${i}`,
    job_id_hex: JOB,
    task_id: TASK,
    step_index: i,
    agent_id: `agt_${i}`,
    payer: PAYER,
    reason: "the summary was empty",
    status: "open",
    charged_usdc: 0.01,
    creditable_usdc: 0.005,
    opened_at: SETTLED_AT + 60,
    resolved_at: null,
    refund_tx: null,
    rating_tx: null,
    ...over,
  };
}

function taskDisputes(over: Partial<TaskDisputes> = {}): TaskDisputes {
  return {
    task_id: TASK,
    window_closes_at: CLOSES_AT,
    now: SETTLED_AT + 100,
    settlement: settlement(),
    disputes: [],
    ...over,
  };
}

function challenge(
  stepIndex: number,
  nonce = "n0nce",
  job = JOB,
): DisputeChallenge {
  return {
    message: `orizon-dispute:v1:${job}:${stepIndex}:${nonce}`,
    nonce,
    expires_at: SETTLED_AT + 400,
  };
}

// ── wire calls ──────────────────────────────────────────────────

describe("getTaskDisputes", () => {
  it("reads the task's disputes with no-store and resolves the parsed answer", async () => {
    const body = taskDisputes({ disputes: [dispute(1)] });
    fetchMock.mockResolvedValueOnce(jsonResponse(200, body));

    await expect(getTaskDisputes(TASK)).resolves.toEqual(body);
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/tasks/${TASK}/disputes`,
      expect.objectContaining({
        cache: "no-store",
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it("escapes the task id, which arrives from the page's query string", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, taskDisputes()));

    await getTaskDisputes("../agents?x=1");
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "/api/tasks/..%2Fagents%3Fx%3D1/disputes",
    );
  });

  it("sends the task read token when this session holds one, and no header otherwise", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, taskDisputes()));

    await getTaskDisputes(TASK);
    expect(initOf(0).headers).toBeUndefined();

    rememberTaskToken(TASK, "tok_abc");
    await getTaskDisputes(TASK);
    expect(initOf(1).headers).toEqual({ "X-Task-Token": "tok_abc" });
  });

  it("never replays a recent answer: every call is a fresh request", async () => {
    // The window's clock is measured on arrival, and a refresh after a submit
    // must see the dispute it opened — a deduped replay would get both wrong.
    fetchMock.mockResolvedValue(jsonResponse(200, taskDisputes()));

    await Promise.all([getTaskDisputes(TASK), getTaskDisputes(TASK)]);
    await getTaskDisputes(TASK);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("accepts a backend that predates `now` and `settlement`", async () => {
    const legacy = {
      task_id: TASK,
      window_closes_at: null,
      disputes: [],
    };
    fetchMock.mockResolvedValueOnce(jsonResponse(200, legacy));

    const res = await getTaskDisputes(TASK);
    expect(res).toEqual(legacy);
    expect("settlement" in res).toBe(false);
  });

  it("accepts an explicit null settlement — a run that has not settled", async () => {
    const body = taskDisputes({ settlement: null, window_closes_at: null });
    fetchMock.mockResolvedValueOnce(jsonResponse(200, body));

    await expect(getTaskDisputes(TASK)).resolves.toEqual(body);
  });

  const malformed: [string, unknown][] = [
    ["a non-object", "<html>bad gateway</html>"],
    ["a missing dispute list", { ...taskDisputes(), disputes: undefined }],
    ["a `now` that is not a number", { ...taskDisputes(), now: "soon" }],
    [
      "a string `delivered`, which would read as true",
      taskDisputes({
        settlement: settlement({
          steps: [{ ...step(0), delivered: "false" as unknown as boolean }],
        }),
      }),
    ],
    [
      "a fractional step index",
      taskDisputes({ settlement: settlement({ steps: [step(1.5)] }) }),
    ],
    [
      "a charge tx that is absent rather than null",
      {
        ...taskDisputes(),
        settlement: { ...settlement(), charge_tx: undefined },
      },
    ],
    [
      "a policy funded by someone other than the platform",
      taskDisputes({
        settlement: settlement({
          policy: { ...policy, funded_by: "agent" as "platform" },
        }),
      }),
    ],
    [
      "a credited fraction above one",
      taskDisputes({
        settlement: settlement({
          policy: { ...policy, credited_fraction: 1.5 },
        }),
      }),
    ],
    [
      "a dispute status this build cannot name",
      taskDisputes({
        disputes: [dispute(0, { status: "withdrawn" as Dispute["status"] })],
      }),
    ],
    [
      "a dispute with no resolved_at key",
      {
        ...taskDisputes(),
        disputes: [{ ...dispute(0), resolved_at: undefined }],
      },
    ],
  ];

  it.each(malformed)("rejects %s as a malformed response", async (_, body) => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, body));

    await expect(getTaskDisputes(TASK)).rejects.toThrow(
      `malformed response from /tasks/${TASK}/disputes`,
    );
  });

  it("rejects a refusal as an ApiError carrying the status and code", async () => {
    fetchMock.mockResolvedValueOnce(refusal(429, "rate_limited"));

    const err = await getTaskDisputes(TASK).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 429, code: "rate_limited" });
  });
});

describe("createDisputeChallenge", () => {
  it("posts the job and step and resolves the challenge", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, challenge(2)));

    await expect(
      createDisputeChallenge({ job_id_hex: JOB, step_index: 2 }),
    ).resolves.toEqual(challenge(2));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/disputes/challenge",
      expect.objectContaining({
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ job_id_hex: JOB, step_index: 2 }),
      }),
    );
  });

  it("accepts a newer message version: the backend owns the format", async () => {
    const v2 = { ...challenge(2), message: `orizon-dispute:v2:${JOB}:2:n0nce` };
    fetchMock.mockResolvedValueOnce(jsonResponse(200, v2));

    await expect(
      createDisputeChallenge({ job_id_hex: JOB, step_index: 2 }),
    ).resolves.toEqual(v2);
  });

  const misaddressed: [string, DisputeChallenge][] = [
    ["another step", challenge(3)],
    ["another job", challenge(2, "n0nce", "f".repeat(32))],
    [
      "a message that does not end with its nonce",
      { ...challenge(2), nonce: "other" },
    ],
    [
      "a bind challenge rather than a dispute",
      { ...challenge(2), message: `orizon-bind:v1:${JOB}:2:n0nce` },
    ],
  ];

  it.each(misaddressed)(
    "refuses a challenge for %s, before any wallet is asked to sign it",
    async (_, body) => {
      fetchMock.mockResolvedValueOnce(jsonResponse(200, body));

      await expect(
        createDisputeChallenge({ job_id_hex: JOB, step_index: 2 }),
      ).rejects.toThrow("challenge does not address step 2");
    },
  );

  it("refuses an empty nonce, which any message would end with", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { ...challenge(2), nonce: "" }),
    );

    await expect(
      createDisputeChallenge({ job_id_hex: JOB, step_index: 2 }),
    ).rejects.toThrow("malformed response from /disputes/challenge");
  });

  it("rejects the server's refusal with its code", async () => {
    fetchMock.mockResolvedValueOnce(refusal(404, "unknown_job"));

    await expect(
      createDisputeChallenge({ job_id_hex: JOB, step_index: 2 }),
    ).rejects.toMatchObject({ status: 404, code: "unknown_job" });
  });
});

describe("openDispute", () => {
  const req = {
    job_id_hex: JOB,
    step_index: 1,
    reason: "the summary was empty",
    payer: PAYER,
    nonce: "n0nce",
    signature_b64: "c2ln",
  };

  it("posts the signed request and resolves the stored dispute", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, dispute(1)));

    await expect(openDispute(req)).resolves.toEqual(dispute(1));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/disputes",
      expect.objectContaining({ method: "POST", body: JSON.stringify(req) }),
    );
  });

  it("rejects a duplicate as duplicate_dispute — the dispute is refetched, not read off the error", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(409, {
        detail: "duplicate_dispute",
        error: {
          code: "duplicate_dispute",
          message: "already disputed",
          request_id: "req_1",
        },
        dispute: dispute(1),
      }),
    );

    const err = await openDispute(req).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 409, code: "duplicate_dispute" });
  });

  it("rejects a malformed dispute rather than handing it to the panel", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { ...dispute(1), status: "closed" }),
    );

    await expect(openDispute(req)).rejects.toThrow(
      "malformed response from /disputes",
    );
  });
});

// ── error codes ─────────────────────────────────────────────────

describe("disputeErrorCode", () => {
  const contract: [DisputeErrorCode, number][] = [
    ["reason_required", 422],
    ["unknown_job", 404],
    ["signature_malformed", 400],
    ["challenge_expired", 400],
    ["not_the_payer", 403],
    ["dispute_window_closed", 409],
    ["step_not_settled", 409],
    ["nothing_was_charged", 409],
    ["duplicate_dispute", 409],
    ["rate_limited", 429],
  ];

  it.each(contract)("names %s off a %i", (code, status) => {
    expect(
      disputeErrorCode(new ApiError("refused", status, undefined, code)),
    ).toBe(code);
  });

  it("names a real server refusal end to end", async () => {
    fetchMock.mockResolvedValueOnce(refusal(409, "dispute_window_closed"));

    const err = await createDisputeChallenge({
      job_id_hex: JOB,
      step_index: 0,
    }).catch((e: unknown) => e);
    expect(disputeErrorCode(err)).toBe("dispute_window_closed");
  });

  it("returns null for a code the contract does not name", () => {
    expect(
      disputeErrorCode(new ApiError("bad", 422, undefined, "validation_error")),
    ).toBeNull();
    expect(disputeErrorCode(new ApiError("down", 503))).toBeNull();
  });

  it("reads any 429 as rate_limited, envelope or not", () => {
    // A proxy in front of the backend can throttle without the envelope; the
    // screen the buyer needs is the same.
    expect(disputeErrorCode(new ApiError("slow down", 429, 5_000))).toBe(
      "rate_limited",
    );
  });

  it("returns null for anything that is not a server or client refusal", () => {
    expect(disputeErrorCode(new Error("Failed to fetch"))).toBeNull();
    expect(disputeErrorCode("challenge_expired")).toBeNull();
    expect(disputeErrorCode({ code: "challenge_expired" })).toBeNull();
    expect(disputeErrorCode(null)).toBeNull();
  });

  it("names a client-side refusal by the code the server would have used", () => {
    const early = new DisputeRefusal("reason_required", "say why");
    expect(disputeErrorCode(early)).toBe("reason_required");
    expect(early).toBeInstanceOf(Error);
    expect(early).not.toBeInstanceOf(ApiError);
    expect(early.name).toBe("DisputeRefusal");
    expect(early.message).toBe("say why");
  });
});

// ── the server's clock ──────────────────────────────────────────

describe("serverClockOffsetMs", () => {
  it("is 0 when the backend sends no clock — the local one is trusted", () => {
    const { now: _omitted, ...legacy } = taskDisputes();
    expect(serverClockOffsetMs(legacy, 1_000)).toBe(0);
  });

  it("is positive when the server runs ahead of this browser", () => {
    const res = taskDisputes({ now: 1_000_090 });
    expect(serverClockOffsetMs(res, 1_000_000_000)).toBe(90_000);
  });

  it("is negative when the server runs behind", () => {
    const res = taskDisputes({ now: 999_999.5 });
    expect(serverClockOffsetMs(res, 1_000_000_000)).toBe(-500);
  });

  it("rounds the server's fractional seconds to whole milliseconds", () => {
    const res = taskDisputes({ now: 1_000_000.0004 });
    expect(serverClockOffsetMs(res, 1_000_000_000)).toBe(0);
  });

  it("is 0 when the arrival time is not a number", () => {
    expect(serverClockOffsetMs(taskDisputes(), Number.NaN)).toBe(0);
  });
});

// ── the panel, derived ──────────────────────────────────────────

/** Server-clock epoch ms of the window's close in the default fixture. */
const CLOSES_AT_MS = CLOSES_AT * 1_000;
/** An hour into a 24h window. */
const EARLY_MS = (SETTLED_AT + 3_600) * 1_000;

type ViewInput = Parameters<typeof disputeView>[0];
type SettledView = Extract<DisputePanelView, { kind: "settled" }>;

function view(over: Partial<ViewInput> = {}): DisputePanelView {
  return disputeView({
    res: taskDisputes(),
    viewerAddress: PAYER,
    workflowDone: true,
    nowMs: EARLY_MS,
    demo: false,
    ...over,
  });
}

function settled(over: Partial<ViewInput> = {}): SettledView {
  const v = view(over);
  if (v.kind !== "settled") throw new Error(`expected settled, got ${v.kind}`);
  return v;
}

/** Each step's state kind, by step index. */
function kinds(v: SettledView): Record<number, string> {
  return Object.fromEntries(
    v.steps.map(({ step: s, state }) => [s.step_index, state.kind]),
  );
}

describe("disputeView — hidden and not settled", () => {
  it("is hidden in demo mode, whatever the backend said", () => {
    expect(view({ demo: true })).toEqual({ kind: "hidden" });
  });

  it("is hidden until there is an answer — loading and failure are not 'not settled'", () => {
    expect(view({ res: null })).toEqual({ kind: "hidden" });
  });

  it("is hidden for a backend that predates the settlement field", () => {
    const { settlement: _omitted, ...legacy } = taskDisputes();
    expect(view({ res: legacy })).toEqual({ kind: "hidden" });
    expect(view({ res: legacy, workflowDone: false })).toEqual({
      kind: "hidden",
    });
  });

  it("is not settled while the run is still going", () => {
    expect(
      view({ res: taskDisputes({ settlement: null }), workflowDone: false }),
    ).toEqual({ kind: "not_settled", running: true });
  });

  it("is not settled — and not running — when a finished run charged nothing", () => {
    expect(
      view({ res: taskDisputes({ settlement: null }), workflowDone: true }),
    ).toEqual({ kind: "not_settled", running: false });
  });

  it("shows a settlement even before the page has seen the run finish", () => {
    // The backend records the settlement before it closes the stream.
    expect(view({ workflowDone: false }).kind).toBe("settled");
  });
});

describe("disputeView — the receipt", () => {
  it("carries the settlement onto the receipt in epoch ms", () => {
    const v = settled();
    expect(v).toMatchObject({
      kind: "settled",
      viewer: "payer",
      jobIdHex: JOB,
      payer: PAYER,
      settledAtMs: SETTLED_AT * 1_000,
      settledUsdc: 0.03,
      chargeTx: "tx_charge",
      proofTx: "tx_proof",
      policy,
    });
    expect(v.window).toEqual({
      open: true,
      closesAtMs: CLOSES_AT_MS,
      remainingMs: CLOSES_AT_MS - EARLY_MS,
    });
  });

  it("keeps a missing charge or proof tx as null", () => {
    const v = settled({
      res: taskDisputes({
        settlement: settlement({ charge_tx: null, proof_tx: null }),
      }),
    });
    expect(v.chargeTx).toBeNull();
    expect(v.proofTx).toBeNull();
  });

  it("orders the steps by index whatever order they arrived in", () => {
    const v = settled({
      res: taskDisputes({
        settlement: settlement({ steps: [step(2), step(0), step(1)] }),
      }),
    });
    expect(v.steps.map(({ step: s }) => s.step_index)).toEqual([0, 1, 2]);
  });

  it("does not modify the answer it was given", () => {
    const res = taskDisputes({
      settlement: settlement({ steps: [step(1), step(0)] }),
      disputes: [dispute(1)],
    });
    const before = structuredClone(res);
    view({ res, viewerAddress: OTHER });
    expect(res).toEqual(before);
  });
});

describe("disputeView — who is looking", () => {
  it("is anonymous with no wallet connected", () => {
    expect(settled({ viewerAddress: null }).viewer).toBe("anonymous");
    expect(settled({ viewerAddress: "" }).viewer).toBe("anonymous");
  });

  it("is the payer only for the exact recorded address", () => {
    expect(settled({ viewerAddress: PAYER }).viewer).toBe("payer");
  });

  it("is someone else for any other address", () => {
    expect(settled({ viewerAddress: OTHER }).viewer).toBe("other");
  });

  it("does not fold case: a re-cased G-address is not the payer", () => {
    // StrKey has one spelling, and the backend compares with `!=`; a folded
    // match here would offer an action the server is going to refuse.
    expect(settled({ viewerAddress: PAYER.toLowerCase() }).viewer).toBe(
      "other",
    );
  });
});

describe("disputeView — each step", () => {
  it("offers the payer every charged step while the window is open", () => {
    expect(kinds(settled())).toEqual({
      0: "disputable",
      1: "disputable",
      2: "disputable",
    });
  });

  it("offers nobody else an action: other and anonymous see view_only", () => {
    expect(kinds(settled({ viewerAddress: OTHER }))).toEqual({
      0: "view_only",
      1: "view_only",
      2: "view_only",
    });
    expect(kinds(settled({ viewerAddress: null }))).toEqual({
      0: "view_only",
      1: "view_only",
      2: "view_only",
    });
  });

  it("marks a step that did not deliver as not charged", () => {
    const v = settled({
      res: taskDisputes({
        settlement: settlement({
          steps: [step(0), step(1, { delivered: false, creditable_usdc: 0 })],
        }),
      }),
    });
    expect(kinds(v)).toEqual({ 0: "disputable", 1: "not_charged" });
  });

  it("marks a free step as not charged — there is nothing to credit back", () => {
    const v = settled({
      res: taskDisputes({
        settlement: settlement({ steps: [step(0, { price_usdc: 0 })] }),
      }),
    });
    expect(kinds(v)).toEqual({ 0: "not_charged" });
  });

  it("marks every step not charged when the settlement moved nothing", () => {
    const v = settled({
      res: taskDisputes({ settlement: settlement({ settled_usdc: 0 }) }),
    });
    expect(kinds(v)).toEqual({
      0: "not_charged",
      1: "not_charged",
      2: "not_charged",
    });
  });

  it("keeps an undelivered step not charged even if a dispute names it", () => {
    const v = settled({
      res: taskDisputes({
        settlement: settlement({ steps: [step(0, { delivered: false })] }),
        disputes: [dispute(0)],
      }),
    });
    expect(kinds(v)).toEqual({ 0: "not_charged" });
  });

  it("shows the payer their own dispute, reason and all", () => {
    const v = settled({ res: taskDisputes({ disputes: [dispute(1)] }) });
    expect(v.steps[1]?.state).toEqual({
      kind: "disputed",
      dispute: dispute(1),
      showReason: true,
    });
    expect(kinds(v)).toEqual({
      0: "disputable",
      1: "disputed",
      2: "disputable",
    });
  });

  it.each([
    ["someone else", OTHER],
    ["an anonymous viewer", null],
  ])(
    "shows %s THAT a step is disputed, never the buyer's words",
    (_, viewerAddress) => {
      const v = settled({
        res: taskDisputes({ disputes: [dispute(1, { status: "upheld" })] }),
        viewerAddress,
      });
      expect(v.steps[1]?.state).toEqual({
        kind: "disputed",
        dispute: { ...dispute(1, { status: "upheld" }), reason: "" },
        showReason: false,
      });
    },
  );

  it("keeps a dispute on its step after the window has closed", () => {
    const v = settled({
      res: taskDisputes({ disputes: [dispute(2)] }),
      nowMs: CLOSES_AT_MS + 1,
    });
    expect(kinds(v)).toEqual({
      0: "window_closed",
      1: "window_closed",
      2: "disputed",
    });
  });

  it.each([
    ["the payer", PAYER],
    ["someone else", OTHER],
    ["an anonymous viewer", null],
  ])("shows %s window_closed on an undisputed step once closed", (_, who) => {
    const v = settled({ viewerAddress: who, nowMs: CLOSES_AT_MS + 60_000 });
    expect(kinds(v)).toEqual({
      0: "window_closed",
      1: "window_closed",
      2: "window_closed",
    });
  });

  it("ignores a dispute naming a step the settlement does not have", () => {
    const v = settled({ res: taskDisputes({ disputes: [dispute(9)] }) });
    expect(kinds(v)).toEqual({
      0: "disputable",
      1: "disputable",
      2: "disputable",
    });
  });
});

describe("disputeView — one dispute per step", () => {
  const first = dispute(1, { id: "dsp_b", opened_at: SETTLED_AT + 60 });
  const later = dispute(1, { id: "dsp_a", opened_at: SETTLED_AT + 90 });

  it.each([
    ["listed first", [first, later]],
    ["listed last", [later, first]],
  ])("keeps the earliest-opened dispute when it is %s", (_, disputes) => {
    const v = settled({ res: taskDisputes({ disputes }) });
    expect(v.steps[1]?.state).toMatchObject({
      kind: "disputed",
      dispute: { id: "dsp_b" },
    });
  });

  it("breaks an opened_at tie on the lower id, so order never decides", () => {
    const a = dispute(1, { id: "dsp_a" });
    const b = dispute(1, { id: "dsp_b" });
    for (const disputes of [
      [a, b],
      [b, a],
    ]) {
      const v = settled({ res: taskDisputes({ disputes }) });
      expect(v.steps[1]?.state).toMatchObject({ dispute: { id: "dsp_a" } });
    }
  });
});

describe("disputeView — the window, on the server's clock", () => {
  it("is open a millisecond before the close", () => {
    const v = settled({ nowMs: CLOSES_AT_MS - 1 });
    expect(v.window).toMatchObject({ open: true, remainingMs: 1 });
    expect(kinds(v)[0]).toBe("disputable");
  });

  it("is closed AT the close, with nothing left and nothing offered", () => {
    const v = settled({ nowMs: CLOSES_AT_MS });
    expect(v.window).toEqual({
      open: false,
      closesAtMs: CLOSES_AT_MS,
      remainingMs: 0,
    });
    expect(Object.values(kinds(v))).not.toContain("disputable");
  });

  it("never reports negative time after the close", () => {
    const v = settled({ nowMs: CLOSES_AT_MS + 86_400_000 });
    expect(v.window.remainingMs).toBe(0);
    expect(v.window.open).toBe(false);
  });

  it("fails shut on a clock that is not a number", () => {
    const v = settled({ nowMs: Number.NaN });
    expect(v.window).toMatchObject({ open: false, remainingMs: 0 });
    expect(Object.values(kinds(v))).not.toContain("disputable");
  });

  it("drops every action on the first tick past the close", () => {
    const before = settled({ nowMs: CLOSES_AT_MS - 500 });
    const after = settled({ nowMs: CLOSES_AT_MS + 500 });
    expect(Object.values(kinds(before))).toEqual([
      "disputable",
      "disputable",
      "disputable",
    ]);
    expect(Object.values(kinds(after))).toEqual([
      "window_closed",
      "window_closed",
      "window_closed",
    ]);
  });
});

// ── raising one ─────────────────────────────────────────────────

describe("raiseDispute", () => {
  /** A wallet that signs whatever it is shown, and remembers what that was. */
  const wallet = () =>
    vi.fn<(m: string) => Promise<string>>(async (m) => `sig(${m})`);

  function raise(over: Partial<Parameters<typeof raiseDispute>[0]> = {}) {
    return raiseDispute({
      settlement: settlement(),
      step: step(1),
      reason: "the summary was empty",
      payer: PAYER,
      signMessage: wallet(),
      ...over,
    });
  }

  /** The JSON body the Nth fetch posted. */
  const bodyOf = (call: number): unknown =>
    JSON.parse(String(initOf(call).body));

  const paths = () => fetchMock.mock.calls.map(([url]) => url);

  it("challenges, signs the server's message verbatim, then opens", async () => {
    // A message this build could not have composed itself: signing it proves
    // nothing was rebuilt client-side.
    const issued = {
      message: `orizon-dispute:v9:${JOB}:1:n1:issued-by-the-server`,
      nonce: "n1:issued-by-the-server",
      expires_at: SETTLED_AT + 400,
    };
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, issued))
      .mockResolvedValueOnce(jsonResponse(200, dispute(1)));
    const signMessage = wallet();

    await expect(
      raise({ signMessage, reason: "  the summary was empty \n" }),
    ).resolves.toEqual(dispute(1));

    expect(paths()).toEqual(["/api/disputes/challenge", "/api/disputes"]);
    expect(bodyOf(0)).toEqual({ job_id_hex: JOB, step_index: 1 });
    expect(signMessage).toHaveBeenCalledTimes(1);
    expect(signMessage).toHaveBeenCalledWith(issued.message);
    expect(bodyOf(1)).toEqual({
      job_id_hex: JOB,
      step_index: 1,
      reason: "the summary was empty",
      payer: PAYER,
      nonce: issued.nonce,
      signature_b64: `sig(${issued.message})`,
    });
  });

  it.each([
    ["an empty reason", ""],
    ["a reason of only whitespace", " \n\t "],
    [
      "a reason one character over the limit",
      "x".repeat(MAX_DISPUTE_REASON_CHARS + 1),
    ],
  ])("refuses %s before any network call", async (_, reason) => {
    const signMessage = wallet();

    const err = await raise({ reason, signMessage }).catch((e: unknown) => e);
    expect(disputeErrorCode(err)).toBe("reason_required");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(signMessage).not.toHaveBeenCalled();
  });

  it("accepts a reason at exactly the limit once trimmed", async () => {
    const words = "x".repeat(MAX_DISPUTE_REASON_CHARS);
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, challenge(1)))
      .mockResolvedValueOnce(jsonResponse(200, dispute(1)));

    await raise({ reason: `   ${words}\n\n` });
    expect(bodyOf(1)).toMatchObject({ reason: words });
  });

  it("refuses a wallet that is not the recorded payer before it is asked to sign", async () => {
    const signMessage = wallet();

    const err = await raise({ payer: OTHER, signMessage }).catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(DisputeRefusal);
    expect(disputeErrorCode(err)).toBe("not_the_payer");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(signMessage).not.toHaveBeenCalled();
  });

  it("retries once, with a fresh challenge and signature, when the nonce expired in the wallet", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, challenge(1, "n1")))
      .mockResolvedValueOnce(refusal(400, "challenge_expired"))
      .mockResolvedValueOnce(jsonResponse(200, challenge(1, "n2")))
      .mockResolvedValueOnce(jsonResponse(200, dispute(1)));
    const signMessage = wallet();

    await expect(raise({ signMessage })).resolves.toEqual(dispute(1));

    expect(paths()).toEqual([
      "/api/disputes/challenge",
      "/api/disputes",
      "/api/disputes/challenge",
      "/api/disputes",
    ]);
    expect(signMessage.mock.calls).toEqual([
      [challenge(1, "n1").message],
      [challenge(1, "n2").message],
    ]);
    expect(bodyOf(3)).toMatchObject({
      nonce: "n2",
      signature_b64: `sig(${challenge(1, "n2").message})`,
    });
  });

  it("throws on a second expiry rather than asking the wallet a third time", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, challenge(1, "n1")))
      .mockResolvedValueOnce(refusal(400, "challenge_expired"))
      .mockResolvedValueOnce(jsonResponse(200, challenge(1, "n2")))
      .mockResolvedValueOnce(refusal(400, "challenge_expired"));
    const signMessage = wallet();

    const err = await raise({ signMessage }).catch((e: unknown) => e);
    expect(disputeErrorCode(err)).toBe("challenge_expired");
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(signMessage).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["not_the_payer", 403],
    ["dispute_window_closed", 409],
    ["duplicate_dispute", 409],
    ["step_not_settled", 409],
    ["nothing_was_charged", 409],
    ["signature_malformed", 400],
    ["rate_limited", 429],
  ])("never retries %s", async (code, status) => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, challenge(1)))
      .mockResolvedValueOnce(refusal(status, code));
    const signMessage = wallet();

    const err = await raise({ signMessage }).catch((e: unknown) => e);
    expect(disputeErrorCode(err)).toBe(code);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(signMessage).toHaveBeenCalledTimes(1);
  });

  it("never retries a network failure", async () => {
    const dropped = new TypeError("Failed to fetch");
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, challenge(1)))
      .mockRejectedValueOnce(dropped);

    await expect(raise()).rejects.toBe(dropped);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("stops at a refused challenge without asking the wallet anything", async () => {
    fetchMock.mockResolvedValueOnce(refusal(409, "dispute_window_closed"));
    const signMessage = wallet();

    const err = await raise({ signMessage }).catch((e: unknown) => e);
    expect(disputeErrorCode(err)).toBe("dispute_window_closed");
    expect(signMessage).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("passes a declined wallet prompt through untouched, so the dialog can say 'cancelled'", async () => {
    const declined = new Error("User declined access");
    fetchMock.mockResolvedValueOnce(jsonResponse(200, challenge(1)));
    const signMessage = vi.fn<(m: string) => Promise<string>>(() =>
      Promise.reject(declined),
    );

    const err = await raise({ signMessage }).catch((e: unknown) => e);
    expect(err).toBe(declined);
    expect(classifyError(err).kind).toBe("user_rejected");
    expect(disputeErrorCode(err)).toBeNull();
    expect(paths()).toEqual(["/api/disputes/challenge"]);
  });

  it("passes a prompt declined on the retry through untouched too", async () => {
    const declined = new Error("User declined access");
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, challenge(1, "n1")))
      .mockResolvedValueOnce(refusal(400, "challenge_expired"))
      .mockResolvedValueOnce(jsonResponse(200, challenge(1, "n2")));
    const signMessage = vi
      .fn<(m: string) => Promise<string>>()
      .mockResolvedValueOnce("sig-1")
      .mockRejectedValueOnce(declined);

    await expect(raise({ signMessage })).rejects.toBe(declined);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
