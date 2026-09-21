/**
 * Disputes (story 4.05): the buyer's side of a settled workflow, as pure code.
 *
 * Every product rule of the receipt panel lives here — who may act, on which
 * step, until when, and what a stranger holding a shared trace link may see —
 * so the components that draw it decide nothing. The panel renders
 * `disputeView`'s answer; the dialog runs `raiseDispute` and switches on
 * `disputeErrorCode`.
 *
 * The wallet signature is the only credential for raising one. No account and
 * no task token authorizes it (the token only scopes the READ): the backend
 * checks the signer against the payer it recorded at settlement, and so does
 * this module before offering anything.
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
import { STROOPS_PER_UNIT, formatSettled } from "./money";
import type {
  CreditPolicy,
  Dispute,
  DisputeArtifact,
  DisputeChallenge,
  DisputeChallengeReq,
  DisputeErrorCode,
  DisputePanelView,
  DisputeReceiptView,
  DisputeViewer,
  OpenDisputeReq,
  SettlementStepView,
  SettlementView,
  StepDisputeState,
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

// ── the panel, derived ──────────────────────────────────────────

const HIDDEN: DisputePanelView = { kind: "hidden" };

/**
 * Who is looking, judged against the payer the settlement recorded.
 *
 * The comparison is EXACT, not case-folded. A Stellar G-address has one
 * spelling — StrKey is upper-case base32, and a lower-cased one is not a valid
 * key at all — so there is nothing to normalise; and the backend compares the
 * claimed payer with `!=` before it verifies a thing. Folding case here could
 * only ever offer an action to an address the server is going to refuse.
 */
function viewerOf(payer: string, address: string | null): DisputeViewer {
  if (!address) return "anonymous";
  return address === payer ? "payer" : "other";
}

/**
 * Whether `a` was raised before `b`: earlier `opened_at` first, then the lower
 * id, so the answer never depends on the order the list arrived in.
 */
const openedBefore = (a: Dispute, b: Dispute): boolean =>
  a.opened_at < b.opened_at || (a.opened_at === b.opened_at && a.id < b.id);

/**
 * Each step's dispute. A step has at most one — the backend answers a second
 * attempt with the first, unchanged — so should the data ever hold two, the
 * EARLIEST is the one kept: it is the dispute the server itself treats as the
 * step's, and the one a `duplicate_dispute` refusal hands back.
 */
function disputesByStep(disputes: Dispute[]): Map<number, Dispute> {
  const byStep = new Map<number, Dispute>();
  for (const d of disputes) {
    const held = byStep.get(d.step_index);
    if (held === undefined || openedBefore(d, held))
      byStep.set(d.step_index, d);
  }
  return byStep;
}

/**
 * The refund transfer, stated only as far as the record can vouch for it.
 *
 * - `credited` with its `refund_tx` is the one confirmed case: the backend
 *   writes `credited` only once the transfer has landed, alongside the hash
 *   that proves it.
 * - `credited` WITHOUT a `refund_tx` is pending, with no hash — never
 *   confirmed. The backend's own operator tooling treats that record as
 *   unreconciled and refuses to write anything against it until the payer's
 *   account has been checked on-chain, so the status alone cannot say that
 *   money moved, and "refunded" beside nothing to link is exactly the
 *   premature success the receipt exists to avoid.
 * - `crediting` is a transfer in flight: pending, carrying its hash when one
 *   was recorded, so the buyer can watch it land.
 * - `upheld` is decided but not yet sent: pending, and never a hash. One left
 *   on an upheld record belongs to an attempt that was released because it
 *   moved nothing.
 * - `open` and `rejected` have no transfer to speak of.
 *
 * An empty hash is no hash: there would be nothing to link.
 */
