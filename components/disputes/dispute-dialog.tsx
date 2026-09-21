"use client";

/**
 * The form a buyer fills in to dispute one settled step (story 4.05).
 *
 * It is the one consequential action in the dispute flow, so before anything
 * is signed it states, in this order, everything the buyer is agreeing to: the
 * step and what it produced, what it cost and what an upheld dispute would
 * credit, the terms that credit is paid under, the buyer's own reason, and
 * what signing will and will not do. The story's words: "the buyer should not
 * have to guess what they are asking for."
 */

import { useId, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { KVRow } from "@/components/ui/kv-row";
import { formatUsdc } from "@/lib/disputes";
import type { Dispute, SettlementStepView, SettlementView } from "@/lib/types";

export type DisputeDialogProps = {
  /** Shown only while this is true AND both `step` and `settlement` are set. */
  open: boolean;
  /** The step being disputed. */
  step: SettlementStepView | null;
  /** The settlement the step was charged under; its `policy` is the terms. */
  settlement: SettlementView | null;
  /** The buyer dismissed the dialog. The page closes it by clearing `open`. */
  onClose: () => void;
  /** Called once, with the stored dispute, when the backend accepts it. */
  onSubmitted: (dispute: Dispute) => void;
};

/** The mono section label the console uses above a block ("▸ intent"). */
function SectionLabel({ id, children }: { id: string; children: ReactNode }) {
  return (
    <h3
      id={id}
      className="font-mono text-[10px] uppercase tracking-[0.25em] text-cyan"
    >
      <span aria-hidden>▸ </span>
      {children}
    </h3>
  );
}

/** Steps count from 0 on the wire, as the backend enumerates the plan. */
const stepNumber = (step: SettlementStepView) => step.step_index + 1;

/**
 * One draft per step. The page may hand back `null` between opens, so the key
 * only moves when a DIFFERENT step arrives: closing by accident and reopening
 * the same step finds the reason still there, while a new step starts clean.
 */
export function DisputeDialog(props: DisputeDialogProps) {
  const { step, settlement } = props;
  const targetKey =
    step && settlement ? `${settlement.job_id_hex}:${step.step_index}` : null;
  const [draftKey, setDraftKey] = useState(targetKey);
  if (targetKey !== null && targetKey !== draftKey) setDraftKey(targetKey);
  return <DisputeForm key={draftKey ?? "none"} {...props} />;
}

function DisputeForm({ open, step, settlement, onClose }: DisputeDialogProps) {
  const shown = open && step !== null && settlement !== null;
  const uid = useId();
  const ids = { step: `${uid}-step`, amounts: `${uid}-amounts` };

  return (
    <Dialog
      open={shown}
      onClose={onClose}
      eyebrow="dispute"
      title={step ? `Dispute step ${stepNumber(step)}` : "Dispute a step"}
      description="Ask the platform to credit part of what this step cost."
      footer={
        <div className="flex justify-end gap-3">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </div>
      }
    >
      {step && settlement && (
        <div className="space-y-6">
          <section aria-labelledby={ids.step} className="space-y-2">
            <SectionLabel id={ids.step}>The step</SectionLabel>
            <p className="text-sm">
              <span className="font-mono text-muted">
                Step {stepNumber(step)}
              </span>
              {/* The dot is for the eye; a screen reader gets a pause. */}
              <span aria-hidden className="text-muted">
                {" · "}
              </span>
              <span className="sr-only">, </span>
              <span className="break-all font-semibold text-text">
                {step.agent_name ?? step.agent_id}
              </span>
            </p>
            {step.output_summary ? (
              <blockquote className="break-words border-l-2 border-violet/60 bg-bg/40 px-3 py-2 text-sm text-text">
                {step.output_summary}
              </blockquote>
            ) : (
              <p className="text-sm text-muted">
                No summary of what this step produced was recorded for this run.
              </p>
            )}
          </section>

          <section aria-labelledby={ids.amounts} className="space-y-2">
            <SectionLabel id={ids.amounts}>What is at stake</SectionLabel>
            <dl className="space-y-2 font-mono text-sm">
              <KVRow
                k="Charged for this step"
                value={formatUsdc(step.price_usdc)}
              />
              <KVRow
                k="Credited if upheld"
                value={formatUsdc(step.creditable_usdc)}
                valueClassName="text-cyan"
              />
            </dl>
          </section>
        </div>
      )}
    </Dialog>
  );
}
