/**
 * Unit tests for the payer's dispute read grant (lib/dispute-read-grant.ts,
 * D-067): the challenge is checked to address this task before any wallet
 * sees it, one click is one signature, the grant is kept for this tab and
 * this wallet only, and every way asking for one can end is told apart — a
 * declined prompt from a failure, a missing route from both.
 *
 * `fetch` and `window.sessionStorage` are stubbed, as lib/disputes.test.ts
 * stubs them; the wallet is a plain function the tests count.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "./api";
import {
  DISPUTE_READ_GRANT_HEADER,
  GRANT_MARGIN_MS,
  MAX_READ_GRANTS,
  createReadChallenge,
  forgetReadGrant,
  heldReadGrant,
  obtainReadGrant,
  readGrantFailure,
  rememberReadGrant,
} from "./dispute-read-grant";

type FetchMockResponse = {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
  text: () => Promise<string>;
};

const fetchMock =
  vi.fn<(input: string, init?: RequestInit) => Promise<FetchMockResponse>>();
vi.stubGlobal("fetch", fetchMock);

const sessionStore = new Map<string, string>();
const storage = {
  getItem: (k: string) => sessionStore.get(k) ?? null,
  setItem: (k: string, v: string) => void sessionStore.set(k, v),
  removeItem: (k: string) => void sessionStore.delete(k),
};
vi.stubGlobal("window", { sessionStorage: storage });

afterEach(() => {
  fetchMock.mockReset();
  sessionStore.clear();
  vi.restoreAllMocks();
});

const TASK = "tsk_7fc5bc5ea95f15fc";
const PAYER = "GBPAYER".padEnd(56, "A");
const OTHER = "GBOTHER".padEnd(56, "B");
const NOW_MS = 1_790_000_000_000;

function jsonResponse(status: number, body: unknown): FetchMockResponse {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  };
}

function refusal(status: number, code: string): FetchMockResponse {
  return jsonResponse(status, {
    detail: code,
    error: { code, message: code.replace(/_/g, " "), request_id: "req_1" },
  });
}

const challenge = (over: Record<string, unknown> = {}) => ({
  nonce: "n0nce",
  message: `orizon-dispute-read:v1:${TASK}:n0nce`,
  expires_at: NOW_MS / 1_000 + 300,
  ...over,
});

const grant = { grant: "grant-token", expires_at: NOW_MS / 1_000 + 3_600 };

const paths = () => fetchMock.mock.calls.map(([url]) => url);

describe("createReadChallenge", () => {
  it("asks for this task's challenge", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, challenge()));
    await expect(createReadChallenge(TASK)).resolves.toEqual(challenge());
    const [, init] = fetchMock.mock.calls[0] ?? [];
    expect(JSON.parse(String(init?.body))).toEqual({ task_id: TASK });
    expect(paths()).toEqual(["/api/disputes/read-challenge"]);
  });

  it.each([
    ["another task", `orizon-dispute-read:v1:tsk_other:n0nce`],
    ["another nonce", `orizon-dispute-read:v1:${TASK}:other`],
    ["another domain", `orizon-dispute:v1:${TASK}:n0nce`],
    ["this task only as a substring", `orizon-dispute-read:v1:x${TASK}:n0nce`],
    // The nonce must BE the tail, not merely end it: a segment slipped in
    // before it makes the message something other than the one asked for.
    [
      "a tail that only ends with the nonce",
      `orizon-dispute-read:v1:${TASK}:extra:n0nce`,
    ],
  ])(
    "refuses a message for %s before any wallet sees it",
    async (_, message) => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse(200, challenge({ message })),
      );
      await expect(createReadChallenge(TASK)).rejects.toThrow(
        /does not address task/,
      );
    },
  );

  it("refuses an empty nonce, which any message would end with", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        200,
        challenge({ nonce: "", message: `orizon-dispute-read:v1:${TASK}:` }),
      ),
    );
    await expect(createReadChallenge(TASK)).rejects.toThrow(/malformed/);
  });
});

describe("the held grant", () => {
  it("is kept per task, for the wallet that signed, until just before it expires", () => {
    rememberReadGrant(TASK, PAYER, grant);
    expect(heldReadGrant(TASK, PAYER, NOW_MS)).toBe("grant-token");
    expect(heldReadGrant("tsk_other", PAYER, NOW_MS)).toBeNull();
    // Another wallet in the same tab never presents the payer's grant.
    expect(heldReadGrant(TASK, OTHER, NOW_MS)).toBeNull();
    expect(heldReadGrant(TASK, null, NOW_MS)).toBeNull();

    const spentAt = grant.expires_at * 1_000 - GRANT_MARGIN_MS;
    expect(heldReadGrant(TASK, PAYER, spentAt - 1)).toBe("grant-token");
    expect(heldReadGrant(TASK, PAYER, spentAt)).toBeNull();
    // An expired grant is dropped, not merely skipped.
    expect(heldReadGrant(TASK, PAYER, NOW_MS)).toBeNull();
  });

  it("is forgotten on request, and a new one replaces the old", () => {
    rememberReadGrant(TASK, PAYER, grant);
    rememberReadGrant(TASK, PAYER, { ...grant, grant: "newer" });
    expect(heldReadGrant(TASK, PAYER, NOW_MS)).toBe("newer");
    forgetReadGrant(TASK);
    expect(heldReadGrant(TASK, PAYER, NOW_MS)).toBeNull();
  });

  it("keeps at most the newest grants — exactly that many, the oldest first to go", () => {
    for (let i = 0; i <= MAX_READ_GRANTS; i += 1) {
      rememberReadGrant(`tsk_${i}`, PAYER, { ...grant, grant: `g${i}` });
    }
    expect(heldReadGrant("tsk_0", PAYER, NOW_MS)).toBeNull();
    // The next-oldest survives: the cap is MAX_READ_GRANTS, not one fewer.
    expect(heldReadGrant("tsk_1", PAYER, NOW_MS)).toBe("g1");
    expect(heldReadGrant(`tsk_${MAX_READ_GRANTS}`, PAYER, NOW_MS)).toBe(
      `g${MAX_READ_GRANTS}`,
    );
  });

  it("holds nothing, and throws nothing, when storage is unusable", () => {
    const blocked = () => {
      throw new Error("SecurityError: storage is disabled");
    };
    vi.spyOn(storage, "getItem").mockImplementation(blocked);
    vi.spyOn(storage, "setItem").mockImplementation(blocked);
    vi.spyOn(storage, "removeItem").mockImplementation(blocked);
    expect(() => rememberReadGrant(TASK, PAYER, grant)).not.toThrow();
    expect(heldReadGrant(TASK, PAYER, NOW_MS)).toBeNull();
    expect(() => forgetReadGrant(TASK)).not.toThrow();
  });

  it("reads a corrupt store as empty", () => {
    sessionStore.set("orizon.dispute-read-grants", "{not json");
    expect(heldReadGrant(TASK, PAYER, NOW_MS)).toBeNull();
  });

  it("names the header the backend reads it from", () => {
    expect(DISPUTE_READ_GRANT_HEADER).toBe("X-Dispute-Read-Grant");
  });
});

describe("obtainReadGrant", () => {
  it("signs the challenge verbatim, exactly once, and keeps the grant", async () => {
    vi.spyOn(Date, "now").mockReturnValue(NOW_MS);
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, challenge()))
      .mockResolvedValueOnce(jsonResponse(200, grant));
    const signMessage = vi.fn(() => Promise.resolve("c2lnbmF0dXJl"));

    await obtainReadGrant({ taskId: TASK, payer: PAYER, signMessage });

    expect(signMessage).toHaveBeenCalledTimes(1);
    expect(signMessage).toHaveBeenCalledWith(challenge().message);
    expect(paths()).toEqual([
      "/api/disputes/read-challenge",
      "/api/disputes/read-grant",
    ]);
    const [, init] = fetchMock.mock.calls[1] ?? [];
    expect(JSON.parse(String(init?.body))).toEqual({
      task_id: TASK,
      nonce: "n0nce",
      signature_b64: "c2lnbmF0dXJl",
    });
    expect(heldReadGrant(TASK, PAYER, NOW_MS)).toBe("grant-token");
  });

  it("asks the wallet nothing when the route is missing", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(404, { detail: "Not Found" }));
    const signMessage = vi.fn(() => Promise.resolve("sig"));
    const err = await obtainReadGrant({
      taskId: TASK,
      payer: PAYER,
      signMessage,
    }).catch((e: unknown) => e);
    expect(readGrantFailure(err)).toBe("unavailable");
    expect(signMessage).not.toHaveBeenCalled();
  });

  it("asks the wallet nothing when the task has no dispute to read", async () => {
    fetchMock.mockResolvedValueOnce(refusal(404, "no_disputes"));
    const signMessage = vi.fn(async () => "sig");

    const err = await obtainReadGrant({
      taskId: TASK,
      payer: PAYER,
      signMessage,
    }).catch((e: unknown) => e);
    expect(readGrantFailure(err)).toBe("unavailable");
    expect(signMessage).not.toHaveBeenCalled();
    expect(heldReadGrant(TASK, PAYER, NOW_MS)).toBeNull();
  });

  it("does not sign a second time when the challenge expired in the wallet", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, challenge()))
      .mockResolvedValueOnce(refusal(409, "challenge_expired"));
    const signMessage = vi.fn(() => Promise.resolve("sig"));
    const err = await obtainReadGrant({
      taskId: TASK,
      payer: PAYER,
      signMessage,
    }).catch((e: unknown) => e);
    expect(readGrantFailure(err)).toBe("expired");
    expect(signMessage).toHaveBeenCalledTimes(1);
    expect(heldReadGrant(TASK, PAYER, NOW_MS)).toBeNull();
  });

  it("keeps nothing when the wallet declines", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, challenge()));
    const signMessage = vi.fn(() =>
      Promise.reject(new Error("User declined access")),
    );
    const err = await obtainReadGrant({
      taskId: TASK,
      payer: PAYER,
      signMessage,
    }).catch((e: unknown) => e);
    expect(readGrantFailure(err)).toBe("declined");
    expect(paths()).toEqual(["/api/disputes/read-challenge"]);
    expect(heldReadGrant(TASK, PAYER, NOW_MS)).toBeNull();
  });
});

describe("readGrantFailure", () => {
  it.each<[string, unknown, string]>([
    ["a declined prompt", new Error("User declined access"), "declined"],
    [
      "a missing route",
      new ApiError("POST → 404", 404, undefined, undefined),
      "unavailable",
    ],
    [
      "no settlement",
      new ApiError("POST → 404", 404, undefined, "no_settlement"),
      "unavailable",
    ],
    [
      "a settled task with no dispute to read",
      new ApiError("POST → 404", 404, undefined, "no_disputes"),
      "unavailable",
    ],
    [
      "an unknown task",
      new ApiError("POST → 404", 404, undefined, "unknown_task"),
      "unavailable",
    ],
    [
      "another wallet",
      new ApiError("POST → 403", 403, undefined, "not_the_payer"),
      "not_the_payer",
    ],
    [
      "a bare 403 with no envelope code",
      new ApiError("POST → 403", 403),
      "not_the_payer",
    ],
    [
      "an expired challenge",
      new ApiError("POST → 409", 409, undefined, "challenge_expired"),
      "expired",
    ],
    [
      "a challenge the server forgot",
      new ApiError("POST → 409", 409, undefined, "challenge_unknown"),
      "expired",
    ],
    [
      "a full challenge store",
      new ApiError(
        "POST → 503",
        503,
        undefined,
        "challenge_capacity_dispute_read",
      ),
      "busy",
    ],
    [
      "a throttled challenge mint",
      new ApiError("POST → 429", 429, 20_000, "rate_limited"),
      "busy",
    ],
    [
      "a status nothing names",
      new ApiError("POST → 500", 500, undefined, "internal_error"),
      "failed",
    ],
    ["a network drop", new TypeError("Failed to fetch"), "failed"],
  ])("reads %s", (_, err, expected) => {
    expect(readGrantFailure(err)).toBe(expected);
  });
});