function refundArtifact(d: Dispute): DisputeArtifact {
  const txHash = d.refund_tx || null;
  switch (d.status) {
    case "credited":
      return txHash
        ? { txHash, state: "confirmed" }
        : { txHash: null, state: "pending" };
    case "crediting":
      return { txHash, state: "pending" };
    case "upheld":
      return { txHash: null, state: "pending" };
    case "open":
    case "rejected":
      return { txHash: null, state: "none" };
  }
}

/**
 * The dispute rating, on the same terms. A `rating_tx` is recorded when the
 * rating lands and ALSO when its submission times out, so the hash alone
 * proves nothing: only `rating_confirmed === true` — the ledger having vouched
 * for it — reads as done. `false` is in flight, and absent or null is a
 * backend that cannot say, which is not the same as yes.
 */
function ratingArtifact(d: Dispute): DisputeArtifact {
  if (!d.rating_tx) return { txHash: null, state: "none" };
  return {
    txHash: d.rating_tx,
    state: d.rating_confirmed === true ? "confirmed" : "pending",
  };
}

/**
 * Everything the receipt says about one dispute, for this viewer, under this
 * policy: status, when it was raised and last changed, the amount and who
 * funds it, the refund and the rating each with how far the record vouches
 * for it, and — for the payer alone — the words on both sides.
 *
 * - The amount is FINAL only when the refund is confirmed and the backend
 *   recorded what it transferred (`credited_usdc`). Anything short of that —
 *   an upheld or in-flight credit, a `credited` record with no transfer to
 *   link, a backend from before `credited_usdc` — prints the promise frozen
 *   at opening, marked as such, so the copy never calls a promise a payment.
 * - The last change falls back from `updated_at` to `resolved_at` to
 *   `opened_at`: an older backend stamps no transitions, and the closest time
 *   it did record is still true.
 * - The buyer's reason and the adjudicator's rejection are both written for
 *   the buyer. Anyone else — including a connected wallet that did not pay —
 *   gets null for each, whatever the record holds, and a rejection reason
 *   exists only on a rejected dispute. A reason of only whitespace is none.
 */
export function disputeReceipt(
  dispute: Dispute,
  viewer: DisputeViewer,
  policy: CreditPolicy,
): DisputeReceiptView {
  const refund = refundArtifact(dispute);
  const credited = dispute.credited_usdc;
  const isPayer = viewer === "payer";
  const rejection = dispute.rejection_reason;
  return {
    status: dispute.status,
    openedAtMs: dispute.opened_at * 1_000,
    lastChangedAtMs:
      (dispute.updated_at ?? dispute.resolved_at ?? dispute.opened_at) * 1_000,
    amount:
      refund.state === "confirmed" && isNum(credited)
        ? { usdc: credited, final: true }
        : { usdc: dispute.creditable_usdc, final: false },
    fundedBy: policy.funded_by,
    refund,
    rating: ratingArtifact(dispute),
    reason: isPayer ? dispute.reason : null,
    rejectionReason:
      isPayer && dispute.status === "rejected" && rejection?.trim()
        ? rejection
        : null,
  };
}

/**
 * One step's state for this viewer. The order is the product's: a step that
 * cost nothing says so whatever else is true, a dispute outlives the window
 * it was raised in, and only then do the window and the viewer decide.
 *
 * "Not charged" covers more than an undelivered step: a free step, or a
 * workflow whose charge moved nothing, has no money a credit could return, and
 * the backend refuses those as `nothing_was_charged`. Offering the button
 * would only walk the buyer through a signature to be told so.
 *
 * A disputed step is visible to everyone — a shared trace may show THAT a step
 * was disputed — but the buyer's own words are for the buyer. For anyone else
 * the reason is blanked out of the view as well as flagged: the panel cannot
 * leak what it was never handed.
 */
