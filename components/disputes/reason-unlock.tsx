"use client";
/**
 * The payer's offer to read their own dispute words again (D-067), when the
 * backend withheld them from this tab: one explicit control, and nothing
 * asked of the wallet until it is pressed.
 *
 * Presentational, like the panel it sits in. Whether to draw it at all is the
 * view's `reasonsWithheld`, and every outcome arrives decided as a status;
 * this file only says what each one means for the payer.
 */

import { useId } from "react";

import { Button } from "@/components/ui/button";
import type { ReasonUnlockStatus } from "@/lib/use-reason-unlock";

/**
 * The line under the control after an attempt. A declined prompt is the
 * payer's choice, stated in the same quiet voice as the offer — never an
 * alarm, and never a reason to sign next time.
 */
const OUTCOME: Record<Exclude<ReasonUnlockStatus, "idle">, string> = {
  signing: "Waiting for your wallet to sign…",
  declined: "Not signed. Your reason stays hidden until you choose to show it.",
  expired: "The request expired before it was signed. Try again.",
  not_the_payer:
    "The platform did not recognise this wallet as the one that paid, so your reason stays hidden.",
  busy: "The platform is busy right now. Try again in a minute.",
  failed: "Your reason could not be shown just now. Try again.",
};

export function ReasonUnlock({
  status,
  onUnlock,
}: {
  status: ReasonUnlockStatus;
  /** The payer asked to sign. The only way a signature is ever requested. */
  onUnlock: () => void;
}) {
  const signing = status === "signing";
  const costId = useId();
  return (
    <div className="clip-cyber-sm border border-violet/40 bg-violet/5 px-4 py-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p id={costId} className="text-xs leading-relaxed text-text/90">
          Your dispute reason, and the platform&apos;s reply to it, are shown
          only to the wallet that paid. Sign a message to show them here — it
          costs nothing and sends no transaction.
        </p>
        {/* aria-disabled, not disabled, while the wallet is open: a disabled
            button drops keyboard focus to the page, and the payer should be
            left where they pressed. The hook refuses a second press. */}
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={signing ? undefined : onUnlock}
          aria-disabled={signing}
          // Read with the button: signing costs nothing and sends nothing.
          aria-describedby={costId}
          className="shrink-0 self-start sm:self-auto"
        >
          {signing ? "Signing…" : "Show my reason"}
        </Button>
      </div>
      {/* Mounted empty, so the first outcome is announced — and never
          display:none while empty, which takes a region out of the
          accessibility tree and can cost the first announcement. Only its
          margin collapses, so an empty region leaves no gap. */}
      <p
        role="status"
        aria-live="polite"
        className="mt-3 text-xs leading-relaxed text-muted empty:mt-0"
      >
        {status === "idle" ? "" : OUTCOME[status]}
      </p>
    </div>
  );
}
