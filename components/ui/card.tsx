import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Card({
  children,
  className,
  glow = false,
  ...props
}: HTMLAttributes<HTMLDivElement> & { glow?: boolean; children: ReactNode }) {
  return (
    <div
      className={cn(
        "glow-card clip-cyber relative border border-border bg-surface/60 backdrop-blur-sm p-6",
        glow && "shadow-neon-violet",
        className,
      )}
      {...props}
    >
      {/* data-decor: the dispute scan (e2e/dispute-axe.ts) flattens it,
          since axe gives up on contrast over any gradient. */}
      <div
        aria-hidden
        data-decor
        className="pointer-events-none absolute inset-0 bg-gradient-to-br from-violet/5 via-transparent to-cyan/5"
      />
      <div className="relative">{children}</div>
    </div>
  );
}
