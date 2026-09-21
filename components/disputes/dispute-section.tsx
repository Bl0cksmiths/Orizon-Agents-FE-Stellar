"use client";
import { memo, useCallback, useState } from "react";
import {
  DisputeDialog,
  type DisputeDialogCloseReason,
} from "@/components/disputes/dispute-dialog";
import { ReceiptPanel } from "@/components/disputes/receipt-panel";
import { Card } from "@/components/ui/card";
import { ErrorNote } from "@/components/ui/error-note";
import { LoadingStatus, Skeleton } from "@/components/ui/skeleton";
import type {
  DisputePanelView,
  SettlementStepView,
  SettlementView,
} from "@/lib/types";
import { useDisputePanel } from "@/lib/use-dispute-panel";
import { useWallet } from "@/lib/wallet";

type SettledView = Extract<DisputePanelView, { kind: "settled" }>;

/**
 * The settlement a dispute is raised against, rebuilt from the panel's view.
 * The view carries every field of the record, renamed and in milliseconds,
 * so this is a lossless inverse rather than a second source of truth.
 */
function settlementOf(view: SettledView): SettlementView {
  return {
    job_id_hex: view.jobIdHex,
    payer: view.payer,
    settled_at: Math.round(view.settledAtMs / 1000),
    window_closes_at: Math.round(view.window.closesAtMs / 1000),
    settled_usdc: view.settledUsdc,
    charge_tx: view.chargeTx,
    proof_tx: view.proofTx,
    steps: view.steps.map((s) => s.step),
    policy: view.policy,
  };
}

/** The step a dialog is about, and the settlement it was charged under. */
type DisputeTarget = { step: SettlementStepView; settlement: SettlementView };

/** The receipt's four facts: payer, settled time, charge and seal. */
const FACT_LINES = [2, 1, 2, 2] as const;

/**
 * The receipt's own frame, drawn empty while it loads: the same card, header,
 * facts, window line and step rows the panel renders, at their heights. A
 * one-line placeholder reserved none of it, so the settlement arriving pushed
 * the whole trace log half a screen down under the reader.
 */
function ReceiptSkeleton() {
  return (
    <div aria-busy="true">
      <LoadingStatus label="Loading the receipt…" />
      <Card className="space-y-6 p-4 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Skeleton className="h-7 w-24" />
              <Skeleton className="h-5 w-20" />
            </div>
            <Skeleton className="mt-2 h-4 w-40" />
          </div>
          <div className="flex flex-col gap-3 sm:items-end">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-9 w-36" />
          </div>
        </div>

        <div className="space-y-3">
          {FACT_LINES.map((lines, i) => (
            <div
              key={i}
              className="flex items-start justify-between gap-4 border-b border-border/40 pb-2 last:border-0"
            >
              <Skeleton className="mt-1 h-3 w-14 shrink-0" />
              <div className="flex min-w-0 flex-1 flex-col items-end gap-2">
                <Skeleton className="h-4 w-full max-w-[26rem]" />
                {lines === 2 && <Skeleton className="h-3 w-28" />}
              </div>
            </div>
          ))}
        </div>

        <div className="clip-cyber-sm space-y-3 border border-border/60 px-4 py-3">
          <div className="flex items-center justify-between gap-4">
            <Skeleton className="h-3 w-40" />
            <Skeleton className="h-4 w-24" />
          </div>
          <Skeleton className="h-1 w-full" />
          <Skeleton className="h-3 w-48 max-w-full" />
        </div>

        <div className="space-y-3 border-t border-border/60 pt-5">
          <Skeleton className="h-3 w-12" />
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="clip-cyber-sm flex gap-3 border border-border/60 p-4"
            >
              <Skeleton className="h-7 w-7 shrink-0" />
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className="h-4 w-32 max-w-full" />
                <Skeleton className="h-3 w-48 max-w-full" />
              </div>
              <Skeleton className="h-8 w-20 shrink-0" />
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

type Props = {
  taskId: string | null;
  /** The trace stream has sealed, so the workflow can have settled. */
  workflowDone: boolean;
  /** The trace page's demo replay: a run nobody paid for. */
  demo: boolean;
};

/**
 * The receipt and the dispute action for one workflow, mounted above the
 * trace.
 *
 * Everything that changes on the window's tick lives in here — the hook's
 * clock, the panel it feeds, the open dialog — so a tick re-renders this
 * subtree and never the trace page. Memoized on its three primitive props for
 * the same reason in the other direction: the page re-renders on every trace
 * line, and no trace line changes what the receipt says.
 */
export const DisputeSection = memo(function DisputeSection({
  taskId,
  workflowDone,
  demo,
}: Props) {
  const { view, loading, error, refresh } = useDisputePanel(taskId, {
    workflowDone,
    demo,
  });
  const { connect } = useWallet();
  // The open dialog's step, and the settlement as it stood at the click. A
  // settlement record never changes once written, so the snapshot is exact —
  // and the dialog is not handed a new object on every tick of the countdown.
  const [target, setTarget] = useState<DisputeTarget | null>(null);

  const onDispute = (step: SettlementStepView) => {
    if (view.kind !== "settled") return;
    setTarget({ step, settlement: settlementOf(view) });
  };
  const onConnect = useCallback(() => {
    void connect();
  }, [connect]);
  // Every way out but a plain dismissal means the receipt is out of date: a
  // `duplicate_dispute` (the step already had one, raised elsewhere) or a
  // refusal that proves the window or the step is not what it shows. The
  // re-read is what makes the step show that dispute, or lose its action,
  // instead of offering one the server would refuse.
  const onClose = useCallback(
    (reason: DisputeDialogCloseReason) => {
      setTarget(null);
      if (reason !== "dismissed") void refresh();
    },
    [refresh],
  );
  // A dispute raised here: the step shows it from the server's own record.
  const onSubmitted = useCallback(() => {
    void refresh();
  }, [refresh]);

  if (demo || !taskId) return null;
  // Only before the first answer: a refresh keeps the receipt on screen.
  if (loading) return <ReceiptSkeleton />;
  // An older backend answers without a settlement, and nothing is drawn: not
  // an empty box, which would still take a gap in the page's stack.
  if (view.kind === "hidden" && !error) return null;

  // A flex gap, not `space-y`: the dialog is a child here, and space-y's
  // sibling margin outranks the `mt-auto` that seats it as a bottom sheet on
  // a phone and centres it above. A closed <dialog> is display:none and an
  // open one sits in the top layer, so neither takes a gap.
  return (
    <div className="flex flex-col gap-4">
      {error && (
        // Beside the receipt, never instead of the page: the trace below
        // renders from its own stream whatever this read did.
        <ErrorNote onRetry={() => void refresh()} retryLabel="↻ retry">
          ⚠ receipt unavailable — {error}
        </ErrorNote>
      )}
      <ReceiptPanel view={view} onDispute={onDispute} onConnect={onConnect} />
      <DisputeDialog
        open={target !== null}
        step={target?.step ?? null}
        settlement={target?.settlement ?? null}
        onClose={onClose}
        onSubmitted={onSubmitted}
      />
    </div>
  );
});
