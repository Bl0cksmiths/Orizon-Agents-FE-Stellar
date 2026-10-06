"use client";
/**
 * The trace's Attestation card, and the task read behind it.
 *
 * It owns that read — the run's seal state, asked on open, again when the
 * stream ends, and every few seconds while the backend is still confirming
 * the seal — so its answers re-render this card and nothing above it. Held
 * by the page, every answer re-rendered the whole trace, log included, in
 * the middle of the receipt's per-second countdown.
 */

import { memo, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { StellarExpertLink } from "@/components/ui/stellar-link";
import { SealStatus } from "@/components/console/seal-status";
import { getTask } from "@/lib/api";
import { readSealKind, readSealState } from "@/lib/seal-state";
import { useFetch } from "@/lib/use-fetch";
import { cn } from "@/lib/utils";

/** How often a seal the backend is still confirming is asked about again. */
export const SEAL_RECHECK_MS = 5_000;

export const AttestationCard = memo(function AttestationCard({
  taskId,
  done,
  fallbackText,
  unavailable,
  proofTx,
}: {
  taskId: string | null;
  /** The stream ended: the seal is asked about again. */
  done: boolean;
  /** The trace's own reading, for a backend that sends no seal state. */
  fallbackText: string;
  unavailable: boolean;
  proofTx: string | null;
}) {
  const { data: task, reload } = useFetch(
    (signal) => (taskId ? getTask(taskId, signal) : Promise.resolve(null)),
    [taskId, done],
    { enabled: Boolean(taskId), keepPreviousData: true },
  );
  const seal = readSealState(task?.seal);
  // What it attests: a delivery-only seal is worded with no payment.
  const sealKind = readSealKind(task?.seal_kind);
  useEffect(() => {
    if (seal !== "pending") return;
    const timer = setTimeout(reload, SEAL_RECHECK_MS);
    return () => clearTimeout(timer);
  }, [seal, task, reload]);

  return (
    <Card data-attestation="">
      <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-magenta mb-4">
        Attestation
      </div>
      {/* The backend's own word on the seal, when it sends one; a backend
          from before the field keeps the trace's reading. */}
      {seal !== undefined ? (
        <SealStatus seal={seal} kind={sealKind} />
      ) : (
        <div
          className={cn(
            "font-mono text-xs break-all leading-5",
            unavailable ? "text-magenta/90" : "text-muted",
          )}
        >
          {fallbackText}
        </div>
      )}
      {proofTx && (
        <StellarExpertLink
          kind="tx"
          id={proofTx}
          className="mt-3 inline-block"
        />
      )}
    </Card>
  );
});
