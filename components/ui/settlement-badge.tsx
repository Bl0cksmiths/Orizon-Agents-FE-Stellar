/**
 * The one badge for a paid run's settlement state, wherever it is shown — the
 * receipt and the trace say the same thing about the same money in the same
 * words, or one of them is wrong.
 */

import { Badge } from "@/components/ui/badge";
import type { SettlementState } from "@/lib/types";

/** Keyed by the state's own literal type, so a new state cannot reach the
 * buyer without someone writing down what it looks like. */
const SETTLEMENT_BADGE: Record<
  SettlementState,
  {
    tone: "success" | "violet" | "magenta" | "muted";
    glyph: string;
    label: string;
  }
> = {
  settled: { tone: "success", glyph: "✓", label: "settled" },
  released: { tone: "muted", glyph: "↩", label: "custody released" },
  skipped: { tone: "muted", glyph: "–", label: "nothing charged" },
  unconfirmed: { tone: "violet", glyph: "◷", label: "settlement unconfirmed" },
  failed: { tone: "magenta", glyph: "✕", label: "settlement failed" },
};

export function SettlementBadge({ state }: { state: SettlementState }) {
  const { tone, glyph, label } = SETTLEMENT_BADGE[state];
  return (
    <Badge tone={tone}>
      <span aria-hidden="true">{glyph}</span> {label}
    </Badge>
  );
}
