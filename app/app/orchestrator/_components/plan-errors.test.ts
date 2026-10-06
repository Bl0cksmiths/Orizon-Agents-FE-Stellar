/**
 * Unit tests for the plan flow's buyer copy. Built from the real `ApiError`,
 * with the message `lib/api.ts` composes from the backend's error envelope,
 * so a change to either end shows up here.
 */

import { describe, expect, it } from "vitest";

import { ApiError } from "@/lib/api";
import {
  decomposeErrorCopy,
  decomposeRefusal,
  isPlanExpired,
} from "./plan-errors";

const PATH = "POST /orchestrator/decompose";

/** What the envelope handler makes of `HTTPException(status, code)`: the code
 *  as `error.code`, and the code with spaces as the message. */
const enveloped = (status: number, code: string) =>
  new ApiError(
    `${PATH} → ${status} — ${code.replace(/_/g, " ")}`,
    status,
    undefined,
    code,
  );

/** A backend predating the envelope: `detail` only, so no code field. */
const legacy = (status: number, code: string) =>
  new ApiError(`${PATH} → ${status} — ${code}`, status);

/** Nothing a buyer reads may be the machine string. */
const RAW = /POST|\/orchestrator|→|\b50\d\b|_/;

describe("decomposeErrorCopy", () => {
  it.each([
    ["enveloped", enveloped(503, "no_routable_agents")],
    ["legacy", legacy(503, "no_routable_agents")],
  ])("says plainly that no agent could take the request (%s)", (_n, e) => {
    const copy = decomposeErrorCopy(e);
    expect(copy).toContain("No agent is available to take this request");
    expect(copy).toContain("Nothing was charged");
    expect(copy).not.toMatch(RAW);
  });

  it.each([
    ["enveloped", enveloped(504, "decompose_timeout")],
    ["legacy", legacy(504, "decompose_timeout")],
  ])("says plainly that the planner ran out of time (%s)", (_n, e) => {
    const copy = decomposeErrorCopy(e);
    expect(copy).toContain("The planner took too long to answer");
    expect(copy).toContain("Nothing was charged");
    expect(copy).not.toMatch(RAW);
  });

  // A bad step rejects the whole plan in the guard; the buyer is told the plan
  // came back incomplete rather than handed the guard's message.
  it("says plainly that the plan came back incomplete", () => {
    const copy = decomposeErrorCopy(
      new Error("malformed response from /orchestrator/decompose"),
    );
    expect(copy).toContain("The plan came back incomplete");
    expect(copy).not.toMatch(RAW);
  });

  // Plain copy for a failure nobody anticipated would hide the one detail
  // support needs, so anything unlisted is passed through untouched.
  it.each([
    enveloped(502, "decompose_failed"),
    new Error("network down"),
    "a thrown string",
  ])("passes an unlisted failure through as it was (%#)", (e) => {
    const raw = e instanceof Error ? e.message : String(e);
    expect(decomposeErrorCopy(e)).toBe(raw);
  });

  // The token has to BE the code, not merely appear in some other message.
  it("does not match a code that only appears mid-message", () => {
    const e = new ApiError(
      `${PATH} → 502 — upstream said no_routable_agents was stale`,
      502,
    );
    expect(decomposeErrorCopy(e)).toBe(e.message);
  });
});

describe("isPlanExpired", () => {
  const EXEC = "POST /orchestrator/execute";
  it.each([
    [
      "the envelope's code",
      new ApiError(
        `${EXEC} → 410 — this plan is too old`,
        410,
        undefined,
        "plan_expired",
      ),
      true,
    ],
    ["a bare 410", new ApiError(`${EXEC} → 410 — gone`, 410), true],
    ["a legacy token", new ApiError(`${EXEC} → 410 — plan_expired`, 410), true],
    [
      "a 503",
      new ApiError(
        `${EXEC} → 503 — capacity exhausted`,
        503,
        undefined,
        "capacity_exhausted",
      ),
      false,
    ],
    ["a network error", new Error("network down"), false],
  ] as const)("%s → %s", (_name, e, expected) => {
    expect(isPlanExpired(e)).toBe(expected);
  });
});

