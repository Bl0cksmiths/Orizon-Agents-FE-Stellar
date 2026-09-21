/**
 * Disputes (story 4.05): the buyer's side of a settled workflow, as pure code.
 *
 * Every product rule of the receipt panel lives here — who may act, on which
 * step, until when, and what a stranger holding a shared trace link may see —
 * so the components that draw it decide nothing. The panel renders
 * `disputeView`'s answer; the dialog runs `raiseDispute` and switches on
 * `disputeErrorCode`.
 *
 * The wallet signature is the only credential. There is no account and no
 * task token in a dispute: the backend checks the signer against the payer it
 * recorded at settlement, and so does this module before offering anything.
 */

import {
  ApiError,
  GET_TIMEOUT_MS,
  ensure,
  fetchWithTimeout,
  httpError,
  post,
  taskAuthHeaders,
} from "./api";
import type {
  CreditPolicy,
  Dispute,
  DisputeChallenge,
  DisputeChallengeReq,
  DisputeErrorCode,
  OpenDisputeReq,
  SettlementStepView,
  SettlementView,
  TaskDisputes,
} from "./types";

/**
 * The longest reason the dialog accepts, after trimming. The backend allows
 * more; this is the product's bound — a paragraph about what went wrong, not
 * an essay — counted in UTF-16 units exactly as a textarea's `maxLength` is,
 * so the counter under the field and this check can never disagree.
 */
export const MAX_DISPUTE_REASON_CHARS = 500;

/**
 * A dispute refused on the client, before anything reached the network,
 * carrying the code the server would have answered with.
 *
 * Not an `ApiError`: no request was made, so there is no status to report,
 * and a fabricated one would read as the server's verdict. It exists so the
 * dialog handles an early refusal through the same `disputeErrorCode` switch
 * as a late one — an empty reason lands under the field whether the dialog or
 * the backend caught it.
 */
export class DisputeRefusal extends Error {
  readonly code: DisputeErrorCode;

  constructor(code: DisputeErrorCode, message: string) {
    super(message);
    this.name = "DisputeRefusal";
    this.code = code;
  }
}

const DISPUTE_ERROR_CODES: ReadonlySet<string> = new Set([
  "reason_required",
  "unknown_job",
  "signature_malformed",
  "challenge_expired",
  "not_the_payer",
  "dispute_window_closed",
  "step_not_settled",
  "nothing_was_charged",
  "duplicate_dispute",
  "rate_limited",
] satisfies DisputeErrorCode[]);

const isDisputeErrorCode = (v: unknown): v is DisputeErrorCode =>
  typeof v === "string" && DISPUTE_ERROR_CODES.has(v);

/**
 * The dispute-contract code behind a rejection, or null when the failure is
 * not one the contract names: a network drop, a client-side timeout, a
 * malformed payload, a wallet that refused to sign, or a code invented by a
 * backend newer than this build.
 *
 * A 429 is `rate_limited` whatever its body says. The limiter can answer from
 * a proxy in front of the backend, without the envelope, and the right screen
 * — wait, then try again — does not depend on who said it.
 */
export function disputeErrorCode(err: unknown): DisputeErrorCode | null {
  if (err instanceof DisputeRefusal) return err.code;
  if (!(err instanceof ApiError)) return null;
  if (isDisputeErrorCode(err.code)) return err.code;
  return err.status === 429 ? "rate_limited" : null;
}

// ── response guards ─────────────────────────────────────────────
//
// Local rather than in lib/guards.ts because nothing else reads these shapes,
// and in the same spirit: a payload the panel would compute with or render
// wrongly fails here, into the hook's error state, instead of mid-render.

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const isNum = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v);

const isStr = (v: unknown): v is string => typeof v === "string";

/** A string or an explicit null. Absent is refused too: every shape here was
 * born with these keys (the backend serialises `None` as null), so a missing
 * one is a broken payload, and letting it through would hand the panel an
 * `undefined` its `=== null` checks do not expect. */
const isNullableStr = (v: unknown): v is string | null =>
  v === null || isStr(v);

