/**
 * Unit tests for lib/disputes.ts — the buyer's side of stories 4.05 and 4.06.
 *
 * Everything the receipt panel and the dispute dialog decide is decided here,
 * so this suite is where each product rule is pinned: who may act on which
 * step until when, what a shared-trace viewer may see, how an old backend is
 * tolerated, the challenge → sign → open sequence with its single retry, and
 * what each dispute's receipt may claim about its refund and rating.
 *
 * `globalThis.fetch` is stubbed exactly as lib/api.test.ts stubs it — no
 * network, no DOM — and `window.sessionStorage` is a Map so the task read
 * token wiring is observable.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "./api";
import {
  DisputeRefusal,
  agentLabel,
  createDisputeChallenge,
  disputeErrorCode,
  disputeReceipt,
  disputeView,
  formatCreditShare,
  formatRemaining,
  formatUsdc,
  getTaskDisputes,
  MAX_DISPUTE_REASON_CHARS,
  openDispute,
  raiseDispute,
  receiptBadgeStatus,
  serverClockOffsetMs,
} from "./disputes";
import { formatSettled } from "./money";
import { rememberTaskToken } from "./task-tokens";
import { classifyError } from "./wallet-errors";
import type {
  CreditPolicy,
  Dispute,
  DisputeArtifact,
  DisputeChallenge,
  DisputeErrorCode,
  DisputePanelView,
  DisputeViewer,
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

  it("accepts an older backend's dispute, which sends none of the receipt fields", async () => {
    // dispute() is the 4.05 shape: not one of story 4.06's four keys.
    const body = taskDisputes({
      disputes: [dispute(1, { status: "credited" })],
    });
    fetchMock.mockResolvedValueOnce(jsonResponse(200, body));

    const res = await getTaskDisputes(TASK);
    expect(res).toEqual(body);
    for (const key of [
      "credited_usdc",
      "updated_at",
      "rating_confirmed",
      "rejection_reason",
    ]) {
      expect(key in (res.disputes[0] ?? {})).toBe(false);
    }
  });

  it("accepts a newer backend's dispute carrying every receipt field", async () => {
    const body = taskDisputes({
      disputes: [
        dispute(1, {
          status: "credited",
          resolved_at: SETTLED_AT + 600,
          refund_tx: "tx_refund",
          rating_tx: "tx_rating",
          credited_usdc: 0.004,
          updated_at: SETTLED_AT + 900,
          rating_confirmed: true,
        }),
        dispute(2, {
          status: "rejected",
          resolved_at: SETTLED_AT + 600,
          rejection_reason: "the output matched the brief",
          rating_confirmed: false,
        }),
      ],
    });
    fetchMock.mockResolvedValueOnce(jsonResponse(200, body));

    await expect(getTaskDisputes(TASK)).resolves.toEqual(body);
  });

  it("accepts each receipt field as an explicit null", async () => {
    const body = taskDisputes({
      disputes: [
        dispute(1, {
          credited_usdc: null,
          updated_at: null,
          rating_confirmed: null,
          rejection_reason: null,
        }),
      ],
    });
    fetchMock.mockResolvedValueOnce(jsonResponse(200, body));

    await expect(getTaskDisputes(TASK)).resolves.toEqual(body);
  });

  /** A dispute carrying `field` with a value of the wrong type. */
  const mistyped = (field: string, value: unknown) =>
    taskDisputes({
      disputes: [{ ...dispute(0), [field]: value } as Dispute],
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
    // Absent is an older backend; present and mistyped is a broken one.
    ["a credited amount sent as a string", mistyped("credited_usdc", "0.004")],
    ["an updated_at that is not a number", mistyped("updated_at", "later")],
    [
      "a rating confirmation of the truthy string 'false'",
      mistyped("rating_confirmed", "false"),
    ],
    ["a rating confirmation sent as 1", mistyped("rating_confirmed", 1)],
    [
      "a rejection reason that is not a string",
      mistyped("rejection_reason", 42),
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

  it("holds the stored dispute to the same receipt-field rules", async () => {
    const newer = { ...dispute(1), updated_at: SETTLED_AT + 60 };
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, newer))
      .mockResolvedValueOnce(
        jsonResponse(200, { ...dispute(1), updated_at: "now" }),
      );

    await expect(openDispute(req)).resolves.toEqual(newer);
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

  it("is 0 when the send time is not a number", () => {
    expect(serverClockOffsetMs(taskDisputes(), Number.NaN)).toBe(0);
  });

  it("is measured from the request, so the exchange is never counted as time left", () => {
    // A 45 s answer whose `now` was stamped as the request reached the
    // server. Measured on ARRIVAL this reads −45 s, putting the panel's clock
    // three quarters of a minute in the past and offering disputes the server
    // has already refused; measured from the request it is the 0 it should be.
    const sentAtMs = 1_000_000_000;
    const res = taskDisputes({ now: sentAtMs / 1_000 });

    expect(serverClockOffsetMs(res, sentAtMs)).toBe(0);
    expect(serverClockOffsetMs(res, sentAtMs + 45_000)).toBe(-45_000);
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

describe("disputeView — disputes from another job", () => {
  /** A re-execution of the same task: a second job, its own dispute. */
  const OTHER_JOB = "f".repeat(32);

  it("never pins another job's dispute onto this settlement's step", () => {
    // One task can hold more than one job while `res.settlement` is a single
    // record, so the step index alone does not identify a step. Keyed on it
    // the other run's dispute took this step's row: a credited badge, a final
    // refund amount and the other run's reason, on a step nobody disputed.
    const stray = dispute(0, {
      id: "dsp_other_job",
      job_id_hex: OTHER_JOB,
      status: "credited",
      refund_tx: "b".repeat(64),
      credited_usdc: 0.005,
      reason: "the other run's words",
    });

    const v = settled({ res: taskDisputes({ disputes: [stray] }) });
    expect(kinds(v)).toEqual({
      0: "disputable",
      1: "disputable",
      2: "disputable",
    });
  });

  it("keeps this job's dispute when both runs' disputes arrive together", () => {
    const stray = dispute(0, { id: "dsp_other_job", job_id_hex: OTHER_JOB });
    const mine = dispute(0, { id: "dsp_mine" });

    const v = settled({ res: taskDisputes({ disputes: [stray, mine] }) });
    const state = v.steps[0]?.state;
    expect(state?.kind).toBe("disputed");
    if (state?.kind !== "disputed") throw new Error("expected disputed");
    expect(state.dispute.id).toBe("dsp_mine");
  });
});

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
      receipt: disputeReceipt(dispute(1), "payer", policy),
    });
    expect(kinds(v)).toEqual({
      0: "disputable",
      1: "disputed",
      2: "disputable",
    });
  });

  it.each([
    ["someone else", OTHER, "other"],
    ["an anonymous viewer", null, "anonymous"],
  ] as const)(
    "shows %s THAT a step is disputed, never the buyer's words",
    (_, viewerAddress, viewer) => {
      const v = settled({
        res: taskDisputes({ disputes: [dispute(1, { status: "upheld" })] }),
        viewerAddress,
      });
      expect(v.steps[1]?.state).toEqual({
        kind: "disputed",
        dispute: {
          ...dispute(1, { status: "upheld" }),
          reason: "",
          rejection_reason: null,
        },
        showReason: false,
        receipt: disputeReceipt(
          dispute(1, { status: "upheld" }),
          viewer,
          policy,
        ),
      });
    },
  );

  it("builds each disputed step's receipt under the settlement's own policy", () => {
    const v = settled({
      res: taskDisputes({
        disputes: [dispute(0, { status: "credited", refund_tx: "tx_refund" })],
      }),
    });
    const state = v.steps[0]?.state;
    if (state?.kind !== "disputed") throw new Error("expected disputed");
    expect(state.receipt).toMatchObject({
      status: "credited",
      fundedBy: policy.funded_by,
      refund: { txHash: "tx_refund", state: "confirmed" },
      reason: "the summary was empty",
    });
  });

  it.each([
    ["someone else", OTHER],
    ["an anonymous viewer", null],
  ])(
    "hands %s no complaint text anywhere — not the reason, not the rejection",
    (_, viewerAddress) => {
      const rejected = dispute(1, {
        status: "rejected",
        resolved_at: SETTLED_AT + 600,
        rejection_reason: "the summary covered the whole brief",
      });
      const v = settled({
        res: taskDisputes({ disputes: [rejected] }),
        viewerAddress,
      });
      const text = JSON.stringify(v);
      expect(text).not.toContain(rejected.reason);
      expect(text).not.toContain("the summary covered the whole brief");
      expect(v.steps[1]?.state).toMatchObject({
        receipt: { status: "rejected", reason: null, rejectionReason: null },
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

// ── the receipt (story 4.06) ────────────────────────────────────

describe("disputeReceipt", () => {
  const RESOLVED_AT = SETTLED_AT + 600;
  const UPDATED_AT = SETTLED_AT + 900;

  function receipt(
    over: Partial<Dispute> = {},
    viewer: DisputeViewer = "payer",
  ) {
    return disputeReceipt(dispute(1, over), viewer, policy);
  }

  it("states a freshly opened dispute: when, how much it would credit, and nothing moved", () => {
    expect(receipt()).toEqual({
      status: "open",
      openedAtMs: (SETTLED_AT + 60) * 1_000,
      lastChangedAtMs: (SETTLED_AT + 60) * 1_000,
      amount: { usdc: 0.005, final: false },
      fundedBy: "platform",
      refund: { txHash: null, state: "none" },
      rating: { txHash: null, state: "none" },
      reason: "the summary was empty",
      rejectionReason: null,
    });
  });

  it.each<Dispute["status"]>([
    "open",
    "upheld",
    "crediting",
    "credited",
    "rejected",
  ])("carries the %s status through unchanged", (status) => {
    expect(receipt({ status }).status).toBe(status);
  });

  it("names who funds the credit from the policy in force", () => {
    expect(receipt().fundedBy).toBe(policy.funded_by);
  });

  it("does not modify the dispute it was given", () => {
    const d = dispute(1, { status: "rejected", rejection_reason: "fine" });
    const before = structuredClone(d);
    disputeReceipt(d, "other", policy);
    expect(d).toEqual(before);
  });

  describe("the refund", () => {
    it.each<[Dispute["status"], string | null, DisputeArtifact]>([
      ["open", null, { txHash: null, state: "none" }],
      ["open", "tx_stray", { txHash: null, state: "none" }],
      // Decided, not yet sent. A hash left on an upheld record is a released
      // attempt that moved nothing, so it is never linked.
      ["upheld", null, { txHash: null, state: "pending" }],
      ["upheld", "tx_released", { txHash: null, state: "pending" }],
      // In flight: linked when there is a hash, so the buyer can watch it.
      ["crediting", null, { txHash: null, state: "pending" }],
      ["crediting", "tx_inflight", { txHash: "tx_inflight", state: "pending" }],
      ["credited", "tx_refund", { txHash: "tx_refund", state: "confirmed" }],
      ["rejected", null, { txHash: null, state: "none" }],
      ["rejected", "tx_stray", { txHash: null, state: "none" }],
    ])("reads %s with refund_tx %s as %o", (status, refund_tx, expected) => {
      expect(receipt({ status, refund_tx }).refund).toEqual(expected);
    });

    it.each([
      ["no refund_tx", null],
      ["an empty refund_tx", ""],
    ])(
      "never confirms a credited dispute with %s — pending, with nothing to link",
      (_, refund_tx) => {
        const r = receipt({
          status: "credited",
          refund_tx,
          credited_usdc: 0.004,
        });
        expect(r.refund).toEqual({ txHash: null, state: "pending" });
        // Nor does its amount read as paid: no confirmed transfer, no payment.
        expect(r.amount).toEqual({ usdc: 0.005, final: false });
      },
    );

    it("never links an empty in-flight hash", () => {
      expect(receipt({ status: "crediting", refund_tx: "" }).refund).toEqual({
        txHash: null,
        state: "pending",
      });
    });
  });

  describe("the rating", () => {
    it.each<[string, Partial<Dispute>, DisputeArtifact]>([
      ["no rating_tx", { rating_tx: null }, { txHash: null, state: "none" }],
      [
        "an empty rating_tx",
        { rating_tx: "" },
        { txHash: null, state: "none" },
      ],
      [
        "no rating_tx, whatever the confirmation claims",
        { rating_tx: null, rating_confirmed: true },
        { txHash: null, state: "none" },
      ],
      [
        "a confirmed rating_tx",
        { rating_tx: "tx_rating", rating_confirmed: true },
        { txHash: "tx_rating", state: "confirmed" },
      ],
      [
        "a rating_tx still in flight",
        { rating_tx: "tx_rating", rating_confirmed: false },
        { txHash: "tx_rating", state: "pending" },
      ],
      [
        "a rating_tx the backend cannot vouch for (null)",
        { rating_tx: "tx_rating", rating_confirmed: null },
        { txHash: "tx_rating", state: "pending" },
      ],
      [
        "a rating_tx from an older backend with no confirmation at all",
        { rating_tx: "tx_rating" },
        { txHash: "tx_rating", state: "pending" },
      ],
    ])("reads %s", (_, over, expected) => {
      expect(
        receipt({ status: "credited", refund_tx: "tx_refund", ...over }).rating,
      ).toEqual(expected);
    });

    it("never takes a hash alone as proof the agent was rated", () => {
      // 4.04 records the hash on a timeout exactly as on a success.
      const { rating_confirmed: _omitted, ...older } = dispute(1, {
        status: "credited",
        refund_tx: "tx_refund",
        rating_tx: "tx_rating",
      });
      expect(disputeReceipt(older, "payer", policy).rating.state).toBe(
        "pending",
      );
    });
  });

  describe("the amount", () => {
    it("is what the refund transferred, and final, once credited with the amount on record", () => {
      expect(
        receipt({
          status: "credited",
          refund_tx: "tx_refund",
          credited_usdc: 0.004,
        }).amount,
      ).toEqual({ usdc: 0.004, final: true });
    });

    it.each([
      ["no credited_usdc, as an older backend sends", {}],
      ["a null credited_usdc", { credited_usdc: null }],
    ])(
      "is the promise, not final, for a credited dispute with %s",
      (_, over) => {
        expect(
          receipt({ status: "credited", refund_tx: "tx_refund", ...over })
            .amount,
        ).toEqual({ usdc: 0.005, final: false });
      },
    );

    it.each<Dispute["status"]>(["open", "upheld", "crediting", "rejected"])(
      "is the promise, not final, while %s — even beside a stray credited_usdc",
      (status) => {
        expect(
          receipt({ status, refund_tx: "tx_x", credited_usdc: 0.004 }).amount,
        ).toEqual({ usdc: 0.005, final: false });
      },
    );
  });

  describe("the times", () => {
    it("puts the opening on epoch ms", () => {
      expect(receipt().openedAtMs).toBe((SETTLED_AT + 60) * 1_000);
    });

    it.each<[string, Partial<Dispute>, number]>([
      [
        "updated_at when the backend stamps it",
        { resolved_at: RESOLVED_AT, updated_at: UPDATED_AT },
        UPDATED_AT,
      ],
      [
        "resolved_at when updated_at is null",
        { resolved_at: RESOLVED_AT, updated_at: null },
        RESOLVED_AT,
      ],
      [
        "resolved_at from an older backend with no updated_at",
        { resolved_at: RESOLVED_AT },
        RESOLVED_AT,
      ],
      [
        "opened_at when nothing later was recorded",
        { resolved_at: null, updated_at: null },
        SETTLED_AT + 60,
      ],
    ])("dates the last change from %s", (_, over, seconds) => {
      expect(receipt(over).lastChangedAtMs).toBe(seconds * 1_000);
    });
  });

  describe("the words, for the payer alone", () => {
    const rejected: Partial<Dispute> = {
      status: "rejected",
      resolved_at: RESOLVED_AT,
      rejection_reason: "the summary covered the whole brief",
    };

    it("shows the payer their reason and why it was rejected", () => {
      expect(receipt(rejected)).toMatchObject({
        reason: "the summary was empty",
        rejectionReason: "the summary covered the whole brief",
      });
    });

    it.each<DisputeViewer>(["other", "anonymous"])(
      "gives a viewer who is %s neither the reason nor the rejection",
      (viewer) => {
        expect(receipt(rejected, viewer)).toMatchObject({
          reason: null,
          rejectionReason: null,
        });
      },
    );

    it.each<[string, Partial<Dispute>]>([
      ["no rejection_reason key", { rejection_reason: undefined }],
      ["a null rejection_reason", { rejection_reason: null }],
      ["a rejection_reason of only whitespace", { rejection_reason: " \n " }],
    ])("reads a rejection with %s as no reason given", (_, over) => {
      expect(receipt({ ...rejected, ...over }).rejectionReason).toBeNull();
    });

    it.each<Dispute["status"]>(["open", "upheld", "crediting", "credited"])(
      "never shows a rejection reason while %s",
      (status) => {
        expect(
          receipt({ status, rejection_reason: "left over" }).rejectionReason,
        ).toBeNull();
      },
    );
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

// ── formatting ──────────────────────────────────────────────────

const S = 1_000;
const M = 60 * S;
const H = 60 * M;
const D = 24 * H;

describe("formatRemaining", () => {
  it.each([
    [26 * H + 30 * M, "1d 2h left"],
    [D, "1d left"],
    [D - 1, "23h 59m left"],
    [22 * H + 59 * M + 30 * S, "22h 59m left"],
    [5 * H, "5h left"],
    [H, "1h left"],
    [H - 1, "59m 59s left"],
    [4 * M + 12 * S + 900, "4m 12s left"],
    [4 * M, "4m left"],
    [M, "1m left"],
    [M - 1, "less than a minute left"],
    [1, "less than a minute left"],
  ])("formats %i ms as %s", (ms, label) => {
    expect(formatRemaining(ms)).toBe(label);
  });

  it.each([
    ["zero", 0],
    ["a negative", -5 * S],
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
  ])("reads %s as no time left — never negative, never zero", (_, ms) => {
    expect(formatRemaining(ms)).toBe("no time left");
  });

  it("never prints a zero unit or a minus sign across a whole day", () => {
    for (let ms = -2 * S; ms <= D + H; ms += 997) {
      const label = formatRemaining(ms);
      expect(label).not.toMatch(/(^|\s)0[dhms]\b/);
      expect(label).not.toContain("-");
    }
  });

  describe("against a running clock", () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it("counts down through the hour and minute boundaries to nothing", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(0);
      const closesAt = H + 30 * S;
      const left = () => formatRemaining(closesAt - Date.now());

      expect(left()).toBe("1h left");
      await vi.advanceTimersByTimeAsync(30 * S + 1);
      expect(left()).toBe("59m 59s left");
      await vi.advanceTimersByTimeAsync(58 * M + 59 * S);
      expect(left()).toBe("1m left"); // 60.999s
      await vi.advanceTimersByTimeAsync(S);
      expect(left()).toBe("less than a minute left"); // 59.999s
      await vi.advanceTimersByTimeAsync(M - 1);
      expect(left()).toBe("no time left");
    });
  });
});

describe("formatUsdc", () => {
  it.each([
    [0.05, "0.05 USDC"],
    [0.0025, "0.0025 USDC"],
    [1, "1.0 USDC"],
    [0, "0.0 USDC"],
    [1.23456789, "1.2345679 USDC"],
  ])("prints %d as %s", (n, label) => {
    expect(formatUsdc(n)).toBe(label);
  });

  it("does not round a fractional credit up to three places", () => {
    // Half of a 0.005 step: a fixed toFixed(3) would promise 0.003.
    expect(formatUsdc(0.005 * 0.5)).toBe("0.0025 USDC");
  });

  it("absorbs float noise at the stroop, the chain's own precision", () => {
    expect(formatUsdc(0.1 + 0.2)).toBe("0.3 USDC");
  });

  it("is lib/money's settled-value formatter, not a second definition", () => {
    expect(formatUsdc(0.0123)).toBe(formatSettled(123_000, "USDC"));
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY])(
    "prints %d as a dash rather than a broken figure",
    (n) => {
      expect(formatUsdc(n)).toBe("—");
    },
  );
});

describe("receiptBadgeStatus", () => {
  // Views are built by the real disputeReceipt(), so no case here is a
  // combination the data could never hand the badge.
  const badgeFor = (over: Partial<Dispute>) =>
    receiptBadgeStatus(disputeReceipt(dispute(0, over), "payer", policy));

  it("shows a confirmed credit as credited", () => {
    expect(
      badgeFor({
        status: "credited",
        refund_tx: "a".repeat(64),
        credited_usdc: 0.005,
      }),
    ).toBe("credited");
  });

  it("never shows a credit whose transfer is unconfirmed as credited", () => {
    // Recorded `credited` with no transfer on record: the badge must not read
    // "Refunded" above a line saying the transfer is not confirmed.
    expect(badgeFor({ status: "credited", refund_tx: null })).toBe("crediting");
  });

  it.each(["open", "upheld", "crediting", "rejected"] as const)(
    "passes %s through unchanged",
    (status) => {
      expect(badgeFor({ status })).toBe(status);
    },
  );
});

describe("formatCreditShare", () => {
  it.each([
    [0.5, "50%"],
    [0.125, "12.5%"],
    [0.0625, "6.25%"],
    [0, "0%"],
    [1, "100%"],
    [0.29, "29%"],
    [0.07, "7%"],
  ])("prints %d as %s", (fraction, label) => {
    expect(formatCreditShare(fraction)).toBe(label);
  });

  it("never rounds a share up — the buyer is never promised more than the policy pays", () => {
    // The receipt's Intl formatter at one decimal read this as "6.3%", a
    // larger credit than the backend will ever transfer.
    expect(formatCreditShare(0.0625)).toBe("6.25%");
    expect(formatCreditShare(0.06256)).toBe("6.25%");
    expect(formatCreditShare(0.999999)).toBe("99.99%");
  });

  it("is one definition for both the receipt and the dialog", () => {
    // The two components quote the SAME policy at the same buyer; anything
    // they could disagree on is a promise the buyer cannot rely on.
    for (let bps = 0; bps <= 10_000; bps += 7) {
      const label = formatCreditShare(bps / 10_000);
      expect(label).toBe(formatCreditShare(bps / 10_000));
      expect(Number(label.slice(0, -1))).toBeLessThanOrEqual(bps / 100);
    }
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY])(
    "prints %d as a dash rather than a broken figure",
    (n) => {
      expect(formatCreditShare(n)).toBe("—");
    },
  );
});

describe("agentLabel", () => {
  it("prefers the registered name", () => {
    expect(agentLabel(step(1, { agent_name: "Code Gen" }))).toBe("Code Gen");
  });

  it.each([
    ["null", null],
    ["empty", ""],
    ["only whitespace", "   "],
  ])("falls back to the agent id when the name is %s", (_, agent_name) => {
    // `agent_name ?? agent_id` let a blank through, and the dialog rendered
    // "Step 2 · ," where the receipt rendered the id.
    expect(agentLabel(step(1, { agent_name }))).toBe("agt_1");
  });

  it("trims a padded name rather than printing its padding", () => {
    expect(agentLabel(step(0, { agent_name: "  Code Gen  " }))).toBe(
      "Code Gen",
    );
  });
});
