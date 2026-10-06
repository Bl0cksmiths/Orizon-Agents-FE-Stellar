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

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
  formatAmount,
  getTaskDisputes,
  isPlatformAgent,
  MAX_DISPUTE_REASON_CHARS,
  openDispute,
  raiseDispute,
  ratingStillComing,
  receiptAwaitsChain,
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

  // D-067: the payer's read grant rides on the read beside the task token,
  // and only when the caller hands one over.
  it("sends the payer's read grant when given one, beside any task token", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, taskDisputes()));

    await getTaskDisputes(TASK, "grant_abc");
    expect(initOf(0).headers).toEqual({ "X-Dispute-Read-Grant": "grant_abc" });

    rememberTaskToken(TASK, "tok_abc");
    await getTaskDisputes(TASK, "grant_abc");
    expect(initOf(1).headers).toEqual({
      "X-Task-Token": "tok_abc",
      "X-Dispute-Read-Grant": "grant_abc",
    });

    await getTaskDisputes(TASK, null);
    expect(initOf(2).headers).toEqual({ "X-Task-Token": "tok_abc" });
  });

  it("reads reason_withheld where it is sent, and passes a backend without it", async () => {
    const withheld = dispute(1, { reason: "", reason_withheld: true });
    const legacy = dispute(2);
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, taskDisputes({ disputes: [withheld, legacy] })),
    );
    const res = await getTaskDisputes(TASK);
    expect(res.disputes).toEqual([withheld, legacy]);
    expect(res.disputes[1]).not.toHaveProperty("reason_withheld");
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
          refund_confirmed: null,
        }),
      ],
    });
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
  ];

  it.each(malformed)("rejects %s as a malformed response", async (_, body) => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, body));

    await expect(getTaskDisputes(TASK)).rejects.toThrow(
      `malformed response from /tasks/${TASK}/disputes`,
    );
  });

  // A row this build cannot read costs that row, never the receipt. The
  // frontend deploys ahead of the backend in BOTH directions, so a newer
  // backend that widens a dispute must not blank the settlement, the steps
  // and every other dispute — and with the snapshot kept on error, a payload
  // that fails outright leaves the panel polling and failing every 5 s
  // forever under a permanent banner.
  const unreadableRow: [string, unknown][] = [
    ["no resolved_at key", { ...dispute(0), resolved_at: undefined }],
    // Absent is an older backend; present and mistyped is a broken one.
    [
      "a credited amount sent as a string",
      { ...dispute(0), credited_usdc: "0.004" },
    ],
    [
      "an updated_at that is not a number",
      { ...dispute(0), updated_at: "later" },
    ],
    [
      "a rating confirmation of the truthy string 'false'",
      { ...dispute(0), rating_confirmed: "false" },
    ],
    ["a rating confirmation sent as 1", { ...dispute(0), rating_confirmed: 1 }],
    [
      "a refund confirmation of the truthy string 'false'",
      { ...dispute(0), refund_confirmed: "false" },
    ],
    [
      "a rejection reason that is not a string",
      { ...dispute(0), rejection_reason: 42 },
    ],
    // D-067: it decides whether the payer is offered a wallet signature.
    [
      "a reason_withheld of the truthy string 'false'",
      { ...dispute(0), reason_withheld: "false" },
    ],
    [
      "a reason_withheld sent as null",
      { ...dispute(0), reason_withheld: null },
    ],
    ["a fractional step index", { ...dispute(0), step_index: 1.5 }],
    ["nothing at all", null],
  ];

  it.each(unreadableRow)(
    "drops a dispute with %s and keeps the rest of the receipt",
    async (_, row) => {
      const kept = dispute(2, { status: "open" });
      const body = { ...taskDisputes(), disputes: [row, kept] };
      fetchMock.mockResolvedValueOnce(jsonResponse(200, body));

      const res = await getTaskDisputes(TASK);
      expect(res.disputes).toEqual([kept]);
      expect(res.settlement).toEqual(settlement());
    },
  );

  it("keeps a dispute whose status this build cannot name, as one under review", async () => {
    // Dropping it would show the step as disputable again and walk the buyer
    // into a `duplicate_dispute`; claiming a status would claim an outcome.
    // Under review is what is certainly true: it was raised, and this build
    // cannot say what became of it.
    const body = taskDisputes({
      disputes: [dispute(0, { status: "withdrawn" as Dispute["status"] })],
    });
    fetchMock.mockResolvedValueOnce(jsonResponse(200, body));

    const res = await getTaskDisputes(TASK);
    expect(res.disputes).toEqual([dispute(0, { status: "open" })]);
  });

  it("does not let an unknown status claim a refund it cannot vouch for", async () => {
    const body = taskDisputes({
      disputes: [
        dispute(0, {
          status: "settled_in_full" as Dispute["status"],
          refund_tx: "a".repeat(64),
          credited_usdc: 0.005,
        }),
      ],
    });
    fetchMock.mockResolvedValueOnce(jsonResponse(200, body));

    const [row] = (await getTaskDisputes(TASK)).disputes;
    if (!row) throw new Error("expected the row to be kept");
    const receipt = disputeReceipt(row, "payer", policy);
    expect(receipt.refund.state).toBe("none");
    expect(receipt.amount.final).toBe(false);
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
    [
      "another job's step, with this one's buried inside the message",
      // A substring test reads this as addressing (JOB, 2). It is a
      // challenge for step 9 of someone else's job, and the wallet shows the
      // buyer an opaque string either way.
      {
        ...challenge(2),
        message: `orizon-dispute:v1:${"e".repeat(32)}:9:${JOB}:2:n0nce`,
      },
    ],
    [
      "a step whose number merely starts with this one's",
      { ...challenge(2), message: `orizon-dispute:v1:${JOB}:20:n0nce` },
    ],
    [
      "a domain that merely starts with the right one",
      { ...challenge(2), message: `orizon-dispute-v2:v1:${JOB}:2:n0nce` },
    ],
    [
      // The nonce must BE the tail, not merely end it.
      "a tail that only ends with the nonce",
      { ...challenge(2), message: `orizon-dispute:v1:${JOB}:2:extra:n0nce` },
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
    // A message that really does end in an empty segment, so the parse alone
    // would accept it: only the nonce guard stands in the way.
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        ...challenge(2),
        message: `orizon-dispute:v1:${JOB}:2:`,
        nonce: "",
      }),
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

  /** The backend's `duplicate_dispute` 409: the envelope plus the dispute. */
  const duplicate = (original: unknown) =>
    jsonResponse(409, {
      detail: "duplicate_dispute",
      error: {
        code: "duplicate_dispute",
        message: "already disputed",
        request_id: "req_1",
      },
      dispute: original,
    });

  it("rejects a duplicate as duplicate_dispute, carrying the original dispute off the 409", async () => {
    const original = dispute(1, { id: "dsp_first", status: "upheld" });
    fetchMock.mockResolvedValueOnce(duplicate(original));

    const err = await openDispute(req).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(DisputeRefusal);
    expect(disputeErrorCode(err)).toBe("duplicate_dispute");
    expect(err).toMatchObject({ dispute: original });
  });

  it("reads the original on the listing's terms: a status this build cannot name is kept as open", async () => {
    fetchMock.mockResolvedValueOnce(
      duplicate({ ...dispute(1), status: "under_review" }),
    );

    const err = await openDispute(req).catch((e: unknown) => e);
    expect(err).toMatchObject({
      code: "duplicate_dispute",
      dispute: { ...dispute(1), status: "open" },
    });
  });

  it.each([
    ["no dispute at all", undefined],
    ["a malformed dispute", { ...dispute(1), opened_at: "yesterday" }],
    ["another step's dispute", dispute(2)],
    ["another job's dispute", dispute(1, { job_id_hex: "e".repeat(32) })],
  ])(
    "still names a duplicate whose body carries %s, with no dispute to show",
    async (_, original) => {
      fetchMock.mockResolvedValueOnce(duplicate(original));

      const err = await openDispute(req).catch((e: unknown) => e);
      expect(disputeErrorCode(err)).toBe("duplicate_dispute");
      expect(err).toMatchObject({ dispute: null });
    },
  );

  /** A refusal carrying exactly this envelope message. */
  const refusedWith = (status: number, code: string, message: string) =>
    jsonResponse(status, {
      detail: code,
      error: { code, message, request_id: "req_1" },
    });

  it.each([
    [
      "the backend's one reason code",
      refusedWith(
        422,
        "reason_invalid",
        "a dispute reason must say what was wrong with the step in 1 to 500 characters, at least one of them visible",
      ),
      "A dispute reason must say what was wrong with the step in 1 to 500 characters, at least one of them visible.",
    ],
    [
      "the deployed backend's blank-reason code",
      refusedWith(422, "reason_required", "a dispute needs a reason."),
      "A dispute needs a reason.",
    ],
    [
      "an older backend's pydantic bound on the reason",
      jsonResponse(422, {
        detail: [
          {
            type: "string_too_long",
            loc: ["body", "reason"],
            msg: "String should have at most 500 characters",
          },
        ],
        error: {
          code: "validation_error",
          message: "request validation failed",
          request_id: "req_1",
        },
      }),
      "String should have at most 500 characters.",
    ],
  ])(
    "folds %s into one reason_invalid carrying the server's sentence",
    async (_, answer, message) => {
      fetchMock.mockResolvedValueOnce(answer);

      const err = await openDispute(req).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(DisputeRefusal);
      expect(disputeErrorCode(err)).toBe("reason_invalid");
      expect(err).toMatchObject({ message, dispute: null });
    },
  );

  it.each([
    [
      "a reason code with no sentence",
      refusedWith(422, "reason_invalid", "  "),
    ],
    [
      "a validation_error with no field list",
      refusedWith(422, "validation_error", "request validation failed"),
    ],
    [
      "a validation_error whose entries name no field",
      jsonResponse(422, {
        detail: [{ msg: "bad" }],
        error: {
          code: "validation_error",
          message: "request validation failed",
        },
      }),
    ],
    [
      "a reason entry with no message",
      jsonResponse(422, {
        detail: [{ loc: ["body", "reason"] }],
        error: {
          code: "validation_error",
          message: "request validation failed",
        },
      }),
    ],
  ])("states the rule itself for %s, naming the limit", async (_, answer) => {
    fetchMock.mockResolvedValueOnce(answer);

    const err = await openDispute(req).catch((e: unknown) => e);
    expect(disputeErrorCode(err)).toBe("reason_invalid");
    expect(err).toMatchObject({
      message: `Say what went wrong with this step in 1 to ${MAX_DISPUTE_REASON_CHARS} characters, at least one of them visible.`,
    });
  });

  it("leaves a validation_error on another field alone: the reason was fine", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(422, {
        detail: [
          {
            type: "string_pattern_mismatch",
            loc: ["body", "payer"],
            msg: "String should match pattern",
          },
        ],
        error: {
          code: "validation_error",
          message: "request validation failed",
        },
      }),
    );

    const err = await openDispute(req).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(disputeErrorCode(err)).toBeNull();
  });

  it("leaves a 422 that is not validation_error alone", async () => {
    fetchMock.mockResolvedValueOnce(refusal(422, "invented_later"));

    const err = await openDispute(req).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
  });

  it("rejects every other refusal as the ApiError it was", async () => {
    fetchMock.mockResolvedValueOnce(refusal(403, "not_the_payer"));

    const err = await openDispute(req).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 403, code: "not_the_payer" });
  });

  it("keeps a recorded dispute whose status this build cannot name, as the listing does", async () => {
    // The dispute exists by the time this answer arrives. Refusing it as
    // malformed invited a retry that cost a second signature and a 409.
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse(200, { ...dispute(1), status: "closed" }),
      )
      .mockResolvedValueOnce(
        jsonResponse(200, {
          ...taskDisputes(),
          disputes: [{ ...dispute(1), status: "closed" }],
        }),
      );

    const opened = await openDispute(req);
    const listed = await getTaskDisputes(TASK);
    expect(opened).toEqual({ ...dispute(1), status: "open" });
    expect(listed.disputes).toEqual([opened]);
  });

  it("rejects a malformed dispute rather than handing it to the panel", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { ...dispute(1), step_index: "one" }),
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
    ["reason_invalid", 422],
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
    // A bare `validation_error` names no field, so on its own it is not the
    // reason's refusal: `openDispute`, which knows the route and reads the
    // body, is what turns the reason's one into `reason_invalid`.
    expect(
      disputeErrorCode(new ApiError("bad", 422, undefined, "validation_error")),
    ).toBeNull();
    expect(
      disputeErrorCode(new ApiError("new", 409, undefined, "invented_later")),
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
    const early = new DisputeRefusal("reason_invalid", "say why");
    expect(disputeErrorCode(early)).toBe("reason_invalid");
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

// D-067: who is offered a signature to read their words again.
describe("disputeView — reasons the backend withheld", () => {
  const withheld = (over: Partial<Dispute> = {}) =>
    taskDisputes({
      disputes: [dispute(1, { reason: "", reason_withheld: true, ...over })],
    });

  it("tells the payer their words were withheld", () => {
    expect(settled({ res: withheld() }).reasonsWithheld).toBe(true);
  });

  it.each<[string, string | null]>([
    ["a wallet that did not pay", OTHER],
    ["no wallet", null],
  ])("never offers it to %s", (_, viewerAddress) => {
    expect(settled({ res: withheld(), viewerAddress }).reasonsWithheld).toBe(
      false,
    );
  });

  it("offers nothing when nothing was withheld, or the backend cannot say", () => {
    expect(
      settled({ res: withheld({ reason_withheld: false }) }).reasonsWithheld,
    ).toBe(false);
    expect(
      settled({ res: taskDisputes({ disputes: [dispute(1)] }) })
        .reasonsWithheld,
    ).toBe(false);
  });

  it("ignores another run's dispute, as every step does", () => {
    expect(
      settled({ res: withheld({ job_id_hex: "f".repeat(32) }) })
        .reasonsWithheld,
    ).toBe(false);
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

  // D-069: stalled only for a rating still owed, and only once the panel
  // has said it stopped reading for it.
  it("calls an owed rating stalled only once the wait is over", () => {
    const owed = dispute(1, {
      status: "credited",
      refund_tx: "tx_r",
      rating_tx: null,
      rating_confirmed: null,
    });
    expect(disputeReceipt(owed, "payer", policy).ratingStalled).toBe(false);
    expect(disputeReceipt(owed, "payer", policy, true).ratingStalled).toBe(
      true,
    );
    const rated = { ...owed, rating_tx: "tx_g", rating_confirmed: true };
    expect(disputeReceipt(rated, "payer", policy, true).ratingStalled).toBe(
      false,
    );
  });

  it("states a freshly opened dispute: when, how much it would credit, and nothing moved", () => {
    expect(receipt()).toEqual({
      status: "open",
      openedAtMs: (SETTLED_AT + 60) * 1_000,
      lastChangedAtMs: (SETTLED_AT + 60) * 1_000,
      amount: { usdc: 0.005, final: false },
      fundedBy: "platform",
      refund: { txHash: null, state: "none" },
      rating: { txHash: null, state: "none" },
      ratingStalled: false,
      stoppedChecking: false,
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

    it("believes a backend that says the transfer is not confirmed yet", () => {
      // The money artifact was the one held to the weaker rule: a hash alone
      // read as confirmed, and that was the sole gate on the final amount and
      // on the green "Refunded" badge. A backend that CAN tell the difference
      // is believed when it says no.
      const r = receipt({
        status: "credited",
        refund_tx: "tx_refund",
        refund_confirmed: false,
        credited_usdc: 0.004,
      });

      expect(r.refund).toEqual({ txHash: "tx_refund", state: "pending" });
      expect(r.amount).toEqual({ usdc: 0.005, final: false });
      expect(receiptBadgeStatus(r)).toBe("crediting");
    });

    it("confirms a credit the backend vouches for outright", () => {
      const r = receipt({
        status: "credited",
        refund_tx: "tx_refund",
        refund_confirmed: true,
        credited_usdc: 0.004,
      });

      expect(r.refund).toEqual({ txHash: "tx_refund", state: "confirmed" });
      expect(r.amount).toEqual({ usdc: 0.004, final: true });
    });

    it.each([
      ["absent", {}],
      ["null", { refund_confirmed: null }],
    ])(
      "keeps trusting a credited hash when the field is %s — that backend cannot tell",
      (_, over) => {
        // Today's backend sends no `refund_confirmed` at all. Reading absent
        // as "not confirmed" would show every real refund as unconfirmed for
        // ever. The invariant this leans on is the backend's own: `credited`
        // is written only after the transfer has landed, and `refund_tx` is
        // written with it. An explicit `false` is the only way to say no.
        const r = receipt({
          status: "credited",
          refund_tx: "tx_refund",
          credited_usdc: 0.004,
          ...over,
        });

        expect(r.refund).toEqual({ txHash: "tx_refund", state: "confirmed" });
        expect(r.amount).toEqual({ usdc: 0.004, final: true });
      },
    );
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
      ["a withheld (empty) rejection_reason", { rejection_reason: "" }],
    ])("reads a rejection with %s as no reason given", (_, over) => {
      expect(receipt({ ...rejected, ...over }).rejectionReason).toBeNull();
    });

    // D-068: the backend withholds the buyer's own words as "" — kept a
    // string for older clients' type guards — and an empty quote under
    // "Your reason" reads as though the buyer gave none.
    it.each<[string, string]>([
      ["withheld as an empty string", ""],
      ["only whitespace", " \n\t "],
    ])("gives the payer no reason at all when it is %s", (_, reason) => {
      expect(receipt({ ...rejected, reason }).reason).toBeNull();
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
  // Only Date is faked, and pinned to the fixture's own epoch: every
  // challenge here carries an `expires_at`, and a suite whose nonces are
  // alive or dead depending on the day it runs is no suite at all.
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(SETTLED_AT * 1_000);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

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

  it("re-requests a nonce that arrives already dead, before any wallet prompt", async () => {
    // Signing a dead nonce costs the buyer a wallet popup, a round trip and
    // `challenge_expired`, then a SECOND popup for the retry. The challenge
    // says when it dies; reading it spends one cheap request instead.
    const dead = { ...challenge(1, "dead"), expires_at: SETTLED_AT - 1 };
    const alive = { ...challenge(1, "alive"), expires_at: SETTLED_AT + 400 };
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, dead))
      .mockResolvedValueOnce(jsonResponse(200, alive))
      .mockResolvedValueOnce(jsonResponse(200, dispute(1)));
    const signMessage = wallet();

    await expect(raise({ signMessage })).resolves.toEqual(dispute(1));

    expect(paths()).toEqual([
      "/api/disputes/challenge",
      "/api/disputes/challenge",
      "/api/disputes",
    ]);
    expect(signMessage).toHaveBeenCalledTimes(1);
    expect(signMessage).toHaveBeenCalledWith(alive.message);
  });

  it("judges the nonce on the server's clock, not on this laptop's", async () => {
    // The laptop is an hour behind. On its own clock the nonce has five
    // minutes left; on the server's it died fifty-five minutes ago.
    const stale = { ...challenge(1, "stale"), expires_at: SETTLED_AT + 300 };
    const alive = { ...challenge(1, "alive"), expires_at: SETTLED_AT + 4_000 };
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, stale))
      .mockResolvedValueOnce(jsonResponse(200, alive))
      .mockResolvedValueOnce(jsonResponse(200, dispute(1)));
    const signMessage = wallet();

    await raise({ signMessage, offsetMs: 3_600_000 });

    expect(signMessage).toHaveBeenCalledTimes(1);
    expect(signMessage).toHaveBeenCalledWith(alive.message);
  });

  // D-060: the window closes on the server's clock, and a dialog can sit
  // open across it. Every refusal below costs the buyer nothing: no prompt.
  describe("the window", () => {
    const closed = (err: unknown) => {
      expect(err).toBeInstanceOf(DisputeRefusal);
      expect(disputeErrorCode(err)).toBe("dispute_window_closed");
    };

    it("refuses a closed window before asking for a challenge", async () => {
      vi.setSystemTime(CLOSES_AT * 1_000);
      const signMessage = wallet();

      closed(await raise({ signMessage }).catch((e: unknown) => e));
      expect(fetchMock).not.toHaveBeenCalled();
      expect(signMessage).not.toHaveBeenCalled();
    });

    it("judges the close on the server's clock, not on this laptop's", async () => {
      // The laptop reads a second before the close; the server, 2 s after.
      vi.setSystemTime(CLOSES_AT * 1_000 - 1_000);
      const signMessage = wallet();

      closed(
        await raise({ signMessage, offsetMs: 2_000 }).catch((e: unknown) => e),
      );
      expect(fetchMock).not.toHaveBeenCalled();
      expect(signMessage).not.toHaveBeenCalled();
    });

    it("lets a laptop that runs fast still dispute a window the server holds open", async () => {
      vi.setSystemTime(CLOSES_AT * 1_000 + 60_000);
      fetchMock
        .mockResolvedValueOnce(
          jsonResponse(200, { ...challenge(1), expires_at: CLOSES_AT + 300 }),
        )
        .mockResolvedValueOnce(jsonResponse(200, dispute(1)));

      await expect(raise({ offsetMs: -120_000 })).resolves.toEqual(dispute(1));
    });

    it("refuses before the signature when the window closes while the challenge is out", async () => {
      vi.setSystemTime(CLOSES_AT * 1_000 - 500);
      fetchMock.mockImplementationOnce(async () => {
        vi.setSystemTime(CLOSES_AT * 1_000);
        return jsonResponse(200, {
          ...challenge(1),
          expires_at: CLOSES_AT + 300,
        });
      });
      const signMessage = wallet();

      closed(await raise({ signMessage }).catch((e: unknown) => e));
      expect(paths()).toEqual(["/api/disputes/challenge"]);
      expect(signMessage).not.toHaveBeenCalled();
    });

    it("refuses the retry's second signature once the window has closed", async () => {
      vi.setSystemTime(CLOSES_AT * 1_000 - 5_000);
      fetchMock
        .mockResolvedValueOnce(
          jsonResponse(200, {
            ...challenge(1, "a"),
            expires_at: CLOSES_AT + 300,
          }),
        )
        .mockImplementationOnce(async () => {
          vi.setSystemTime(CLOSES_AT * 1_000 + 1);
          return refusal(400, "challenge_expired");
        });
      const signMessage = wallet();

      closed(await raise({ signMessage }).catch((e: unknown) => e));
      expect(paths()).toEqual(["/api/disputes/challenge", "/api/disputes"]);
      expect(signMessage).toHaveBeenCalledTimes(1);
    });

    it("judges the exact close it is handed over the settlement's rounded one", async () => {
      // The section rebuilds the settlement with the close rounded to the
      // second; the view's own `closesAtMs` is exact.
      const exact = CLOSES_AT * 1_000 - 400;
      vi.setSystemTime(exact);
      const signMessage = wallet();

      closed(
        await raise({ signMessage, windowClosesAtMs: exact }).catch(
          (e: unknown) => e,
        ),
      );
      expect(signMessage).not.toHaveBeenCalled();
    });

    it("fails shut on a close that is not a number", async () => {
      const signMessage = wallet();

      closed(
        await raise({ signMessage, windowClosesAtMs: Number.NaN }).catch(
          (e: unknown) => e,
        ),
      );
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  // The mint asks the same rules as opening, so each of these can now come
  // back from the CHALLENGE: an answer before any wallet is asked anything.
  it.each([
    "dispute_window_closed",
    "step_not_settled",
    "nothing_was_charged",
  ] satisfies DisputeErrorCode[])(
    "reads a challenge refused as %s by its code, and asks for no signature",
    async (code) => {
      fetchMock.mockResolvedValueOnce(refusal(409, code));
      const signMessage = wallet();

      const err = await raise({ signMessage }).catch((e: unknown) => e);
      expect(disputeErrorCode(err)).toBe(code);
      expect(paths()).toEqual(["/api/disputes/challenge"]);
      expect(signMessage).not.toHaveBeenCalled();
    },
  );

  it("reads a throttled challenge mint as rate_limited, with the wait it asked for", async () => {
    fetchMock.mockResolvedValueOnce({
      ...refusal(429, "dispute_challenge_rate_limited"),
      headers: {
        get: (name: string) => (name === "retry-after" ? "20" : null),
      },
    });
    const signMessage = wallet();

    const err = await raise({ signMessage }).catch((e: unknown) => e);
    expect(disputeErrorCode(err)).toBe("rate_limited");
    expect(err).toMatchObject({ status: 429, retryAfterMs: 20_000 });
    expect(paths()).toEqual(["/api/disputes/challenge"]);
    expect(signMessage).not.toHaveBeenCalled();
  });

  const deadAt = (n: string) => ({
    ...challenge(1, n),
    expires_at: SETTLED_AT - 1,
  });

  it("asks once more and then stops: a dead second nonce is never signed on a measured clock", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, deadAt("first")))
      .mockResolvedValueOnce(jsonResponse(200, deadAt("second")));
    const signMessage = wallet();

    const err = await raise({ signMessage, offsetMs: 0 }).catch(
      (e: unknown) => e,
    );

    // Two challenges, never three: a third would mean the clocks disagree
    // about more than latency, and looping on it would hang the dialog. Nor
    // is the second signed: this build already knows the server refuses it.
    expect(paths()).toEqual([
      "/api/disputes/challenge",
      "/api/disputes/challenge",
    ]);
    expect(err).toBeInstanceOf(DisputeRefusal);
    expect(disputeErrorCode(err)).toBe("challenge_expired");
    expect(signMessage).not.toHaveBeenCalled();
  });

  it("leaves a dead second nonce to the server when nothing measured its clock", async () => {
    // On the laptop's own clock, "dead" may only mean it runs fast: refusing
    // would lock that buyer out of every dispute.
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, deadAt("first")))
      .mockResolvedValueOnce(jsonResponse(200, deadAt("second")))
      .mockResolvedValueOnce(jsonResponse(200, dispute(1)));
    const signMessage = wallet();

    await expect(raise({ signMessage })).resolves.toEqual(dispute(1));
    expect(signMessage).toHaveBeenCalledTimes(1);
    expect(signMessage).toHaveBeenCalledWith(deadAt("second").message);
  });

  it("treats a nonce dying at this very moment as dead", async () => {
    const now = { ...challenge(1, "now"), expires_at: SETTLED_AT };
    const alive = { ...challenge(1, "alive"), expires_at: SETTLED_AT + 400 };
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, now))
      .mockResolvedValueOnce(jsonResponse(200, alive))
      .mockResolvedValueOnce(jsonResponse(200, dispute(1)));
    const signMessage = wallet();

    await raise({ signMessage });
    expect(signMessage).toHaveBeenCalledTimes(1);
    expect(signMessage).toHaveBeenCalledWith(alive.message);
  });

  it("asks for nothing extra when the nonce is alive", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, challenge(1)))
      .mockResolvedValueOnce(jsonResponse(200, dispute(1)));

    await raise();

    expect(paths()).toEqual(["/api/disputes/challenge", "/api/disputes"]);
  });

  const EMPTY_REASON = "Say what went wrong with this step, in words.";

  it.each([
    ["an empty reason", "", EMPTY_REASON],
    ["a reason of only whitespace", " \n\t ", EMPTY_REASON],
    [
      "a reason one character over the limit",
      "x".repeat(MAX_DISPUTE_REASON_CHARS + 1),
      `Keep the reason to ${MAX_DISPUTE_REASON_CHARS} characters — it is ${MAX_DISPUTE_REASON_CHARS + 1} now.`,
    ],
  ])(
    "refuses %s before any network call, in its own words",
    async (_, reason, message) => {
      const signMessage = wallet();

      const err = await raise({ reason, signMessage }).catch((e: unknown) => e);
      expect(disputeErrorCode(err)).toBe("reason_invalid");
      expect(err).toMatchObject({ message });
      expect(fetchMock).not.toHaveBeenCalled();
      expect(signMessage).not.toHaveBeenCalled();
    },
  );

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