/** A finite number or an explicit null, on `isNullableStr`'s terms. */
const isNullableNum = (v: unknown): v is number | null =>
  v === null || isNum(v);

/** A step index is sent back to the server in the challenge, so it must be
 * the integer the settlement record holds — never a float that rounds. */
const isStepIndex = (v: unknown): v is number =>
  isNum(v) && Number.isInteger(v) && v >= 0;

/** Checked as a set: the status picks the badge and the copy beside it, and
 * an unlisted one would render as though nothing had happened to it. */
const DISPUTE_STATUSES: ReadonlySet<string> = new Set([
  "open",
  "upheld",
  "crediting",
  "credited",
  "rejected",
] satisfies Dispute["status"][]);

/** The policy is shown to the buyer as the terms they dispute under, so a
 * value the copy cannot state truthfully is refused rather than drawn: the
 * literals are checked exactly, and the fraction must be one. */
function isCreditPolicy(v: unknown): v is CreditPolicy {
  return (
    isRecord(v) &&
    isNum(v.credited_fraction) &&
    v.credited_fraction >= 0 &&
    v.credited_fraction <= 1 &&
    v.funded_by === "platform" &&
    v.adjudicated_by === "platform"
  );
}

/** `delivered` strictly boolean: it decides whether a step can be disputed at
 * all, and the string "false" is truthy. */
function isSettlementStep(v: unknown): v is SettlementStepView {
  return (
    isRecord(v) &&
    isStepIndex(v.step_index) &&
    isStr(v.agent_id) &&
    isNullableStr(v.agent_name) &&
    isNum(v.price_usdc) &&
    typeof v.delivered === "boolean" &&
    isNum(v.creditable_usdc) &&
    isNullableStr(v.output_summary)
  );
}

function isSettlement(v: unknown): v is SettlementView {
  return (
    isRecord(v) &&
    isStr(v.job_id_hex) &&
    isStr(v.payer) &&
    isNum(v.settled_at) &&
    isNum(v.window_closes_at) &&
    isNum(v.settled_usdc) &&
    isNullableStr(v.charge_tx) &&
    isNullableStr(v.proof_tx) &&
    Array.isArray(v.steps) &&
    v.steps.every(isSettlementStep) &&
    isCreditPolicy(v.policy)
  );
}

function isDispute(v: unknown): v is Dispute {
  return (
    isRecord(v) &&
    isStr(v.id) &&
    isStr(v.job_id_hex) &&
    isStr(v.task_id) &&
    isStepIndex(v.step_index) &&
    isStr(v.agent_id) &&
    isStr(v.payer) &&
    isStr(v.reason) &&
    isStr(v.status) &&
    DISPUTE_STATUSES.has(v.status) &&
    isNum(v.charged_usdc) &&
    isNum(v.creditable_usdc) &&
    isNum(v.opened_at) &&
    isNullableNum(v.resolved_at) &&
    isNullableStr(v.refund_tx) &&
    isNullableStr(v.rating_tx)
  );
}

/**
 * `settlement` is checked only when the key is present. Absent is a backend
 * that predates the field — the panel hides — while `null` is that backend's
 * real answer that nothing has settled yet. Both are valid; a malformed
 * settlement is not, and neither is a `now` that is not a number, since the
 * window is judged on it.
 */
function isTaskDisputes(v: unknown): v is TaskDisputes {
  return (
    isRecord(v) &&
    isStr(v.task_id) &&
    isNullableNum(v.window_closes_at) &&
    (v.now === undefined || isNum(v.now)) &&
    (v.settlement === undefined ||
      v.settlement === null ||
      isSettlement(v.settlement)) &&
    Array.isArray(v.disputes) &&
    v.disputes.every(isDispute)
  );
}

/** A non-empty nonce: the message is checked to END with it, and an empty one
 * would make that check pass for any message at all. */
function isDisputeChallenge(v: unknown): v is DisputeChallenge {
  return (
    isRecord(v) &&
    isStr(v.message) &&
    isStr(v.nonce) &&
    v.nonce.length > 0 &&
    isNum(v.expires_at)
  );
}

// ── wire calls ──────────────────────────────────────────────────

