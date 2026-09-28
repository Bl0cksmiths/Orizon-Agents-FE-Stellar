import { describe, expect, it } from "vitest";

import { ApiError } from "./api";
import {
  EXECUTE_REFUSAL_CODES,
  executeRefusal,
  refusalSentence,
} from "./execute-refusal";

const refusal = (
  status: number,
  code: string,
  extra: Record<string, unknown> = {},
) =>
  new ApiError(
    `POST /orchestrator/execute → ${status} — ${code}`,
    status,
    undefined,
    code,
    {
      detail: code,
      error: { code, message: `the backend's words for ${code}` },
      ...extra,
    },
  );

describe("executeRefusal", () => {
  // No answer is not a refusal: a run may have started behind a timeout.
  it("is null for a failure that is not an answer from the backend", () => {
    expect(executeRefusal(new Error("Failed to fetch"))).toBeNull();
    expect(executeRefusal("boom")).toBeNull();
    expect(executeRefusal(null)).toBeNull();
  });

  it("narrows every code the paid execute path refuses with", () => {
    for (const code of EXECUTE_REFUSAL_CODES) {
      expect(executeRefusal(refusal(409, code))?.code).toBe(code);
    }
  });

  it("keeps a code it does not know as null, with the backend's sentence", () => {
    const r = executeRefusal(refusal(409, "authorization_haunted"));
    expect(r?.code).toBeNull();
    expect(r?.message).toBe("the backend's words for authorization_haunted");
    expect(refusalSentence(r!)).toBe(
      "The run was not started: the backend's words for authorization_haunted",
    );
  });

  it("reads what became of the custody from release_tx_hash", () => {
    const hash = "A".repeat(64);
    expect(
      executeRefusal(refusal(410, "plan_expired", { release_tx_hash: hash }))
        ?.release,
    ).toEqual({ kind: "returned", txHash: hash.toLowerCase() });
    expect(
      executeRefusal(refusal(410, "plan_expired", { release_tx_hash: null }))
        ?.release,
    ).toEqual({ kind: "not_returned" });
    expect(
      executeRefusal(refusal(409, "authorization_spent"))?.release,
    ).toEqual({
      kind: "not_attempted",
    });
  });

  // Money back is only said with a transaction that can be pointed at.
  it("never reads a malformed hash as money returned", () => {
    for (const bad of ["", "abc", 42, "g".repeat(64)]) {
      expect(
        executeRefusal(
          refusal(503, "capacity_exhausted", { release_tx_hash: bad }),
        )?.release,
      ).toEqual({ kind: "not_returned" });
    }
  });
});

describe("refusalSentence", () => {
  it("has plain copy for every code, never the raw token", () => {
    for (const code of EXECUTE_REFUSAL_CODES) {
      const sentence = refusalSentence(executeRefusal(refusal(409, code))!);
      expect(sentence, code).not.toContain(code);
      expect(sentence, code).toMatch(/\.$/);
    }
  });

  it.each([
    ["authorization_plan_mismatch", "Authorize this plan again."],
    ["authorization_insufficient", "Authorize this plan again."],
    ["authorization_expiring", "Authorize this plan again."],
    ["authorization_spent", "Authorize this plan again."],
    ["authorization_unreadable", "Try again shortly."],
    ["capacity_exhausted", "Try again shortly."],
    ["not_found", "Build a fresh plan from the same request."],
  ])("tells the buyer what to do after %s", (code, advice) => {
    expect(refusalSentence(executeRefusal(refusal(409, code))!)).toContain(
      advice,
    );
  });
});
