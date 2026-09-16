import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

/**
 * A labelled figure. Hand-rolled identically in three places before this.
 *
 * `unit` is a separate prop rather than part of `value` for a reason worth
 * keeping: Card's clip-path cuts overflow and the page sets `overflow-x:
 * hidden`, so a figure too wide for its tile is silently LOST rather than
 * scrollable. Splitting the unit off keeps the number the thing that shrinks.
 */
export function StatTile({
  label,
  value,
  unit,
  hint,
  className,
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  hint?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <div className="mb-3 font-mono text-[10px] uppercase tracking-[0.25em] text-muted">
        {label}
      </div>
      <div className="font-mono text-3xl neon-text truncate">
        {value}
        {unit ? <span className="ml-1.5 text-base text-muted">{unit}</span> : null}
      </div>
      {hint ? <div className="mt-2 text-xs text-muted">{hint}</div> : null}
    </div>
  );
}
