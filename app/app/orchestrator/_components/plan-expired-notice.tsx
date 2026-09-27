/**
 * What the card says when the backend refused to run a plan it no longer
 * holds (410 `plan_expired`: stored plans expire after 15 minutes).
 *
 * The trap this exists for: on the on-chain path the buyer has ALREADY signed
 * and broadcast the authorization by the time the plan is sent to run. So the
 * refusal lands straight after a confirmed transaction, and the generic
 * failure card would read as a failed payment — the one reading that is
 * false. Nothing was charged: no task was created, and an authorization is a
 * cap on what may be charged, not a charge. The notice says exactly that, and
 * hands the buyer the one useful next step: a fresh plan from the same intent.
 */

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

/** Which run the backend refused: a simulated pass, or the on-chain path
 *  after the buyer signed. Only the second has an authorization to explain. */
export type ExpiredRun = "simulate" | "authorize";

export function PlanExpiredNotice({
  run,
  onReplan,
  busy,
}: {
  run: ExpiredRun;
  /** Decomposes this plan's intent again, as the page's own submit does. */
  onReplan?: () => void;
  busy?: boolean;
}): JSX.Element {
  return (
    // `role="alert"`: this arrives unbidden after the buyer pressed a pay
    // control and their attention has moved on to the transaction — the case
    // an assertive announcement is for. Violet, not magenta: nothing about
    // the buyer's protection or money is wrong, the plan simply aged out.
    <div
      role="alert"
      className="mt-4 clip-cyber-sm border border-violet/40 bg-violet/5 p-4"
    >
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="violet">
          <span aria-hidden="true">◷</span>plan expired
        </Badge>
        {/* h3: the card's own "Execution plan" is the h2 above it. */}
        <h3 className="min-w-0 text-sm font-semibold tracking-tight">
          This plan was too old to run
        </h3>
      </div>
      <div className="mt-2 space-y-2 text-sm leading-relaxed text-muted">
        <p>
          Plans are kept for 15 minutes, and this one had expired by the time it
          was sent to run. <b className="text-text">Nothing was charged</b> and
          no task was started.
        </p>
        {run === "authorize" && (
          <p>
            The authorization you just signed only caps what may be charged; it
            was not drawn on for this plan, and it lapses on its own within 10
            minutes.
          </p>
        )}
        <p>Build a fresh plan from the same request to continue.</p>
      </div>
      {onReplan && (
        <div className="mt-3">
          <Button
            type="button"
            variant="cyan"
            size="sm"
            onClick={onReplan}
            disabled={busy}
          >
            Build a fresh plan ▸
          </Button>
        </div>
      )}
    </div>
  );
}