describe("decomposeRefusal — the request check's answers", () => {
  /** The envelope with a refusal's own field, as the backend sends it. */
  const refused = (
    status: number,
    code: string,
    extra: Record<string, unknown> = {},
    message = code.replace(/_/g, " "),
    retryAfterMs?: number,
  ) =>
    new ApiError(
      `${PATH} → ${status} — ${message}`,
      status,
      retryAfterMs,
      code,
      {
        detail: code,
        error: { code, message, request_id: "r1", ...extra },
      },
    );

  it("reads a blocked request with its reason", () => {
    expect(
      decomposeRefusal(
        refused(422, "intent_blocked", {
          reason: "It asks for help breaking into someone's account.",
        }),
      ),
    ).toEqual({
      kind: "blocked",
      reason: "It asks for help breaking into someone's account.",
    });
  });

  it("reads the reason from the top of the body, or from an object detail", () => {
    const top = new ApiError(
      `${PATH} → 422 — intent blocked`,
      422,
      undefined,
      "intent_blocked",
      {
        error: { code: "intent_blocked", message: "intent blocked" },
        reason: "Unsafe.",
      },
    );
    expect(decomposeRefusal(top)).toEqual({
      kind: "blocked",
      reason: "Unsafe.",
    });
    const detail = new ApiError(
      `${PATH} → 422`,
      422,
      undefined,
      "intent_blocked",
      {
        detail: { code: "intent_blocked", reason: "Unsafe too." },
      },
    );
    expect(decomposeRefusal(detail)).toEqual({
      kind: "blocked",
      reason: "Unsafe too.",
    });
  });

  it("takes the envelope's own sentence as the reason when no field carries one", () => {
    expect(
      decomposeRefusal(
        refused(
          422,
          "intent_blocked",
          {},
          "This asks the agents to ignore their instructions.",
        ),
      ),
    ).toEqual({
      kind: "blocked",
      reason: "This asks the agents to ignore their instructions.",
    });
  });

  it("has no reason rather than the code read back as one", () => {
    expect(decomposeRefusal(refused(422, "intent_blocked"))).toEqual({
      kind: "blocked",
      reason: null,
    });
  });

  it("reads a request that needs more detail with its question", () => {
    expect(
      decomposeRefusal(
        refused(422, "intent_needs_detail", {
          question: "What should the app do?",
        }),
      ),
    ).toEqual({ kind: "needs_detail", question: "What should the app do?" });
    expect(decomposeRefusal(refused(422, "intent_needs_detail"))).toEqual({
      kind: "needs_detail",
      question: null,
    });
  });

  it("reads an unavailable check and a paused planner with their waits", () => {
    expect(
      decomposeRefusal(
        refused(503, "intent_unavailable", {}, undefined, 30_000),
      ),
    ).toEqual({ kind: "unavailable", retryAfterMs: 30_000 });
    expect(
      decomposeRefusal(
        refused(503, "planning_paused", {}, undefined, 3_600_000),
      ),
    ).toEqual({ kind: "paused", retryAfterMs: 3_600_000 });
    expect(decomposeRefusal(refused(503, "planning_paused"))).toEqual({
      kind: "paused",
      retryAfterMs: null,
    });
  });

  it("reads a backend predating the envelope by the message's last token", () => {
    expect(decomposeRefusal(legacy(422, "intent_blocked"))).toEqual({
      kind: "blocked",
      reason: null,
    });
    expect(decomposeRefusal(legacy(503, "planning_paused"))).toEqual({
      kind: "paused",
      retryAfterMs: null,
    });
  });

  it("caps a reason at a readable length and trims it", () => {
    const long = "x".repeat(2_000);
    const r = decomposeRefusal(
      refused(422, "intent_blocked", { reason: `  ${long}  ` }),
    );
    expect(r?.kind).toBe("blocked");
    expect(r && "reason" in r && r.reason!.length).toBeLessThanOrEqual(400);
    expect(r && "reason" in r && r.reason!.endsWith("…")).toBe(true);
  });

  it("ignores a reason that is not a string", () => {
    expect(
      decomposeRefusal(
        refused(422, "intent_blocked", { reason: { text: "x" } }),
      ),
    ).toEqual({ kind: "blocked", reason: null });
  });

  it("is null for every other failure", () => {
    for (const e of [
      enveloped(503, "no_routable_agents"),
      enveloped(504, "decompose_timeout"),
      enveloped(422, "validation_error"),
      new Error("network down"),
      "boom",
      null,
    ]) {
      expect(decomposeRefusal(e)).toBeNull();
    }
  });
});
