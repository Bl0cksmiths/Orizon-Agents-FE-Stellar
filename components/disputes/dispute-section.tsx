"use client";
import dynamic from "next/dynamic";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import type { DisputeDialogCloseReason } from "@/components/disputes/dispute-dialog";
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
import { cn } from "@/lib/utils";
import { useWallet } from "@/lib/wallet";

type SettledView = Extract<DisputePanelView, { kind: "settled" }>;

// The form and its entrance motion are 34 KB of the trace page's first load
// (445 KB → 411 KB) that only a payer inside an open window can ever use — not
// a stranger on a shared link, not anyone once the window has closed — so
// they are fetched the moment such a payer is on the page, and not before.
const loadDisputeDialog = () => import("@/components/disputes/dispute-dialog");
const DisputeDialog = dynamic(
  () => loadDisputeDialog().then((m) => m.DisputeDialog),
  { ssr: false },
);

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
 * A skeleton bar centred in a line box of the text it stands in for, so each
 * placeholder takes the height its real line will: the bar is the shimmer,
 * the box is the layout.
 */
function Line({
  box,
  bar,
  className,
}: {
  box: string;
  bar: string;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center", box, className)}>
      <Skeleton className={bar} />
    </div>
  );
}

/**
 * An invisible stand-in exactly as long as the value it holds a place for, in
 * that value's font, under a shimmer: it wraps wherever the real value will,
 * at every width, where a count of skeleton lines could only be tuned for
 * one or two.
 */
function Ghost({ text }: { text: string }) {
  return (
    <div className="relative">
      <span className="invisible">{text}</span>
      <Skeleton className="absolute inset-x-0 inset-y-0.5" />
    </div>
  );
}

/**
 * The receipt's facts as the panel lists them, with values as long as the
 * real ones: a G-address is 56 characters and a transaction hash 64, set in
 * the same monospace, so they break onto as many lines as the real ones do.
 */
const FACTS = [
  { label: "payer", value: "G".repeat(56), link: true },
  { label: "settled", value: "Sep 30, 2026, 12:00 PM GMT+8", link: false },
  { label: "charge", value: "0".repeat(64), link: true },
  { label: "seal", value: "0".repeat(64), link: true },
] as const;

/** As long as the credit terms line the panel shows beside its actions. */
const TERMS_GHOST =
  "terms · An upheld dispute credits a share of that step's charge back to you, paid by the platform and never clawed back from the agent. The platform decides each dispute; there is no on-chain arbitration.";

/**
 * The receipt's own frame, drawn empty while it loads: the card, header,
 * facts, window, terms and step rows of a settled receipt, each in the line
 * boxes the panel's text occupies at a phone's width and a desktop's.
 *
 * A short placeholder reserved none of it, and the settlement arriving then
 * shoved the trace log most of a screen down under the reader. Measured
 * against the rendered panel by the dispute e2e spec, which fails the build if
 * the log moves by more than a line when the receipt lands.
 */