describe("formatAmount", () => {
  // Testnet's escrow SAC wraps the native asset: every figure is XLM there.
  const xlm = (n: number) => formatAmount(n, "native");

  it.each([
    [0.05, "0.050 XLM"],
    [0.0025, "0.0025 XLM"],
    [1, "1.000 XLM"],
    [0, "0.000 XLM"],
    // Floored at the stroop: a figure the chain cannot move is not one the
    // receipt may print.
    [1.23456789, "1.2345678 XLM"],
  ])("prints %d as %s on testnet", (n, label) => {
    expect(xlm(n)).toBe(label);
  });

  // F-022: the unit is the network's asset, never the "usdc" in a field name.
  it("labels the native asset XLM, and never USDC", () => {
    expect(formatAmount(0.027, "native")).toBe("0.027 XLM");
    expect(formatAmount(0.027, "native")).not.toMatch(/USDC/);
  });

  it("prints no unit while the asset is unknown", () => {
    expect(formatAmount(0.027, null)).toBe("0.027");
    expect(formatAmount(0.027, undefined)).toBe("0.027");
    expect(formatAmount(0.027, "")).toBe("0.027");
  });

  it("names the asset the network reports, whatever it is", () => {
    expect(formatAmount(0.027, "usdc")).toBe("0.027 USDC");
  });

  it("never prints a stroop more than the chain can move", () => {
    // Half a stroop rounded UP promised a tenth of a millionth of a unit
    // that no transfer can carry.
    expect(xlm(0.00000005)).toBe("0.000 XLM");
    expect(xlm(0.00000015)).toBe("0.0000001 XLM");
    expect(xlm(0.0000001)).toBe("0.0000001 XLM");
  });

  it.each([
    [0.57, "0.570 XLM"],
    [1.13, "1.130 XLM"],
    [2.01, "2.010 XLM"],
  ])(
    "floors %d without letting binary noise eat a whole stroop",
    (n, label) => {
      // The premise, checked rather than asserted in a comment: each of
      // these lands BELOW its figure when scaled to stroops, so a bare floor
      // prints a stroop short.
      expect(Math.floor(n * 10_000_000)).toBeLessThan(
        Math.round(n * 10_000_000),
      );
      expect(xlm(n)).toBe(label);
    },
  );

  it.each([-0.005, -1, -0.0000001])(
    "prints %d as a dash: a negative refund is not a figure the receipt can state",
    (n) => {
      // Nothing rejects a negative credited amount upstream, and a minus sign
      // beside "Refunded" says the buyer paid the platform back.
      expect(xlm(n)).toBe("—");
      expect(formatAmount(n, null)).toBe("—");
    },
  );

  it("prints a negative zero as nothing, not as a minus", () => {
    expect(xlm(-0)).toBe("0.000 XLM");
  });

  it("does not round a fractional credit up to three places", () => {
    // Half of a 0.005 step: a fixed toFixed(3) would promise 0.003.
    expect(xlm(0.005 * 0.5)).toBe("0.0025 XLM");
  });

  it("absorbs float noise at the stroop, the chain's own precision", () => {
    expect(xlm(0.1 + 0.2)).toBe("0.300 XLM");
  });

  it("is lib/money's settled-value formatter, not a second definition", () => {
    expect(xlm(0.0123)).toBe(formatSettled(123_000, "native"));
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY])(
    "prints %d as a dash rather than a broken figure",
    (n) => {
      expect(xlm(n)).toBe("—");
    },
  );
});