/**
 * GET /api/tasks/{task_id}/disputes — the workflow's settlement and every
 * dispute raised against it, in one read.
 *
 * Deliberately NOT through lib/api's deduped `get`. Two things depend on this
 * answer being fresh: the server clock the window is judged on is measured
 * when it arrives, and the refresh after a submit must see the dispute it just
 * opened. A response replayed from the dedupe window would get both wrong —
 * and the refetch fired when a live run finishes, often within a second of
 * the first read, would be handed the pre-settlement answer and report that
 * nothing was charged.
 *
 * Sends the task read token like every other per-task read; the route is
 * gated by it once the backend's enforcement flag flips.
 */
export async function getTaskDisputes(taskId: string): Promise<TaskDisputes> {
  const path = `/tasks/${encodeURIComponent(taskId)}/disputes`;
  const headers = taskAuthHeaders(taskId);
  const res = await fetchWithTimeout(
    "GET",
    path,
    { cache: "no-store", ...(headers ? { headers } : {}) },
    GET_TIMEOUT_MS,
  );
  if (!res.ok) throw await httpError("GET", path, res);
  const json: unknown = await res.json();
  return ensure(path, isTaskDisputes)(json);
}

/**
 * POST /api/disputes/challenge — a single-use nonce, and the exact message
 * the payer's wallet must sign to dispute this one step.
 *
 * The message is signed verbatim and never rebuilt here (see
 * `DisputeChallenge.message`), but it IS checked to address what was asked
 * for, `createBindChallenge`'s reasoning: a wallet prompt shows the buyer an
 * opaque string, so a proxy answering with a challenge for another step —
 * dearer, or another agent's — would have them sign a dispute they never
 * meant. Checked are the domain, the `:{job}:{step}:` it names and the nonce
 * it ends with; the version segment is left free, because the backend
 * returns the message precisely so its format can move without this build.
 */
export function createDisputeChallenge(
  req: DisputeChallengeReq,
): Promise<DisputeChallenge> {
  const path = "/disputes/challenge";
  return post<DisputeChallenge, DisputeChallengeReq>(
    path,
    req,
    ensure(path, isDisputeChallenge),
  ).then((challenge) => {
    const { message, nonce } = challenge;
    const addressesStep =
      message.startsWith("orizon-dispute:") &&
      message.includes(`:${req.job_id_hex}:${req.step_index}:`) &&
      message.endsWith(`:${nonce}`);
    if (!addressesStep) {
      throw new Error(
        `malformed response from ${path} — challenge does not address step ${req.step_index} of job ${req.job_id_hex}`,
      );
    }
    return challenge;
  });
}

/**
 * POST /api/disputes — open the dispute, presenting the payer's signature
 * over the challenge. Resolves to the stored dispute, status `open`.
 *
 * A `duplicate_dispute` 409 rejects like any other refusal. Its body carries
 * the original dispute, but `ApiError` keeps no body, so the caller refetches
 * the task's disputes instead — which is also the only read that shows the
 * step as the panel will draw it from then on.
 */
export function openDispute(req: OpenDisputeReq): Promise<Dispute> {
  const path = "/disputes";
  return post<Dispute, OpenDisputeReq>(path, req, ensure(path, isDispute));
}

// ── the window's clock ──────────────────────────────────────────

/**
 * How far the server's clock runs ahead of this browser's, in ms, measured
 * from a response's `now` at the moment it arrived: add it to `Date.now()` to
 * read the server's clock.
 *
 * The window closes on the server's clock — that is where the refusal comes
 * from — and a laptop whose clock is a few minutes off would otherwise offer a
 * dispute the server has already stopped taking, or hide one it still would.
 * The half round-trip the answer spent in flight is not corrected for: it is
 * well under the panel's one-second tick.
 *
 * 0 — trust the local clock — when the backend predates `now`.
 */
export function serverClockOffsetMs(
  res: TaskDisputes,
  receivedAtMs: number,
): number {
  if (!isNum(res.now) || !isNum(receivedAtMs)) return 0;
  return Math.round(res.now * 1_000 - receivedAtMs);
}
