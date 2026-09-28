/**
 * What `POST /orchestrator/execute` refused a PAID run with, narrowed from
 * the error envelope into something the plan card can say to the buyer.
 *
 * Under escrow v2 every one of these lands after the buyer's authorization
 * CONFIRMED — the cap is already in escrow — so each answer has two halves:
 * why the run did not start, and what became of the money. The second comes
 * from `release_tx_hash`, which the backend adds to a refusal ONLY when it
 * tried to hand the custody back with a full-release settle (a plan it no
 * longer holds, an expired plan, no capacity): a hash when that release
 * confirmed, null when it did not. Absent means no release was tried — the
 * authorization checks (finding S2) refuse before one — so the funds stay in
 * escrow until the buyer reclaims them after expiry.
 */

/** Every refusal code the paid execute path answers with before a task is
 *  minted (backend `authorization_guard`, `routers/orchestrator.py`). */
export const EXECUTE_REFUSAL_CODES = [
  "authorization_unreadable",
  "authorization_unverifiable",
  "authorization_not_found",
  "authorization_payer_mismatch",
  "authorization_plan_mismatch",
  "authorization_spent",
  "authorization_used",
  "authorization_settled",
  "authorization_revoked",
  "authorization_insufficient",
  "authorization_expiring",
  "authorization_expired",
  "authorization_incomplete",
  "plan_expired",
  "not_found",
  "capacity_exhausted",
] as const;
export type ExecuteRefusalCode = (typeof EXECUTE_REFUSAL_CODES)[number];

const KNOWN: ReadonlySet<string> = new Set(EXECUTE_REFUSAL_CODES);

/** What became of the custody the refused run was authorized with. */
export type EscrowRelease =
  /** The platform returned all of it, in this confirmed transaction. */
  | { kind: "returned"; txHash: string }
  /** A release was tried and did not confirm: reclaim after expiry. */
  | { kind: "not_returned" }
  /** No release was tried: reclaim after expiry. */
  | { kind: "not_attempted" };

export type ExecuteRefusal = {
  /** A code this build knows, or null for one it does not. */
  code: ExecuteRefusalCode | null;
  /** The backend's own sentence, which says what to do. */
  message: string;
  release: EscrowRelease;
};

/** The release half of a refusal body, read defensively. */
function releaseOf(body: unknown): EscrowRelease {
  if (typeof body !== "object" || body === null)
    return { kind: "not_attempted" };
  if (!("release_tx_hash" in body)) return { kind: "not_attempted" };
  const hash = (body as { release_tx_hash?: unknown }).release_tx_hash;
  // Only a real transaction hash is a return: anything else is a release
  // that cannot be pointed at, which must not read as money back.
  return typeof hash === "string" && /^[0-9a-f]{64}$/i.test(hash)
    ? { kind: "returned", txHash: hash.toLowerCase() }
    : { kind: "not_returned" };
}

/**
 * The refusal an execute rejection carries, or null when it is not an answer
 * from the backend at all (a dropped connection, a timeout) — in which case
 * a run MAY have started, and the caller must not say it did not.
 */
export function executeRefusal(e: unknown): ExecuteRefusal | null {
  // Read by shape, as lib/api's `ApiError` carries it, rather than by
  // `instanceof`: a rejection with an HTTP status is an answer from the
  // backend, whichever copy of the class built it.
  if (typeof e !== "object" || e === null) return null;
  const fields = e as {
    status?: unknown;
    code?: unknown;
    body?: unknown;
    message?: unknown;
  };
  if (typeof fields.status !== "number") return null;
  const code =
    typeof fields.code === "string" && KNOWN.has(fields.code)
      ? (fields.code as ExecuteRefusalCode)
      : null;
  const body = fields.body;
  const envelope =
    typeof body === "object" && body !== null && "error" in body
      ? (body as { error?: { message?: unknown } }).error
      : undefined;
  const message =
    typeof envelope?.message === "string"
      ? envelope.message
      : typeof fields.message === "string"
        ? fields.message
        : "";
  return { code, message, release: releaseOf(body) };
}

/**
 * Why the run did not start, for the buyer, by code. Each ends on what to do,
 * and none says anything about the money: the release half says that.
 */
export function refusalSentence(refusal: ExecuteRefusal): string {
  switch (refusal.code) {
    case "authorization_unreadable":
    case "authorization_unverifiable":
      return "The platform could not read your authorization on-chain to check it, so the run was not started. Try again shortly.";
    case "authorization_not_found":
      return "The escrow has no record of this authorization, so the run was not started. Authorize this plan again.";
    case "authorization_payer_mismatch":
      return "This authorization was made by a different wallet, so it cannot pay for your run. Authorize this plan again from the wallet you are using.";
    case "authorization_plan_mismatch":
      return "This authorization was made for a different plan, so it cannot pay for this one. Authorize this plan again.";
    case "authorization_spent":
    case "authorization_used":
    case "authorization_settled":
      return "This authorization has already paid for a run, so it cannot pay for another. Authorize this plan again.";
    case "authorization_revoked":
      return "This authorization was reclaimed, so it can no longer pay for the run. Authorize this plan again.";
    case "authorization_insufficient":
      return "This authorization does not cover the plan's total, so the run was not started. Authorize this plan again.";
    case "authorization_expiring":
    case "authorization_expired":
      return "This authorization expires too soon to outlast the longest this plan could run, so the run was not started. Authorize this plan again.";
    case "authorization_incomplete":
      return "The run was sent without its authorization, so it was not started. Authorize this plan again.";
    case "plan_expired":
      return "This plan was too old to run, so no task was started. Build a fresh plan from the same request.";
    case "not_found":
      return "The platform no longer holds this plan, so it could not run. Build a fresh plan from the same request.";
    case "capacity_exhausted":
      return "The service is at capacity, so the run was not started. Try again shortly.";
    case null:
      return `The run was not started: ${refusal.message}`;
  }
}