// The two questions the poll asks of each dispute, asked directly: whether
// something is in flight on the chain, and whether a rating is still owed
// after a refund that landed. Each row is a record the backend can send.
describe("receiptAwaitsChain and ratingStillComing", () => {
  const TX = "a".repeat(64);
  const table: [string, Partial<Dispute>, boolean, boolean][] = [
    // [record, awaits the chain, rating still coming]
    ["open", { status: "open" }, false, false],
    ["rejected", { status: "rejected" }, false, false],
    ["upheld, not yet sent", { status: "upheld" }, true, false],
    [
      "crediting, hash on record",
      { status: "crediting", refund_tx: TX },
      true,
      false,
    ],
    ["crediting, no hash yet", { status: "crediting" }, true, false],
    [
      "credited with no transfer on record",
      { status: "credited", refund_tx: null, rating_confirmed: null },
      true,
      false,
    ],
    [
      "credited, the backend withdrawing its word",
      {
        status: "credited",
        refund_tx: TX,
        refund_confirmed: false,
        rating_confirmed: null,
      },
      true,
      false,
    ],
    [
      "credited and confirmed, rating not yet written",
      { status: "credited", refund_tx: TX, rating_confirmed: null },
      false,
      true,
    ],
    [
      "credited and confirmed, rating field absent (older backend)",
      { status: "credited", refund_tx: TX },
      false,
      false,
    ],
    [
      "credited, rating in flight with its hash",
      {
        status: "credited",
        refund_tx: TX,
        rating_tx: TX,
        rating_confirmed: false,
      },
      true,
      false,
    ],
    [
      "credited, a rating hash the backend cannot confirm either way",
      {
        status: "credited",
        refund_tx: TX,
        rating_tx: TX,
        rating_confirmed: null,
      },
      false,
      false,
    ],
    [
      "credited, rating confirmed",
      {
        status: "credited",
        refund_tx: TX,
        rating_tx: TX,
        rating_confirmed: true,
      },
      false,
      false,
    ],
  ];

  it.each(table)("%s", (_, over, awaits, ratingComing) => {
    const d = dispute(0, over);
    expect(receiptAwaitsChain(d)).toBe(awaits);
    expect(ratingStillComing(d)).toBe(ratingComing);
    // A receipt says it stopped reading for a rating only when one is owed.
    expect(disputeReceipt(d, "payer", policy, true).ratingStalled).toBe(
      ratingComing,
    );
  });
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
  ])("prints %d as %s", (fraction, label) => {
    expect(formatCreditShare(fraction)).toBe(label);
  });

  it.each([
    [0.57, "57%"],
    [0.0113, "1.13%"],
    [0.0029, "0.29%"],
  ])(
    "floors %d without letting binary noise eat a hundredth",
    (fraction, label) => {
      // As for `formatAmount`: the premise is checked, not assumed.
      expect(Math.floor(fraction * 10_000)).toBeLessThan(
        Math.round(fraction * 10_000),
      );
      expect(formatCreditShare(fraction)).toBe(label);
    },
  );

  it("never rounds a share up — the buyer is never promised more than the policy pays", () => {
    // The receipt's Intl formatter at one decimal read this as "6.3%", a
    // larger credit than the backend will ever transfer.
    expect(formatCreditShare(0.0625)).toBe("6.25%");
    expect(formatCreditShare(0.06256)).toBe("6.25%");
    expect(formatCreditShare(0.999999)).toBe("99.99%");
  });

  it("prints every whole hundredth of a percent exactly — never one over, never one short", () => {
    // Checked against the figure built from the integer, never from the
    // function under test: a policy of N basis points reads N/100 percent.
    for (let bps = 0; bps <= 10_000; bps += 1) {
      const whole = Math.trunc(bps / 100);
      const rest = bps % 100;
      const expected =
        rest === 0
          ? `${whole}%`
          : `${whole}.${String(rest).padStart(2, "0").replace(/0$/, "")}%`;
      expect(formatCreditShare(bps / 10_000)).toBe(expected);
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

// ── escrow v2: the settlement state, per-step payouts, the remainder ──

describe("getTaskDisputes — the escrow v2 settlement state", () => {
  const V2_STEP = {
    paid_usdc: 0.01,
    receipt_id_hex: "ab".repeat(16),
  };

  it("passes a state it knows through, with the v2 step fields", async () => {
    const body = taskDisputes({
      settlement_state: "settled",
      settlement: settlement({
        steps: [step(0, V2_STEP)],
        returned_usdc: 0.02,
      }),
    });
    fetchMock.mockResolvedValueOnce(jsonResponse(200, body));
    await expect(getTaskDisputes(TASK)).resolves.toEqual(body);
  });

  // A newer backend's word is not a reason to lose the receipt, and not a
  // reason to call the money paid either: it reads as the least claim.
  it("reads a state it cannot name as unconfirmed", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { ...taskDisputes(), settlement_state: "rebalanced" }),
    );
    const res = await getTaskDisputes(TASK);
    expect(res.settlement_state).toBe("unconfirmed");
  });

  it("keeps an absent state absent and a null one null", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, taskDisputes()));
    expect("settlement_state" in (await getTaskDisputes(TASK))).toBe(false);
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, taskDisputes({ settlement_state: null })),
    );
    expect((await getTaskDisputes(TASK)).settlement_state).toBeNull();
  });

  it.each([
    ["a negative payout", { paid_usdc: -0.01 }],
    ["a payout as a string", { paid_usdc: "0.01" }],
    ["a receipt id that is not a string", { receipt_id_hex: 7 }],
  ])("refuses a settlement carrying %s", async (_name, over) => {
    const body = taskDisputes({
      settlement: settlement({
        steps: [{ ...step(0), ...over } as SettlementStepView],
      }),
    });
    fetchMock.mockResolvedValueOnce(jsonResponse(200, body));
    await expect(getTaskDisputes(TASK)).rejects.toThrow(
      `malformed response from /tasks/${TASK}/disputes`,
    );
  });

  it("refuses a negative remainder", async () => {
    const body = taskDisputes({
      settlement: settlement({ returned_usdc: -1 }),
    });
    fetchMock.mockResolvedValueOnce(jsonResponse(200, body));
    await expect(getTaskDisputes(TASK)).rejects.toThrow(/malformed/);
  });

  it("refuses a state that is not a string", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { ...taskDisputes(), settlement_state: 2 }),
    );
    await expect(getTaskDisputes(TASK)).rejects.toThrow(/malformed/);
  });
});

