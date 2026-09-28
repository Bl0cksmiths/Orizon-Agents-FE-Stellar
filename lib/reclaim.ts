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

import { buildReclaim, submitSigned } from "./api";
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
  /** The escrow holds no custody (v1): there is nothing to reclaim. */
  | { kind: "nothing_held" }
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
 * The build route's refusals (backend `authorization_guard.check_reclaimable`,
 * a read-only simulate before anything is built, so the wallet is never asked
 * to sign what the contract would refuse), by their exact codes.
 */
const ROUTE_REFUSALS: Readonly<Record<string, ReclaimResult>> = {
  authorization_locked: { kind: "not_yet" },
  authorization_settled: { kind: "already_settled" },
  authorization_revoked: { kind: "already_reclaimed" },
  reclaim_unsupported: { kind: "nothing_held" },
};

/** The contract's own refusal, by code, from a failed transaction. */
function contractRefusal(code: number | null): ReclaimResult | null {
  if (code === ESCROW_ERROR.Locked) return { kind: "not_yet" };
  if (code === ESCROW_ERROR.Replay) return { kind: "already_settled" };
  if (code === ESCROW_ERROR.Revoked) return { kind: "already_reclaimed" };
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
    // Read by shape, as lib/api's `ApiError` carries it: a rejection with an
    // HTTP status is an answer from the backend.
    const answer =
      typeof e === "object" && e !== null
        ? (e as {
            status?: unknown;
            code?: unknown;
            body?: unknown;
            message?: unknown;
          })
        : null;
    if (answer !== null && typeof answer.status === "number") {
      const code = typeof answer.code === "string" ? answer.code : undefined;
      const message = typeof answer.message === "string" ? answer.message : "";
      // A 404 with no code of its own is the route being absent — the
      // answer FastAPI gives for a path it does not have — not an
      // authorization the route looked for and could not find.
      if (answer.status === 404 && (code === undefined || code === "not_found"))
        return { kind: "unavailable" };
      const known = code !== undefined ? ROUTE_REFUSALS[code] : undefined;
      if (known !== undefined) return known;
      const byContract = contractRefusal(escrowErrorCode(message));
      if (byContract !== null) return byContract;
      // Any other refusal carries the backend's own sentence, which says
      // what is wrong and what to do; that is what the buyer reads.
      const body = answer.body;
      const said =
        typeof body === "object" && body !== null && "error" in body
          ? (body as { error?: { message?: unknown } }).error?.message
          : undefined;
      if (typeof said === "string" && said.length > 0) {
        return {
          kind: "failed",
          error: {
            kind: "unknown",
            title: "The reclaim could not be prepared",
            detail: `${said.charAt(0).toUpperCase()}${said.slice(1)}. Nothing was signed or sent.`,
            raw: message,
          },
        };
      }
    }
    return { kind: "failed", error: classifyError(e) };
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
        contractRefusal(escrowErrorCode(text)) ?? {
          kind: "failed",
          error: classifyError(new Error(outcome.outcome.message)),
          hash: outcome.result.hash,
        }
      );
    }
  }
}
