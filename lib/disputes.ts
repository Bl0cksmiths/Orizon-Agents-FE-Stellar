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

import { ApiError } from "./api";
import type { DisputeErrorCode } from "./types";

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