function stepState(
  step: SettlementStepView,
  dispute: Dispute | undefined,
  settlement: SettlementView,
  open: boolean,
  viewer: DisputeViewer,
): StepDisputeState {
  const charged =
    step.delivered && step.price_usdc > 0 && settlement.settled_usdc > 0;
  if (!charged) return { kind: "not_charged" };
  if (dispute !== undefined) {
    return viewer === "payer"
      ? { kind: "disputed", dispute, showReason: true }
      : {
          kind: "disputed",
          dispute: { ...dispute, reason: "" },
          showReason: false,
        };
  }
  if (!open) return { kind: "window_closed" };
  return viewer === "payer" ? { kind: "disputable" } : { kind: "view_only" };
}

/**
 * The whole receipt panel from the backend's answer, the connected wallet,
 * whether the run has finished, and the clock — the panel renders this and
 * decides nothing. `nowMs` must already be on the SERVER's clock (see
 * `serverClockOffsetMs`); this function trusts it as given.
 *
 * - demo mode, or no answer yet → hidden. Loading and failure are the hook's
 *   to report; neither may read as "not settled".
 * - an answer without a `settlement` key → hidden: a backend that predates
 *   receipts, which is not an error the buyer can do anything about.
 * - `settlement: null` → not settled, and whether the run is still going says
 *   which of "not yet" and "nothing was charged" it is.
 * - otherwise the receipt, with the window open strictly before its close on
 *   the server's clock. A `nowMs` that is not a number closes it: failing
 *   shut hides a button, failing open offers one the server will refuse.
 */
export function disputeView(input: {
  res: TaskDisputes | null;
  viewerAddress: string | null;
  workflowDone: boolean;
  nowMs: number;
  demo: boolean;
}): DisputePanelView {
  const { res, viewerAddress, workflowDone, nowMs, demo } = input;
  if (demo || res === null) return HIDDEN;
  const settlement = res.settlement;
  if (settlement === undefined) return HIDDEN;
  if (settlement === null)
    return { kind: "not_settled", running: !workflowDone };

  const viewer = viewerOf(settlement.payer, viewerAddress);
  const closesAtMs = settlement.window_closes_at * 1_000;
  const leftMs = closesAtMs - nowMs;
  const open = leftMs > 0;
  const byStep = disputesByStep(res.disputes);
  const steps = [...settlement.steps]
    .sort((a, b) => a.step_index - b.step_index)
    .map((step) => ({
      step,
      state: stepState(
        step,
        byStep.get(step.step_index),
        settlement,
        open,
        viewer,
      ),
    }));

  return {
    kind: "settled",
    viewer,
    window: { open, closesAtMs, remainingMs: open ? leftMs : 0 },
    jobIdHex: settlement.job_id_hex,
    payer: settlement.payer,
    settledAtMs: settlement.settled_at * 1_000,
    settledUsdc: settlement.settled_usdc,
    chargeTx: settlement.charge_tx,
    proofTx: settlement.proof_tx,
    policy: settlement.policy,
    steps,
  };
}

// ── raising one ─────────────────────────────────────────────────

/**
 * Challenge → wallet signature → open, for one step.
 *
 * Refused before any network call, as a `DisputeRefusal` the dialog reads
 * through `disputeErrorCode` like a server refusal: a reason that is empty
 * once trimmed or longer than `MAX_DISPUTE_REASON_CHARS` (`reason_required`),
 * and a wallet that is not the recorded payer (`not_the_payer`) — the server
 * would refuse both, but only after the buyer had been asked to sign.
 *
 * The challenge's message is signed VERBATIM. A wallet that declines rejects
 * with its own error, untouched, so the dialog can run it through
 * `classifyError` and tell "you cancelled" from "it failed", exactly as the
 * bind page does.
 *
 * One retry, on `challenge_expired` only: the nonce lives five minutes and a
 * wallet popup can sit open for longer, which is nobody's fault and is cured
 * by a fresh challenge and a second signature. A second expiry throws —
 * something other than a slow buyer is wrong. Nothing else is retried: every
 * other refusal is an answer, and `duplicate_dispute` in particular means the
 * step already has its dispute, which the caller refetches rather than reads
 * off the error (see `openDispute`).
 */
