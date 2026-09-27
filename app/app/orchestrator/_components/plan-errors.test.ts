/**
 * Unit tests for the plan flow's buyer copy. Built from the real `ApiError`,
 * with the message `lib/api.ts` composes from the backend's error envelope,
 * so a change to either end shows up here.
 */

import { describe, expect, it } from "vitest";

import { ApiError } from "@/lib/api";
import { decomposeErrorCopy } from "./plan-errors";

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
