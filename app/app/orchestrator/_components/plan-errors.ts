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

/**
 * The request check's answers to a decompose (orchestrator v2), each shown as
 * its own notice rather than as an error string:
 *
 * - `blocked` (422 `intent_blocked`): the request was judged unsafe, or an
 *   attempt to steer the agents off their instructions. `reason` is the
 *   backend's plain-words why, when it sends one.
 * - `needs_detail` (422 `intent_needs_detail`): too vague, a test ping, or not
 *   a request agents could act on. `question` is what to add.
 * - `unavailable` (503 `intent_unavailable`): the check itself could not run,
 *   and the backend fails closed. Retryable after `Retry-After`.
 * - `paused` (503 `planning_paused`): the day's AI planning budget is spent.
 *   Curated examples still plan; AI planning resumes after `Retry-After`.
 *
 * Null for any other failure, which keeps `decomposeErrorCopy`'s wording.
 */
export type DecomposeRefusal =
  | { kind: "blocked"; reason: string | null }
  | { kind: "needs_detail"; question: string | null }
  | { kind: "unavailable"; retryAfterMs: number | null }
  | { kind: "paused"; retryAfterMs: number | null };

/** The longest reason or question a notice prints. Ours, from our backend,
 *  but a notice is not the place for an essay. */
const MAX_DETAIL = 400;

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * A refusal's own sentence (`reason`, `question`), wherever the backend puts
 * it: on the envelope's `error`, at the top of the body, or inside an object
 * `detail`. Failing those, the envelope's message — unless that is only the
 * code read back with spaces, which would be the machine string in disguise.
 */
function detailOf(e: unknown, field: string, code: string): string | null {
  const body = isObj(e) && "body" in e ? e.body : undefined;
  if (!isObj(body)) return null;
  const error = isObj(body.error) ? body.error : {};
  const detail = isObj(body.detail) ? body.detail : {};
  const candidates = [error[field], body[field], detail[field]];
  let text = candidates.find(
    (c): c is string => typeof c === "string" && c.trim() !== "",
  );
  if (text === undefined && typeof error.message === "string") {
    const m = error.message.trim();
    if (m && m !== code && m !== code.replace(/_/g, " ")) text = m;
  }
  if (text === undefined) return null;
  const t = text.trim();
  return t.length > MAX_DETAIL ? `${t.slice(0, MAX_DETAIL - 1)}…` : t;
}

export function decomposeRefusal(e: unknown): DecomposeRefusal | null {
  if (hasCode(e, "intent_blocked")) {
    return { kind: "blocked", reason: detailOf(e, "reason", "intent_blocked") };
  }
  if (hasCode(e, "intent_needs_detail")) {
    return {
      kind: "needs_detail",
      question: detailOf(e, "question", "intent_needs_detail"),
    };
  }
  const wait = retryAfterOf(e);
  if (hasCode(e, "intent_unavailable")) {
    return { kind: "unavailable", retryAfterMs: wait };
  }
  if (hasCode(e, "planning_paused")) {
    return { kind: "paused", retryAfterMs: wait };
  }
  return null;
}

/** The `Retry-After` an `ApiError` carries, in ms; null when it has none. */
function retryAfterOf(e: unknown): number | null {
  if (!isObj(e) || !("retryAfterMs" in e)) return null;
  const ms = e.retryAfterMs;
  return typeof ms === "number" && Number.isFinite(ms) && ms >= 0 ? ms : null;
}