describe("getTaskDisputes — the run's seal", () => {
  const PROOF = "e".repeat(64);

  it("passes a seal state it knows through, with the seal's transaction", async () => {
    const body = taskDisputes({ seal: "sealed", proof_tx: PROOF });
    fetchMock.mockResolvedValueOnce(jsonResponse(200, body));
    await expect(getTaskDisputes(TASK)).resolves.toEqual(body);
  });

  it("reads a seal state it cannot name as unconfirmed", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { ...taskDisputes(), seal: "anchored" }),
    );
    expect((await getTaskDisputes(TASK)).seal).toBe("unconfirmed");
  });

  it("keeps an absent seal absent and a null one null", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, taskDisputes()));
    const old = await getTaskDisputes(TASK);
    expect("seal" in old).toBe(false);
    expect("proof_tx" in old).toBe(false);
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, taskDisputes({ seal: null, proof_tx: null })),
    );
    const none = await getTaskDisputes(TASK);
    expect(none.seal).toBeNull();
    expect(none.proof_tx).toBeNull();
  });

  it.each([
    ["a seal that is not a string", { seal: 1 }],
    ["a seal transaction that is not a string", { proof_tx: 7 }],
  ])("refuses %s", async (_name, over) => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { ...taskDisputes(), ...over }),
    );
    await expect(getTaskDisputes(TASK)).rejects.toThrow(/malformed/);
  });
});

