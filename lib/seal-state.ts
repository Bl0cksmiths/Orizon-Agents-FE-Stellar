/**
 * Reading a paid run's attestation seal state (`Task.seal`) and saying it in
 * words, in one place.
 *
 * The seal is what makes a run's attestation verifiable on Stellar; it is not
 * the payment. A seal that failed leaves the payment exactly where it was, and
 * every sentence here says so rather than let "failed" read as "you lost your
 * money".
 */

import {
  SEAL_KINDS,
  SEAL_STATES,
  type SealKind,
  type SealState,
} from "./types";

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

const KINDS: ReadonlySet<string> = new Set(SEAL_KINDS);

/**
 * What the seal attests, as this build can use it: absent and null kept
 * apart, and a word it does not know read as absent — today's wording, the
 * one an older backend gets, rather than a guess at what the new word means.
 */
export function readSealKind(
  v: string | null | undefined,
): SealKind | null | undefined {
  if (v === undefined || v === null) return v;
  return KINDS.has(v) ? (v as SealKind) : undefined;
}

/**
 * A delivery-only seal (`seal_kind: "delivery_only"`): the work was
 * delivered, nobody could be paid, and the seal records the delivery alone.
 * Nothing here may imply a payment, or a window to dispute one.
 */
export const DELIVERY_SEAL_LABEL: Record<SealState, string> = {
  sealed: "Attested on Stellar — delivered, no payment made",
  pending: "Attesting delivery… checking the ledger",
  unconfirmed: "Delivery attestation not confirmed yet",
  failed: "Delivery attestation failed — no payment was made",
};

export const DELIVERY_SEAL_SENTENCE: Record<SealState, string> = {
  sealed:
    "The run's delivery is recorded on the Stellar ledger. No payment was made for it — there was no operator on-chain to pay.",
  pending:
    "The delivery attestation was submitted and the backend is confirming it on the ledger. No payment was made for this run.",
  unconfirmed:
    "The backend could not confirm the delivery attestation in time; it may still land. No payment was made for this run.",
  failed:
    "The delivery attestation is not on the ledger. No payment was made for this run, so nothing else is affected.",
};

/** The label and sentence for a seal, by what it attests. A paid seal, or
 * one whose kind is not known, keeps the paid wording. */
export function sealWords(
  state: SealState,
  kind: SealKind | null | undefined,
): { label: string; sentence: string } {
  return kind === "delivery_only"
    ? {
        label: DELIVERY_SEAL_LABEL[state],
        sentence: DELIVERY_SEAL_SENTENCE[state],
      }
    : { label: SEAL_LABEL[state], sentence: SEAL_SENTENCE[state] };
}
