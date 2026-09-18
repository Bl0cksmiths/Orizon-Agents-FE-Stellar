/**
 * Says so when the plan on the card was not written by the planner.
 *
 * `plan.planner_fallback` means the LLM planner failed or answered with
 * nothing usable, and the backend served a minimal, deterministic plan in its
 * place — drawn only from agents that cleared the same routing checks every
 * planned step has to. Without this notice the two are indistinguishable on
 * the card: a one-step fallback looks exactly like a planner that decided one
 * step was enough.
 *
 * It is informational, and the copy is kept calm on purpose. Nothing about the
 * fallback is less safe — the floor and the routing checks ran as usual — so
 * this is not a warning and must not read as one. What the buyer is owed is
 * the plain fact that the steps were not decomposed from their intent, and a
 * way to ask the planner again before they pay for the minimal version.
 *
 * Three things the copy deliberately does NOT do:
 *   - It does not explain the outage. The backend never sends the provider's
 *     error text, and a guessed cause ("rate limited", "the model is down") is
 *     a claim nobody here can check.
 *   - It does not promise the retry will work. The planner may be down for a
 *     while; asking again costs nothing, but "try again in a minute" is a guess.
 *   - It does not tell the buyer the fallback is worse and steer them off it.
 *     Minimal is not broken. It states what the plan is and hands the choice
 *     back.
 */

import { Badge } from "@/components/ui/badge";
import type { DecomposeResponse } from "@/lib/types";

/**
 * The notice's id, for the Authorize control's `aria-describedby`. Same
 * reasoning as the unverified-reputation banner: Tab jumps from the exclusions
 * panel straight to Authorize, past a polite status announced once when the
 * plan rendered, so the button names it and the fact is read at the moment of
 * paying. One plan card renders at a time, so a fixed id cannot collide.
 */
export const PLANNER_FALLBACK_NOTICE_ID = "plan-planner-fallback";

/** Whether the notice renders for this plan — exported so Authorize names the
 *  id only while it is on the page; a reference to an absent id describes
 *  nothing and is flagged by accessibility audits.
 *
 *  Strict `=== true`: the field is optional, and a backend predating it sends
 *  nothing at all. Not knowing how a plan was built must never render as "the
 *  planner did not build it". */
export const isPlannerFallback = (plan: DecomposeResponse): boolean =>
  plan.planner_fallback === true;

export function PlannerFallbackNotice({
  plan,
}: {
  plan: DecomposeResponse;
}): JSX.Element | null {
  if (!isPlannerFallback(plan)) return null;

  return (
    // Violet, the card's own tone, and deliberately not the magenta of the
    // reputation banner below: on this card magenta means "your protection is
    // weaker than it looks", and nothing here is. Same `clip-cyber-sm` frame,
    // padding and `mt-6` rhythm as that banner and the Authorize panel, so the
    // three read as one decision point.
    <div className="mt-6 clip-cyber-sm border border-violet/40 bg-violet/5 p-4">
      {/* `role="status"` (polite), never `role="alert"`: this is a fact about
          how the plan was built, arriving with the plan the buyer asked for,
          and interrupting the reading of that plan to say it would be the
          wrong trade. The id is on this region rather than the frame so the
          Authorize description is these words alone. */}
      <div id={PLANNER_FALLBACK_NOTICE_ID} role="status">
        {/* Glyph and word together: the violet is decoration, and the badge
            has to say what it marks to a reader who cannot see the tint.
            `flex-wrap` + `min-w-0` so the heading folds at 390px. */}
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="violet">
            <span aria-hidden="true">↳</span>fallback plan
          </Badge>
          {/* h3: the card's own "Execution plan" is the h2 above it. */}
          <h3 className="min-w-0 text-sm font-semibold tracking-tight">
            Built without the planner
          </h3>
        </div>

        <div className="mt-2 space-y-2 text-sm leading-relaxed text-muted">
          <p>
            The planner was unavailable for this request, or returned nothing
            usable, so these steps were not decomposed from your intent. This is
            a minimal fallback plan, built only from agents that passed the
            routing checks.
          </p>
          <p>
            You can authorize it as it stands, or run the same intent through
            the planner again.
          </p>
        </div>
      </div>
    </div>
  );
}