describe("the receipt's seal kind", () => {
  it("reads the seal kind, keeping absent absent and an unknown word out", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        200,
        taskDisputes({ seal: "sealed", seal_kind: "delivery_only" }),
      ),
    );
    expect((await getTaskDisputes(TASK)).seal_kind).toBe("delivery_only");
    fetchMock.mockResolvedValueOnce(jsonResponse(200, taskDisputes()));
    expect("seal_kind" in (await getTaskDisputes(TASK))).toBe(false);
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { ...taskDisputes(), seal_kind: "partial" }),
    );
    expect("seal_kind" in (await getTaskDisputes(TASK))).toBe(false);
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { ...taskDisputes(), seal_kind: 3 }),
    );
    await expect(getTaskDisputes(TASK)).rejects.toThrow(/malformed/);
  });

  it("carries the kind onto the receipt, settled or not", () => {
    expect(
      settled({
        res: taskDisputes({ seal: "sealed", seal_kind: "paid" }),
      }).sealKind,
    ).toBe("paid");
    const none = view({
      res: taskDisputes({
        settlement: null,
        seal: "sealed",
        seal_kind: "delivery_only",
      }),
    });
    expect(none).toMatchObject({
      kind: "not_settled",
      seal: "sealed",
      sealKind: "delivery_only",
    });
  });
});

