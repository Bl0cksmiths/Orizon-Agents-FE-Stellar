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
  createDisputeChallenge,
  getTaskDisputes,
  openDispute,
} from "./disputes";
import { rememberTaskToken } from "./task-tokens";
import type {
  CreditPolicy,
  Dispute,
  DisputeChallenge,
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