function ReceiptSkeleton() {
  return (
    <div aria-busy="true">
      <LoadingStatus label="Loading the receipt…" />
      <Card className="p-4 sm:p-6">
        {/* Card wraps its children in one div, so the stack's spacing has to
            live on a div of its own inside it. */}
        <div className="space-y-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <div className="flex h-7 items-center gap-2">
                <Skeleton className="h-5 w-20" />
                <Skeleton className="h-5 w-20" />
              </div>
              <Line box="mt-1 h-5" bar="h-3.5 w-36" />
            </div>
            <div className="flex flex-col sm:items-end">
              <Line box="h-[15px]" bar="h-2.5 w-24" />
              <Line box="mt-3 h-9" bar="h-7 w-40" />
            </div>
          </div>

          <div className="space-y-3 font-mono text-sm">
            {FACTS.map(({ label, value, link }) => (
              <div
                key={label}
                className="flex items-start justify-between gap-4 border-b border-border/40 pb-2 last:border-0"
              >
                <div className="pt-1 text-[10px] uppercase tracking-widest">
                  <Ghost text={label} />
                </div>
                <div className="break-all text-right">
                  <Ghost text={value} />
                  {link && <Line box="mt-1 h-5 justify-end" bar="h-2.5 w-36" />}
                </div>
              </div>
            ))}
          </div>

          <div className="clip-cyber-sm border border-border/60 px-4 py-3">
            {/* Label and countdown, in their own fonts: they share a line or
                wrap onto two exactly where the real pair does. */}
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
              <div className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.25em]">
                <div className="h-2 w-2 shrink-0" />
                <Ghost text="Dispute window open" />
              </div>
              <div className="font-mono text-sm tabular-nums">
                <Ghost text="22h 59m left" />
              </div>
            </div>
            <Skeleton className="mt-3 h-1 w-full" />
            <div className="mt-2 font-mono text-[11px]">
              <Ghost text="closes Sep 30, 2026, 12:00 PM GMT+8" />
            </div>
          </div>

          <div className="max-w-2xl text-xs leading-relaxed">
            <Ghost text={TERMS_GHOST} />
          </div>

          <div className="space-y-3 border-t border-border/60 pt-5">
            <Line box="h-[16.5px]" bar="h-2.5 w-12" />
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="clip-cyber-sm flex h-[180px] flex-col gap-3 border border-border/60 p-4 sm:h-[115px] sm:flex-row sm:justify-between"
              >
                <div className="flex min-w-0 gap-3">
                  <Skeleton className="h-7 w-7 shrink-0" />
                  <div className="min-w-0 space-y-3">
                    <Skeleton className="h-4 w-28" />
                    <Skeleton className="h-3 w-44 max-w-full" />
                  </div>
                </div>
                <div className="flex flex-col gap-2 pl-10 sm:items-end sm:pl-0">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-8 w-24" />
                </div>
              </div>
            ))}
          </div>
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
  // Where the dialog puts focus when it closes onto a page that no longer has
  // the button it was opened from — which is every successful dispute, since
  // the step swaps its action for its receipt the moment the refresh lands.
  // The receipt's own heading is the one node on the panel that survives that
  // swap, so a keyboard or screen-reader user comes back to the receipt they
  // were reading instead of to the top of the document.
  const receiptHeadingRef = useRef<HTMLHeadingElement>(null);
  // The open dialog's step, and the settlement as it stood at the click. A
  // settlement record never changes once written, so the snapshot is exact —
  // and the dialog is not handed a new object on every tick of the countdown.
  const [target, setTarget] = useState<DisputeTarget | null>(null);

  const canDispute =
    view.kind === "settled" &&
    view.steps.some(({ state }) => state.kind === "disputable");
  // Fetched as soon as there is a Dispute button, so the form is ready by the
  // time it is pressed.
  useEffect(() => {
    if (canDispute) void loadDisputeDialog();
  }, [canDispute]);

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
  // `refresh` never rejects and resolves once its answer is on screen, so the
  // retry control can say it is working and not take a second press.
  const [retrying, setRetrying] = useState(false);
  const retry = useCallback(async () => {
    setRetrying(true);
    await refresh();
    setRetrying(false);
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
        <ErrorNote
          onRetry={() => void retry()}
          retrying={retrying}
          retryLabel="↻ retry"
        >
          ⚠ receipt unavailable — {error}
        </ErrorNote>
      )}
      <ReceiptPanel
        view={view}
        headingRef={receiptHeadingRef}
        onDispute={onDispute}
        onConnect={onConnect}
      />
      {/* Mounted while a step can be disputed — which keeps a half-typed
          reason across an accidental close — or while its dialog is still
          open after the last step stopped being disputable. */}
      {(canDispute || target !== null) && (
        <DisputeDialog
          open={target !== null}
          step={target?.step ?? null}
          settlement={target?.settlement ?? null}
          onClose={onClose}
          onSubmitted={onSubmitted}
          returnFocusRef={receiptHeadingRef}
        />
      )}
    </div>
  );
});