describe("disputeView — the run's seal", () => {
  it("carries the seal state onto the receipt", () => {
    const v = settled({ res: taskDisputes({ seal: "pending" }) });
    expect(v.seal).toBe("pending");
  });

  it("links the seal's own transaction over the settlement record's", () => {
    const top = "f".repeat(64);
    const v = settled({
      res: taskDisputes({ seal: "sealed", proof_tx: top }),
    });
    expect(v.proofTx).toBe(top);
    const fallback = settled({ res: taskDisputes({ seal: "sealed" }) });
    expect(fallback.proofTx).toBe(settlement().proof_tx);
  });

  it("says nothing about a seal a backend did not report", () => {
    expect("seal" in settled()).toBe(false);
  });
});

describe("isPlatformAgent", () => {
  it("knows the seeded catalogue by the prefix the backend reserves for it", () => {
    expect(isPlatformAgent("agt_05x7")).toBe(true);
    expect(isPlatformAgent("orizon_ref_agent")).toBe(false);
    expect(isPlatformAgent("code_agt_1")).toBe(false);
  });
});

describe("disputeView — escrow v2 settlement", () => {
  const RECEIPT = "cd".repeat(16);
  /** A three-step v2 settlement: one operator paid, one seeded platform
   *  step nobody could pay, one step that did not deliver. */
  function v2(over: Partial<SettlementView> = {}): SettlementView {
    return settlement({
      steps: [
        step(0, {
          agent_id: "ext_writer",
          paid_usdc: 0.01,
          receipt_id_hex: RECEIPT,
        }),
        step(1, { agent_id: "agt_05x7", paid_usdc: 0, delivered: true }),
        step(2, {
          agent_id: "ext_critic",
          paid_usdc: 0,
          delivered: false,
          creditable_usdc: 0,
        }),
      ],
      ...over,
    });
  }
  const payouts = (v: SettledView) =>
    Object.fromEntries(
      v.steps.map(({ step: s, payout }) => [s.step_index, payout]),
    );

  // A backend with no state field is read as before: nothing new is said.
  it("says nothing new on a backend that reports no settlement state", () => {
    const v = settled();
    expect(v.settlementState).toBeUndefined();
    expect(v.remainder).toBeUndefined();
    expect(v.steps.every(({ payout }) => payout === undefined)).toBe(true);
  });

  it("pays each step only what the backend reported, in the settlement's transaction", () => {
    const v = settled({
      res: taskDisputes({ settlement_state: "settled", settlement: v2() }),
    });
    expect(payouts(v)).toEqual({
      0: { kind: "paid", usdc: 0.01, tx: "tx_charge", receiptIdHex: RECEIPT },
      1: { kind: "platform" },
      2: { kind: "not_paid" },
    });
    // The platform step and the undelivered one were not billed; neither is
    // disputable. The operator's step is.
    expect(kinds(v)).toEqual({
      0: "disputable",
      1: "not_charged",
      2: "not_charged",
    });
  });

  // The backend names why a delivered step was paid nothing; the receipt
  // says it that way, and never as paid.
  it.each([
    ["no_onchain_owner", "ext_seeded_like", { kind: "platform" }],
    ["free", "ext_free", { kind: "not_billed", reason: "free" }],
    [
      "owner_unreadable",
      "ext_x",
      { kind: "not_billed", reason: "owner_unreadable" },
    ],
    [
      "over_authorized_cap",
      "ext_y",
      { kind: "not_billed", reason: "over_cap" },
    ],
    ["a reason this build does not know", "ext_z", { kind: "not_paid" }],
  ])("reads an unpaid reason of %s", (reason, agentId, payout) => {
    const v = settled({
      res: taskDisputes({
        settlement_state: "settled",
        settlement: settlement({
          steps: [
            step(0, {
              agent_id: agentId,
              delivered: true,
              price_usdc: 0,
              paid_usdc: 0,
              unpaid_reason: reason,
            }),
          ],
        }),
      }),
    });
    expect(v.steps[0].payout).toEqual(payout);
    expect(v.steps[0].state.kind).toBe("not_charged");
  });

  it("refuses an unpaid reason that is not a string", async () => {
    const body = taskDisputes({
      settlement: settlement({
        steps: [
          { ...step(0), unpaid_reason: 3 } as unknown as SettlementStepView,
        ],
      }),
    });
    fetchMock.mockResolvedValueOnce(jsonResponse(200, body));
    await expect(getTaskDisputes(TASK)).rejects.toThrow(/malformed/);
  });

  // Never inferred from a price: a v1 record on a state-aware backend has no
  // per-step payout, and the receipt must not print its price as one.
  it("shows no payout for a settled step whose payout was not reported", () => {
    const v = settled({ res: taskDisputes({ settlement_state: "settled" }) });
    expect(v.steps.every(({ payout }) => payout === undefined)).toBe(true);
  });

  // v1 charged a total and held no custody: there is no "rest" to return.
  it("claims no remainder on a v1 settlement under a state-aware backend", () => {
    const v = settled({ res: taskDisputes({ settlement_state: "settled" }) });
    expect(v.remainder).toBeUndefined();
  });

  it("states the remainder only as the backend reported it", () => {
    const unreported = settled({
      res: taskDisputes({ settlement_state: "settled", settlement: v2() }),
    });
    expect(unreported.remainder).toEqual({ kind: "unreported" });

    const reported = settled({
      res: taskDisputes({
        settlement_state: "settled",
        settlement: v2({ returned_usdc: 0.017 }),
      }),
    });
    expect(reported.remainder).toEqual({ kind: "returned", usdc: 0.017 });
  });

  it("calls nothing paid while the settlement is unconfirmed", () => {
    const v = settled({
      res: taskDisputes({ settlement_state: "unconfirmed", settlement: v2() }),
    });
    expect(v.steps.every(({ payout }) => payout?.kind === "pending")).toBe(
      true,
    );
    expect(Object.values(kinds(v))).toEqual([
      "payout_unconfirmed",
      "payout_unconfirmed",
      "payout_unconfirmed",
    ]);
    expect(v.remainder).toEqual({ kind: "pending" });
  });

  it("says it stopped checking an unconfirmed settlement once the wait is over", () => {
    const res = taskDisputes({
      settlement_state: "unconfirmed",
      settlement: v2(),
    });
    expect(settled({ res }).settlementStoppedChecking).toBeUndefined();
    expect(settled({ res, waitOver: true }).settlementStoppedChecking).toBe(
      true,
    );
  });

  it("calls nothing paid and the funds held when the settlement failed", () => {
    const v = settled({
      res: taskDisputes({ settlement_state: "failed", settlement: v2() }),
    });
    expect(v.steps.every(({ payout }) => payout?.kind === "not_paid")).toBe(
      true,
    );
    expect(Object.values(kinds(v))).toEqual([
      "not_charged",
      "not_charged",
      "not_charged",
    ]);
    expect(v.remainder).toEqual({ kind: "held" });
  });

  it("carries the state onto a run with no settlement on record", () => {
    const failed = view({
      res: taskDisputes({ settlement: null, settlement_state: "failed" }),
    });
    expect(failed).toEqual({
      kind: "not_settled",
      running: false,
      settlementState: "failed",
    });
    const legacy = view({ res: taskDisputes({ settlement: null }) });
    expect(legacy).toEqual({ kind: "not_settled", running: false });
    expect("settlementState" in legacy).toBe(false);
  });
});

