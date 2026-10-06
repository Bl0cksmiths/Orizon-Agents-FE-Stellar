/**
 * What became of the run's attestation seal (`Task.seal`), said in words.
 *
 * The seal attests the run on Stellar; it is not the payment. Each state is
 * a status sentence, not a colour: the glyph is decoration, the words carry
 * it — and a seal that failed says plainly that the payment stands.
 */

import { NO_SEAL_SENTENCE, sealWords } from "@/lib/seal-state";
import type { SealKind, SealState } from "@/lib/types";
import { cn } from "@/lib/utils";

const GLYPH: Record<SealState, string> = {
  sealed: "✓",
  pending: "◌",
  unconfirmed: "?",
  failed: "✕",
};

const TONE: Record<SealState, string> = {
  sealed: "text-cyan",
  pending: "text-muted",
  unconfirmed: "text-muted",
  failed: "text-magenta/90",
};

export function SealStatus({
  seal,
  kind,
  className,
}: {
  /** What the seal attests. `delivery_only` is worded with no payment and
   *  no dispute; absent (an older backend) keeps the paid wording. */
  kind?: SealKind | null;
  /** null: no seal was submitted. (Absent — an older backend — renders
   *  nothing: the caller keeps its own wording then.) */
  seal: SealState | null;
  className?: string;
}) {
  if (seal === null) {
    return (
      <p
        role="status"
        className={cn("font-mono text-xs leading-5 text-muted", className)}
      >
        {NO_SEAL_SENTENCE}
      </p>
    );
  }
  return (
    <div role="status" className={cn("space-y-1", className)}>
      <p className={cn("font-mono text-xs font-semibold", TONE[seal])}>
        <span aria-hidden="true">{GLYPH[seal]} </span>
        {sealWords(seal, kind).label}
      </p>
      <p className="text-xs leading-5 text-muted">
        {sealWords(seal, kind).sentence}
      </p>
    </div>
  );
}
