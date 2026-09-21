import type { ComponentProps } from "react";

import { Badge } from "@/components/ui/badge";
import type { DisputeStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

type Tone = NonNullable<ComponentProps<typeof Badge>["tone"]>;

type StatusLook = {
  /** What the buyer reads. Plain language, never the backend's state name. */
  label: string;
  tone: Tone;
  /**
   * Classes layered over the tone. Only `crediting` needs one: five statuses
   * need five colours and Badge has four that are not grey, so the refund in
   * flight takes amber — the colour a reader already reads as "under way".
   */
  className?: string;
  /**
   * A still-moving state gets a pulsing dot, a settled outcome gets a glyph.
   * Either way the shape repeats what the label says, so the status never
   * rests on colour alone (WCAG 1.4.1).
   */
  mark:
    { kind: "live"; dotClassName: string } | { kind: "glyph"; glyph: string };
};

/**
 * Every colour below clears WCAG AA (4.5:1) for this 10px text against the
 * badge's own tint over the card: cyan 13.0, amber-300 11.7, emerald-300
 * 11.7, violet-readable 6.3, magenta 4.8. The console has one theme —
 * globals.css pins the dark palette on html and body whatever the OS
 * prefers — so that one background is the only one these have to hold
 * against.
 */
const LOOKS: Record<DisputeStatus, StatusLook> = {
  open: {
    label: "Under review",
    tone: "violet",
    mark: { kind: "live", dotClassName: "bg-violet shadow-[0_0_8px_#B026FF]" },
  },
  upheld: {
    label: "Upheld",
    tone: "cyan",
    mark: { kind: "glyph", glyph: "✓" },
  },
  // Not "crediting": that is the store's name for a payout it is holding so a
  // retry can never pay twice. What the buyer needs to know is that their
  // money is on its way.
  crediting: {
    label: "Refund in progress",
    tone: "muted",
    className: "bg-amber-400/10 text-amber-300 border-amber-400/40",
    mark: {
      kind: "live",
      dotClassName: "bg-amber-300 shadow-[0_0_8px_#FCD34D]",
    },
  },
  credited: {
    label: "Refunded",
    tone: "success",
    mark: { kind: "glyph", glyph: "✓" },
  },
  rejected: {
    label: "Rejected",
    tone: "magenta",
    mark: { kind: "glyph", glyph: "✕" },
  },
};

/** The buyer-facing words for a dispute's status. */
export function disputeStatusLabel(status: DisputeStatus): string {
  return LOOKS[status].label;
}

/**
 * Where one dispute stands, in the buyer's words.
 *
 * The dot is drawn here rather than through Badge's `dot` prop because that
 * prop's colours are keyed to Badge's own tones, and the amber refund has no
 * tone of its own. It pulses with the same `animate-pulseGlow` Badge uses,
 * which the global reduced-motion rule already stills.
 */
export function DisputeStatusBadge({
  status,
  className,
}: {
  status: DisputeStatus;
  className?: string;
}) {
  const look = LOOKS[status];
  return (
    <Badge tone={look.tone} className={cn(look.className, className)}>
      {look.mark.kind === "live" ? (
        <span
          aria-hidden="true"
          className={cn(
            "h-1.5 w-1.5 shrink-0 rounded-full animate-pulseGlow",
            look.mark.dotClassName,
          )}
        />
      ) : (
        <span aria-hidden="true">{look.mark.glyph}</span>
      )}
      {/* Read as "Dispute status: Refunded" — the bare label, heard out of
          its row, does not say what it is the status of. */}
      <span className="sr-only">Dispute status: </span>
      <span>{look.label}</span>
    </Badge>
  );
}
