/**
 * Reading a paid run's attestation seal state (`Task.seal`) and saying it in
 * words, in one place.
 *
 * The seal is what makes a run's attestation verifiable on Stellar; it is not
 * the payment. A seal that failed leaves the payment exactly where it was, and
 * every sentence here says so rather than let "failed" read as "you lost your
 * money".
 */

import { SEAL_STATES, type SealState } from "./types";

const KNOWN: ReadonlySet<string> = new Set(SEAL_STATES);

/**
 * The state as this build can use it: absent stays absent (a backend that
 * predates the field), null stays null (no seal was submitted), and a word
 * this build cannot name reads as `unconfirmed` — the answer that claims
 * least: not on the ledger as far as anyone here can say, not failed either.
 */
export function readSealState(
  v: string | null | undefined,
): SealState | null | undefined {
  if (v === undefined || v === null) return v;
  return KNOWN.has(v) ? (v as SealState) : "unconfirmed";
}

/** The backend is still working the seal out: keep following the run. */
export const isSealPending = (v: string | null | undefined): boolean =>
  readSealState(v) === "pending";

/** The short label, for a badge or a heading. */
export const SEAL_LABEL: Record<SealState, string> = {
  sealed: "Sealed on Stellar",
  pending: "Sealing… checking the ledger",
  unconfirmed: "Seal not confirmed yet",
  failed: "Seal failed — your payment stands",
};

/** The sentence beside the label: what it means for the buyer. */
export const SEAL_SENTENCE: Record<SealState, string> = {
  sealed: "The run's attestation is recorded on the Stellar ledger.",
  pending:
    "The attestation was submitted and the backend is confirming it on the ledger. This usually takes under two minutes.",
  unconfirmed:
    "The backend could not confirm the attestation in time. It may still land on the ledger; nothing about the payment depends on it.",
  failed:
    "The attestation is not on the ledger. The payment for this run is unaffected and stands as settled.",
};

/** What a run with no seal submitted is told: there was nothing to attest. */
export const NO_SEAL_SENTENCE =
  "No attestation seal was submitted for this run — it paid no agent on-chain, so there is nothing to attest.";