describe("getTaskDisputes — the settlement's exact amounts", () => {
  const amt = (stroops: number | string) => ({ stroops, display: "x" });

  it("passes the exact amounts, the totals and the asset through", async () => {
    const body = taskDisputes({
      settlement_state: "settled",
      settlement: settlement({
        steps: [
          step(0, {
            planned: amt(540_000),
            charged: amt("540000"),
            returned: amt(0),
          }),
        ],
        totals: {
          authorized: amt(540_000),
          planned: amt(540_000),
          charged: amt(540_000),
          returned: amt(0),
          surplus: amt(0),
        },
        asset: { code: "XLM", issuer: null, decimals: 7 },
      }),
    });
    fetchMock.mockResolvedValueOnce(jsonResponse(200, body));
    await expect(getTaskDisputes(TASK)).resolves.toEqual(body);
  });

  it.each([
    ["a fractional price", { planned: amt(1.5) }],
    ["a negative charge", { charged: amt(-1) }],
    ["a return as a decimal string", { returned: amt("0.5") }],
    ["an amount with no display", { planned: { stroops: 5 } }],
  ])("refuses a step carrying %s", async (_name, over) => {
    const body = taskDisputes({
      settlement: settlement({
        steps: [{ ...step(0), ...over } as SettlementStepView],
      }),
    });
    fetchMock.mockResolvedValueOnce(jsonResponse(200, body));
    await expect(getTaskDisputes(TASK)).rejects.toThrow(/malformed/);
  });

  const totals = {
    authorized: amt(1),
    planned: amt(1),
    charged: amt(1),
    returned: amt(0),
    surplus: amt(0),
  };
  it.each([
    ["authorized", { totals: { ...totals, authorized: amt(-5) } }],
    ["charged", { totals: { ...totals, charged: null } }],
    ["returned", { totals: { ...totals, returned: amt(0.1) } }],
    ["asset", { asset: "XLM" }],
  ])("refuses a malformed %s figure", async (_name, over) => {
    const body = taskDisputes({
      settlement: settlement(over as Partial<SettlementView>),
    });
    fetchMock.mockResolvedValueOnce(jsonResponse(200, body));
    await expect(getTaskDisputes(TASK)).rejects.toThrow(/malformed/);
  });
});

describe("disputeView — the receipt's reconciliation", () => {
  it("reconciles a v2 settlement step by step", () => {
    const v = settled({
      res: taskDisputes({
        settlement_state: "settled",
        settlement: settlement({
          steps: [
            step(0, { price_usdc: 0.01, paid_usdc: 0.01 }),
            step(1, { price_usdc: 0.02, paid_usdc: 0, delivered: false }),
          ],
          settled_usdc: 0.01,
          returned_usdc: 0.02,
        }),
      }),
    });
    expect(v.reconciliation?.planned).toBe(300_000n);
    expect(v.reconciliation?.charged).toBe(100_000n);
    expect(v.reconciliation?.returned).toBe(200_000n);
    expect(v.reconciliation?.balanced).toBe(true);
  });

  it("draws none for a settlement that reports no payouts", () => {
    expect(settled().reconciliation).toBeUndefined();
  });
});
