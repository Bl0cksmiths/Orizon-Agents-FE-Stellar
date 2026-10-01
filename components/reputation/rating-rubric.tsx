import { Card } from "@/components/ui/card";
import { DEFAULT_REP_PARAMS } from "@/lib/reputation-math";
import { cn } from "@/lib/utils";

/**
 * The most evidence weight one rating can carry. The backend's
 * `reputation_svc.max_rating_weight_usdc()` is min(REPUTATION_MAX_RATING_WEIGHT_USDC
 * 100, REPUTATION_MAX_RATING_TO_PRIOR_RATIO 1.0 × REPUTATION_PRIOR_WEIGHT_USDC
 * 12) = 12: at a ratio of 1 a rating weighs at most what the prior does. So it
 * is read off the prior's weight rather than written down a second time, and
 * given no unit: weight is in stroops of the escrow's asset, native XLM on
 * testnet, whatever the backend's `_usdc` field names say (friction F-022).
 */
const MAX_RATING_WEIGHT = DEFAULT_REP_PARAMS.prior_weight_usdc;

type RubricRow = {
  signal: string;
  rating: string;
  why: string;
  kind: "base" | "bonus" | "penalty";
};

const ROWS: RubricRow[] = [
  {
    signal: "step produced no output (timeout / crash)",
    rating: "20/100",
    why: "settled money for no delivered work",
    kind: "base",
  },
  {
    signal: "baked kit artifact (source: baked)",
    rating: "95/100",
    why: "deterministic, pre-validated by design",
    kind: "base",
  },
  {
    signal: "free-form base score",
    rating: "70/100",
    why: "worker returned output",
    kind: "base",
  },
  {
    signal: "+ artifact shipped",
    rating: "+15",
    why: "delivered a concrete artifact",
    kind: "bonus",
  },
  {
    signal: "+ clean critic pass (zero violations)",
    rating: "+10",
    why: "validation-gated bonus",
    kind: "bonus",
  },
  {
    signal: "− per critic violation",
    rating: "−3 each (first 10 counted)",
    why: "defects drag the score",
    kind: "penalty",
  },
];

const ratingTone: Record<RubricRow["kind"], string> = {
  base: "text-text",
  bonus: "text-cyan",
  penalty: "text-magenta",
};

/**
 * Synthetic rating rubric — the exact signal → score table the settler uses
 * to grade a settled step, plus the evidence-weight footnote. Static mirror
 * of the backend scoring rules.
 */
export function RatingRubric() {
  return (
    <Card>
      <h2 className="text-lg font-semibold tracking-tight">
        Synthetic rating rubric
      </h2>
      <p className="mt-1 font-mono text-[10px] uppercase tracking-widest text-muted">
        how the settler scores a settled step
      </p>
      {/* Three short columns stack on a phone: in a 280px card the "why"
          column was crushed to a word a line, and scrolling sideways to read
          a sentence is worse. Roles are explicit because changing a table
          part's `display` drops its semantics in some browsers. */}
      <div className="mt-5">
        <table role="table" className="block w-full text-sm sm:table">
          <thead
            role="rowgroup"
            className="sr-only sm:not-sr-only sm:table-header-group"
          >
            <tr
              role="row"
              className="border-b border-border font-mono text-[10px] uppercase tracking-[0.25em] text-muted"
            >
              <th
                role="columnheader"
                scope="col"
                className="pb-3 pr-4 text-left"
              >
                signal
              </th>
              <th
                role="columnheader"
                scope="col"
                className="pb-3 pr-4 text-left"
              >
                rating
              </th>
              <th role="columnheader" scope="col" className="pb-3 text-left">
                why
              </th>
            </tr>
          </thead>
          <tbody role="rowgroup" className="block sm:table-row-group">
            {ROWS.map((r) => (
              <tr
                role="row"
                key={r.signal}
                className="block border-b border-border/50 py-3 last:border-0 sm:table-row sm:py-0"
              >
                <th
                  role="rowheader"
                  scope="row"
                  className="block pr-4 text-left sm:table-cell sm:py-3 font-normal text-text"
                >
                  {r.signal}
                </th>
                <td
                  role="cell"
                  className={cn(
                    "block py-1 pr-4 font-mono whitespace-nowrap sm:table-cell sm:py-3",
                    ratingTone[r.kind],
                  )}
                >
                  {r.rating}
                </td>
                <td
                  role="cell"
                  className="block text-muted sm:table-cell sm:py-3"
                >
                  {r.why}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-4 font-mono text-xs text-muted">
        weight = min(step price, {MAX_RATING_WEIGHT}) — the cap is the
        prior&apos;s own weight, so one rating counts for at most as much as the
        prior. price and weight are in the escrow&apos;s asset. a rating on a
        0.05 step carries proportionally less evidence than one on a 5 step.
        ratings clamp to 0–100.
      </p>
    </Card>
  );
}
