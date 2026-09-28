/**
 * Taking back an escrow v2 authorization that was never settled.
 *
 * `reclaim(payer, auth_id)` is the buyer's alone: the payer signs it, only
 * once `expires_at` has passed (`Locked` before then, so the settler can
 * still pay operators for delivered work), and only while the authorization
 * is neither settled (`Replay`) nor already reclaimed (`Revoked`). The
 * platform releases custody itself wherever it can, so by the time a buyer
 * presses Reclaim the money may already be back — which is an answer to say
 * plainly, not an error.
 *
 * Build → sign → submit through the same `signAndSubmit` sequence every
 * owner-signed transaction uses, so wallet errors are classified one way
 * everywhere. Everything is injectable so the sequence is testable without a
 * wallet, a backend or the network.
 */

import { ApiError, buildReclaim, submitSigned } from "./api";
import type { RegisterOutcome } from "./register-submit";
import { signAndSubmit } from "./sign-submit";
import type { SubmitResult } from "./types";
import { classifyError, type FriendlyError } from "./wallet-errors";

/** The escrow's own refusals a reclaim can meet (contracts `orizon_shared::codes`). */
export const ESCROW_ERROR = {
  Revoked: 6,
  Replay: 7,
  Locked: 9,
} as const;

export type ReclaimResult =
  /** The custody came back to the payer, in this transaction. */
  | { kind: "reclaimed"; hash: string }
  /** The wallet's prompt was declined: nothing was sent. */
  | { kind: "declined" }
  /** `Locked`: the authorization has not expired yet. */
  | { kind: "not_yet" }
  /** `Replay`: a settlement already paid it out and returned the rest. */
  | { kind: "already_settled" }
  /** `Revoked`: it was reclaimed before. */
  | { kind: "already_reclaimed" }
  /** The backend has no reclaim route yet (404). */
  | { kind: "unavailable" }
  | { kind: "failed"; error: FriendlyError; hash?: string };

/**
 * The escrow contract error code in a failure's text, or null. The backend's
 * diagnostics print it as the Python SDK's XDR repr, a host error prints it as
 * `Error(Contract, #n)`; both are read.
 */
export function escrowErrorCode(text: string): number | null {
  const host = /Error\(Contract, #(\d+)\)/.exec(text);
  if (host) return Number(host[1]);
  const repr = /SCError \[type=0, contract_code=<Uint32 \[uint32=(\d+)\]>/.exec(
    text,
  );
  return repr ? Number(repr[1]) : null;
}

/**
 * The same refusals as the build route may name them. The route belongs to
 * another lane and its codes are not frozen, so the words are matched as
 * well as the contract number its message may carry.
 */
function refusalOf(code: number | null, words: string): ReclaimResult | null {
  if (code === ESCROW_ERROR.Locked || /\blocked\b|not_expired/i.test(words))
    return { kind: "not_yet" };
  if (code === ESCROW_ERROR.Replay || /\breplay\b|already_settled/i.test(words))
    return { kind: "already_settled" };
  if (
    code === ESCROW_ERROR.Revoked ||
    /\brevoked\b|already_reclaimed/i.test(words)
  )
    return { kind: "already_reclaimed" };
  return null;
}

/** A submit result read on reclaim's terms: `ok` only for SUCCESS. */
function interpretReclaim(result: SubmitResult): RegisterOutcome {
  const ok = result.status.toUpperCase() === "SUCCESS";
  return {
    ok,
    hash: result.hash,
    message: ok
      ? "Reclaimed."
      : `Reclaim ${result.status}${result.diagnostic ? ` · ${result.diagnostic}` : ""}`,
  };
}

export async function reclaimAuthorization(args: {
  payer: string;
  authIdHex: string;
  signXdr: (xdr: string) => Promise<string>;
  build?: typeof buildReclaim;
  submit?: (signedXdr: string) => Promise<SubmitResult>;
  onSigned?: () => void;
}): Promise<ReclaimResult> {
  const build = args.build ?? buildReclaim;
  let xdr: string;
  try {
    ({ xdr } = await build({ payer: args.payer, auth_id_hex: args.authIdHex }));
  } catch (e) {
    // A 404 with no code of its own is the route being absent — the answer
    // FastAPI gives for a path it does not have — not an authorization the
    // route looked for and could not find.
    if (
      e instanceof ApiError &&
      e.status === 404 &&
      (e.code === undefined || e.code === "not_found")
    ) {
      return { kind: "unavailable" };
    }
    const words = `${e instanceof ApiError ? (e.code ?? "") : ""} ${
      e instanceof Error ? e.message : String(e)
    }`;
    return (
      refusalOf(escrowErrorCode(words), words) ?? {
        kind: "failed",
        error: classifyError(e),
      }
    );
  }

  const outcome = await signAndSubmit(xdr, args.signXdr, {
    submit: args.submit ?? submitSigned,
    interpret: interpretReclaim,
    onSigned: args.onSigned,
  });
  switch (outcome.stage) {
    case "rejected":
      return { kind: "declined" };
    case "sign_error":
    case "submit_error":
      return { kind: "failed", error: outcome.error };
    case "settled": {
      if (outcome.outcome.ok)
        return { kind: "reclaimed", hash: outcome.result.hash };
      const text = `${outcome.result.status} ${outcome.result.diagnostic ?? ""}`;
      return (
        refusalOf(escrowErrorCode(text), "") ?? {
          kind: "failed",
          error: classifyError(new Error(outcome.outcome.message)),
          hash: outcome.result.hash,
        }
      );
    }
  }
}
