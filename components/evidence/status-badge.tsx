/**
 * A status, as an icon beside a word: Present, Partial, Missing, Met, Not
 * met or Descoped. The word carries the meaning, so the badge reads the same
 * in greyscale, in print and to a screen reader; the colour only repeats it.
 *
 * Descoped is neither a pass nor a fail: its own icon, its own colour (the
 * readable violet, never the met green) and a dashed border, which survives
 * print, where every badge is black on white.
 */

import { ITEM_STATUS, METRIC_STATUS } from "@/lib/evidence/display";
import type { ItemStatus, MetricStatus } from "@/lib/evidence/types";
import { cn } from "@/lib/utils";

type Status = ItemStatus | MetricStatus;

const TONE: Record<Status, string> = {
  present: "border-emerald-400/50 bg-emerald-500/10 text-emerald-300",
  met: "border-emerald-400/50 bg-emerald-500/10 text-emerald-300",
  partial: "border-cyan/50 bg-cyan/10 text-cyan",
  missing: "border-magenta/60 bg-magenta/10 text-magenta",
  not_met: "border-magenta/60 bg-magenta/10 text-magenta",
  descoped:
    "border-dashed border-violet-readable/70 bg-violet/10 text-violet-readable",
};

export function StatusBadge({
  status,
  prefix,
  className,
}: {
  status: Status;
  /** Read before the word by screen readers only, e.g. "Status:". */
  prefix?: string;
  className?: string;
}) {
  const { label, icon } =
    status === "met" || status === "not_met" || status === "descoped"
      ? METRIC_STATUS[status]
      : ITEM_STATUS[status];
  return (
    <span
      data-status={status}
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap border px-2 py-0.5 font-mono text-[11px] font-semibold uppercase tracking-widest",
        "print:border-black print:bg-transparent print:text-black",
        TONE[status],
        className,
      )}
    >
      {prefix && <span className="sr-only">{prefix} </span>}
      <span aria-hidden="true">{icon}</span>
      {label}
    </span>
  );
}
