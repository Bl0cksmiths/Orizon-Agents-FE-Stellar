"use client";
import { memo, useCallback, useState } from "react";
import { DisputeDialog } from "@/components/disputes/dispute-dialog";
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

/**
 * Held at the height of a receipt so the trace below does not jump when the
 * settlement arrives: a header row, the window line, and one row per step.
 */
function ReceiptSkeleton() {
  return (
    <Card aria-busy="true">
      <LoadingStatus label="Loading the receipt…" />
      <div className="flex items-center justify-between gap-4">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-5 w-28" />
      </div>
      <Skeleton className="mt-4 h-4 w-56 max-w-full" />
      <div className="mt-5 space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center justify-between gap-4 border-t border-border/40 pt-3"
          >
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-3 w-32 max-w-full" />
              <Skeleton className="h-3 w-48 max-w-full" />
            </div>
            <Skeleton className="h-8 w-20 shrink-0" />
          </div>
        ))}
      </div>
    </Card>
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
  const [open, setOpen] = useState(false);
  // Kept after the dialog closes so it still has its content while it animates
  // out. The settlement is a snapshot taken at the click: a settlement record
  // never changes once written, so the snapshot is exact, and the dialog is
  // not handed a new object on every tick of the countdown.
  const [target, setTarget] = useState<DisputeTarget | null>(null);

  const onDispute = (step: SettlementStepView) => {
    if (view.kind !== "settled") return;
    setTarget({ step, settlement: settlementOf(view) });
    setOpen(true);
  };
  const onConnect = useCallback(() => {
    void connect();
  }, [connect]);
  const onClose = useCallback(() => setOpen(false), []);
  // A new dispute and a duplicate one end the same way: the step now has a
  // dispute on record, and the receipt re-reads it so the step shows that
  // dispute instead of an action the server would refuse.
  const onSubmitted = useCallback(() => {
    void refresh();
  }, [refresh]);

  if (demo || !taskId) return null;
  if (loading && view.kind === "hidden") return <ReceiptSkeleton />;
  // An older backend answers without a settlement, and nothing is drawn: not
  // an empty box, which would still take a gap in the page's stack.
  if (view.kind === "hidden" && !error) return null;

  return (
    <div className="space-y-4">
      {error && (
        // Beside the receipt, never instead of the page: the trace below
        // renders from its own stream whatever this read did.
        <ErrorNote onRetry={() => void refresh()} retryLabel="↻ retry">
          ⚠ receipt unavailable — {error}
        </ErrorNote>
      )}
      <ReceiptPanel view={view} onDispute={onDispute} onConnect={onConnect} />
      <DisputeDialog
        open={open}
        step={target?.step ?? null}
        settlement={target?.settlement ?? null}
        onClose={onClose}
        onSubmitted={onSubmitted}
      />
    </div>
  );
});