export async function raiseDispute(args: {
  settlement: SettlementView;
  step: SettlementStepView;
  reason: string;
  payer: string;
  signMessage: (m: string) => Promise<string>;
}): Promise<Dispute> {
  const { settlement, step, payer, signMessage } = args;
  const reason = args.reason.trim();
  if (reason.length === 0) {
    throw new DisputeRefusal(
      "reason_required",
      "Say what went wrong with this step.",
    );
  }
  if (reason.length > MAX_DISPUTE_REASON_CHARS) {
    throw new DisputeRefusal(
      "reason_required",
      `Keep the reason to ${MAX_DISPUTE_REASON_CHARS} characters.`,
    );
  }
  if (payer !== settlement.payer) {
    throw new DisputeRefusal(
      "not_the_payer",
      "Only the wallet that paid for this workflow can dispute it.",
    );
  }

  const target: DisputeChallengeReq = {
    job_id_hex: settlement.job_id_hex,
    step_index: step.step_index,
  };
  for (let attempt = 1; ; attempt += 1) {
    const challenge = await createDisputeChallenge(target);
    const signature_b64 = await signMessage(challenge.message);
    try {
      return await openDispute({
        ...target,
        reason,
        payer,
        nonce: challenge.nonce,
        signature_b64,
      });
    } catch (err) {
      if (attempt === 1 && disputeErrorCode(err) === "challenge_expired") {
        continue;
      }
      throw err;
    }
  }
}

// ── formatting ──────────────────────────────────────────────────

const SECOND_MS = 1_000;
const MINUTE_MS = 60 * SECOND_MS;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/** `4m 12s`, or `4m` when the smaller unit is zero — never a "0m" or "0s". */
const pair = (
  big: number,
  bigUnit: string,
  small: number,
  smallUnit: string,
) => (small > 0 ? `${big}${bigUnit} ${small}${smallUnit}` : `${big}${bigUnit}`);

/**
 * What is left of the window, readable at every scale: "1d 2h left",
 * "22h 59m left", "4m 12s left", "less than a minute left".
 *
 * Seconds appear only in the final hour, where the panel ticks every second
 * and they are worth watching; under a minute a running number would only
 * make the buyer race it, so the copy stops counting. Units are floored, so
 * the label never promises time that is not there. Nothing left — or a value
 * that is not a number — reads "no time left", never a negative or a zero.
 */
export function formatRemaining(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "no time left";
  if (ms < MINUTE_MS) return "less than a minute left";
  if (ms < HOUR_MS) {
    const minutes = Math.floor(ms / MINUTE_MS);
    const seconds = Math.floor((ms % MINUTE_MS) / SECOND_MS);
    return `${pair(minutes, "m", seconds, "s")} left`;
  }
  if (ms < DAY_MS) {
    const hours = Math.floor(ms / HOUR_MS);
    const minutes = Math.floor((ms % HOUR_MS) / MINUTE_MS);
    return `${pair(hours, "h", minutes, "m")} left`;
  }
  const days = Math.floor(ms / DAY_MS);
  const hours = Math.floor((ms % DAY_MS) / HOUR_MS);
  return `${pair(days, "d", hours, "h")} left`;
}

/**
 * A USDC amount as the receipt prints it: "0.05 USDC", "0.0025 USDC".
 *
 * lib/money's `formatSettled` is the codebase's one definition of settled
 * value, so this only converts to it. It prints to the stroop — the chain's
 * own precision — which matters here: a credit of half a 0.005 step is 0.0025,
 * and a fixed three places would round the buyer's refund up to 0.003, a
 * figure the backend computed precisely so the UI would never re-derive it.
 * A value that is not a number prints as a dash, never "NaN USDC".
 */
export function formatUsdc(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return formatSettled(Math.round(n * STROOPS_PER_UNIT), "USDC");
}
