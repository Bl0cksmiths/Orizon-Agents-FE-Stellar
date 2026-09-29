/**
 * What the card says when the backend refused to run a plan it no longer
 * holds (410 `plan_expired`: stored plans expire after 15 minutes).
 *
 * The trap this exists for: on the on-chain path the buyer has ALREADY signed
 * and broadcast the authorization by the time the plan is sent to run. So the
 * refusal lands straight after a confirmed transaction, and the generic
 * failure card would read as a failed payment — which it is not: no task was
 * created and no agent was paid. But under escrow v2 it is not "nothing
 * charged" either. The authorization took custody of the cap when it
 * confirmed, and it stays in escrow until the buyer reclaims it, so this
 * notice no longer says the authorization lapses on its own; the card shows
 * `EscrowHeldNotice` beside it with what a reclaim needs. Under v1, which is
 * what the deployment runs until a v2 escrow is pinned and reported, the
 * authorization was only an allowance and does lapse, so it says that
 * instead (`EscrowGeneration`). It still hands the buyer the one useful next
 * step for the plan: a fresh one from the same intent.
 */

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { EscrowGeneration } from "@/lib/escrow-generation";

/** Which run the backend refused: a simulated pass, or the on-chain path
 *  after the buyer signed. Only the second has an authorization to explain. */
export type ExpiredRun = "simulate" | "authorize";

/**
 * What became of the authorization the buyer just signed, by the escrow it
 * went to. v2 took custody, so the funds are held or were returned; v1 only
 * recorded an allowance, so nothing moved; unknown says neither.
 */
function authorizationSentence(
  generation: EscrowGeneration,
  fundsReturned: boolean,
): string | null {
  switch (generation) {
    case "v2":
      return fundsReturned
        ? "The platform returned the authorization you just signed from escrow to your wallet, as shown below."
        : "The authorization you just signed is held in escrow until you reclaim it, as set out below.";
    case "v1":
      return "The authorization you just signed only recorded a spending allowance on the escrow: no funds moved, and it lapses on its own when it expires.";
    case "unknown":
      return null;
  }
}

export function PlanExpiredNotice({
  run,
  generation,
  onReplan,
  busy,
  fundsReturned = false,
}: {
  run: ExpiredRun;
  /** The escrow the authorization went to, which decides what became of it. */
  generation: EscrowGeneration;
  /** The platform returned the authorization's custody in full. */
  fundsReturned?: boolean;
  /** Decomposes this plan's intent again, as the page's own submit does. */
  onReplan?: () => void;
  busy?: boolean;
}): JSX.Element {
  const signed = authorizationSentence(generation, fundsReturned);
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
        {run === "authorize" ? (
          <p>
            Plans are kept for 15 minutes, and this one had expired by the time
            it was sent to run. <b className="text-text">No task was started</b>{" "}
            and no agent was paid.
            {signed !== null && ` ${signed}`}
          </p>
        ) : (
          <p>
            Plans are kept for 15 minutes, and this one had expired by the time
            it was sent to run. <b className="text-text">Nothing was charged</b>{" "}
            and no task was started.
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
