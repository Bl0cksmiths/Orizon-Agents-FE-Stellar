/**
 * A Note, Warning or Limitation in the guide: an aside with role="note", an
 * icon and a visible label. The colour follows the kind, but the label says
 * it in words, so nothing depends on colour alone.
 */

import type { ReactNode } from "react";
import { CALLOUT_LABEL } from "@/lib/guide/display";
import type { CalloutKind } from "@/lib/guide/parse";
import { cn } from "@/lib/utils";

const TONE: Record<CalloutKind, { frame: string; label: string }> = {
  note: { frame: "border-cyan/60 bg-cyan/5", label: "text-cyan" },
  warning: { frame: "border-magenta/70 bg-magenta/10", label: "text-magenta" },
  limitation: {
    frame: "border-violet/70 bg-violet/10",
    label: "text-violet-readable",
  },
};

function Icon({ kind }: { kind: CalloutKind }) {
  const common = {
    viewBox: "0 0 20 20",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.6,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className: "h-4 w-4 shrink-0",
    "aria-hidden": true,
  };
  if (kind === "warning") {
    return (
      <svg {...common}>
        <path d="M10 3 18 17H2L10 3Z" />
        <path d="M10 8v4M10 14.5v.01" />
      </svg>
    );
  }
  if (kind === "limitation") {
    return (
      <svg {...common}>
        <circle cx="10" cy="10" r="7.5" />
        <path d="M4.7 4.7l10.6 10.6" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <circle cx="10" cy="10" r="7.5" />
      <path d="M10 9v5M10 6.5v.01" />
    </svg>
  );
}

export function Callout({
  kind,
  children,
}: {
  kind: CalloutKind;
  children: ReactNode;
}) {
  const tone = TONE[kind];
  return (
    <aside
      role="note"
      data-callout={kind}
      className={cn("my-6 border-l-2 px-4 py-3", tone.frame)}
    >
      <p
        className={cn(
          "mb-1 flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-widest",
          tone.label,
        )}
      >
        <Icon kind={kind} />
        {CALLOUT_LABEL[kind]}
      </p>
      <div className="text-sm leading-relaxed text-text [&>p]:my-0 [&>p+p]:mt-3">
        {children}
      </div>
    </aside>
  );
}
