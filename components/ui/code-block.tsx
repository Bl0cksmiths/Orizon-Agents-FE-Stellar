import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

/**
 * A terminal-styled sample. `badge` labels what it is: "example" by default,
 * because a sample run is illustrative — it said "◉ live" once, beside a
 * made-up run, which read as a claim about the network.
 */
export function CodeBlock({
  title = "orizon.sh",
  badge = "example",
  children,
  className,
}: {
  title?: string;
  badge?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "clip-cyber border border-border bg-[#070010] font-mono text-xs overflow-hidden",
        className,
      )}
    >
      <div className="flex items-center justify-between border-b border-border px-4 py-2 bg-surface/70">
        <div className="flex gap-1.5">
          <span className="h-2 w-2 rounded-full bg-magenta/70" />
          <span className="h-2 w-2 rounded-full bg-violet/70" />
          <span className="h-2 w-2 rounded-full bg-cyan/70" />
        </div>
        <span className="text-[10px] uppercase tracking-[0.25em] text-muted">
          {title}
        </span>
        <span className="text-[10px] font-mono text-muted">{badge}</span>
      </div>
      <pre className="px-4 py-4 leading-6 text-text/90 whitespace-pre-wrap">
        {children}
      </pre>
    </div>
  );
}
