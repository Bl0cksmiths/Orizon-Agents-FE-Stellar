/**
 * Plain buyer copy for the plan flow's known failures, in place of the raw
 * "POST /orchestrator/decompose → 503 — no_routable_agents" a buyer used to
 * read. The raw message is still what any failure NOT listed here shows: a
 * guess at plain copy for an error nobody anticipated would hide the one
 * detail support needs.
 *
 * Read by shape (`code`, `status`, `message`) rather than by `instanceof
 * ApiError`, so it holds for any rejection carrying those fields — including
 * a backend answering without the error envelope, whose token then only
 * survives at the end of the message.
 */

import { toMessage } from "@/lib/use-async-action";

/** The fields of an API rejection this file reads, when present. */
function fieldsOf(e: unknown): {
  code?: string;
  status?: number;
  message: string;
} {
  const message = toMessage(e);
  if (typeof e !== "object" || e === null) return { message };
  const code = "code" in e && typeof e.code === "string" ? e.code : undefined;
  const status =
    "status" in e && typeof e.status === "number" ? e.status : undefined;
  return { code, status, message };
}

/** Whether a rejection carries this backend code — in the envelope's `code`,
 *  or, from a backend predating the envelope, as the message's last token. */
function hasCode(e: unknown, code: string): boolean {
  const f = fieldsOf(e);
  return f.code === code || f.message.endsWith(`— ${code}`);
}

/** What a failed decompose says to the buyer. Nothing was charged in any of
 *  these — no plan exists yet to pay for — and each says so, because "did
 *  that cost me anything" is the first question a failure on a pay page
 *  raises. */
export function decomposeErrorCopy(e: unknown): string {
  // 503: nothing listed and dispatchable was left to offer the planner. The
  // request itself was fine; the condition clears when an operator binds or
  // relists an agent.
  if (hasCode(e, "no_routable_agents")) {
    return "No agent is available to take this request right now, so no plan was built. Nothing was charged. You can try again later.";
  }
  // 504: the planner ran out of time. Nothing else failed.
  if (hasCode(e, "decompose_timeout")) {
    return "The planner took too long to answer, so no plan was built. Nothing was charged. You can try again, and a shorter request may plan faster.";
  }
  // The guard refused the plan: a step arrived unusable, and a card that
  // quietly left a step out would misstate what the buyer pays for.
  if (/^malformed response from \/orchestrator\/decompose/.test(toMessage(e))) {
    return "The plan came back incomplete, so it cannot be shown or paid for. Nothing was charged. You can try again.";
  }
  return toMessage(e);
}

/**
 * Whether running the plan was refused because the backend no longer holds
 * it. Stored plans expire after 15 minutes, and `POST /orchestrator/execute`
 * then answers 410 `plan_expired`: no task is created and nothing is charged.
 * The status alone is enough — 410 is only ever "that plan is gone" here.
 */
export function isPlanExpired(e: unknown): boolean {
  return hasCode(e, "plan_expired") || fieldsOf(e).status === 410;
}
