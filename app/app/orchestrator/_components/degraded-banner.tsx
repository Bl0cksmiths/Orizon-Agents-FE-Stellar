/**
 * The one case where the buyer's protection is materially weaker than the card
 * around it advertises.
 *
 * `plan.reputation_degraded` (story 3.03) means at least one reputation read
 * behind this plan failed and the Bayesian prior was served in its place. The
 * reputation service fails OPEN by design: when the ledger cannot be read every
 * agent reverts to the prior, and under the shipped config the prior's lower
 * bound clears the routing floor (5677 against a 5500 floor). So the floor does
 * not stop running — it stops deciding anything, because every candidate is
 * measured against the same estimate instead of against its own record. Low-
 * reputation agents become routable for the duration.
 *
 * That is the whole reason this renders above the Authorize block rather than
 * in the notices list: the buyer is about to commit funds on the strength of a
 * trust signal we did not actually read.
 *
 * WHY THE COPY NEVER SAYS "DEGRADED". On this exact card that word already
 * carries a different meaning, twice: `PlanStep.degraded` and a floor notice
 * with `kind === "degraded"` both mean "re-admitted below the floor by the
 * starvation backstop" — a deliberate, evidence-based decision, the opposite of
 * this one. Three meanings of one word within a few hundred pixels is how a
 * buyer stops trusting all three. The component is named for the field it reads;
 * the copy had to find its own words. There is a test pinning that.
 *
 * Three further things the copy deliberately does NOT do:
 *   - It does not impugn the agents. They may be excellent. The failure is ours
 *     and the honest claim is "we could not check", not "these are risky".
 *   - It does not promise recovery or tell the buyer to wait. Nobody can say
 *     when an RPC outage ends, and a banner that implies "try again in a
 *     minute" is a guess dressed as guidance.
 *   - It does not tell the buyer to stop. It states what is true and hands the
 *     decision back; talking someone out of a payment we cannot evaluate is not
 *     ours to do.
 *
 * If the prior is ever reconfigured to sit BELOW the floor, the second
 * paragraph's "can be routed" clause stops being true — the floor would filter
 * everything out instead — and the copy has to be revisited.
 */

import { Badge } from "@/components/ui/badge";
import type { DecomposeResponse } from "@/lib/types";

/**
 * The banner's id, for the Authorize control's `aria-describedby`. A polite
 * status is announced once, when it renders, and a keyboard buyer tabbing from
 * the exclusions panel straight to Authorize never passes through it — so the
 * button names it as its description, and the warning is read at the moment
 * of the decision it is about.
 *
 * One plan card renders at a time, so a fixed id cannot collide. It avoids the
 * word "degraded" for the same reason the copy does.
 */
export const UNVERIFIED_BANNER_ID = "plan-reputation-unverified";

export function DegradedBanner({
  plan,
}: {
  plan: DecomposeResponse;
}): JSX.Element | null {
  // Strict `!== true` rather than a falsy check: the field is optional, so a
  // backend predating story 3.03 sends nothing at all, and "we have no idea
  // whether the reads succeeded" must never render as "they failed".
  if (plan.reputation_degraded !== true) return null;

  return (
    // `role="status"` (polite), NOT `role="alert"` (assertive), and the choice
    // is deliberate. An assertive alert cuts off whatever a screen reader is
    // mid-sentence on, which is the right trade only for something that arrives
    // unbidden after the user's attention has moved on — a signature that just
    // failed, say. This renders as part of the plan itself and sits in document
    // order above the Authorize control, so a screen-reader user cannot reach
    // the button without passing through it. Interrupting here would truncate
    // the reading of the very plan the warning is about, and would do it on
    // every plan render. Polite says the same words without that cost.
    //
    // Tone mirrors the cyan Authorize panel it sits directly above — same
    // `clip-cyber-sm` frame, same padding, same `mt-6` rhythm — so the two read
    // as one decision point in two tones rather than as unrelated furniture.
    <div
      id={UNVERIFIED_BANNER_ID}
      role="status"
      className="mt-6 clip-cyber-sm border border-magenta/40 bg-magenta/5 p-4 text-magenta"
    >
      {/* Glyph and word together, never the tint alone: the magenta is
          decoration, and a warning that is only magenta says nothing to a
          reader who cannot see the difference. `flex-wrap` + `min-w-0` because
          the heading has to fold rather than scroll at 390px. */}
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="magenta">
          <span aria-hidden="true">⚠</span>unverified
        </Badge>
        {/* h3: the card's own "Execution plan" is the h2 above it. */}
        <h3 className="min-w-0 text-sm font-semibold tracking-tight">
          Reputation could not be read
        </h3>
      </div>

      <div className="mt-2 space-y-2 text-sm leading-relaxed">
        <p>
          At least one reputation read behind this plan failed. Where a read
          failed, the score shown is the estimate every agent starts with before
          it has been rated — not a reading of that agent&apos;s on-chain
          history.
        </p>
        <p>
          The network floor still ran, but on this plan it compared against
          those estimates rather than against on-chain records. It did not
          filter on evidence here, and an agent whose record would normally keep
          it out of your plan can be routed while the read is failing.
        </p>
        <p>
          That is not a finding about the agents in this plan. The failure is on
          our side of the read; they may be exactly as good as the scores
          suggest, and we could not check.
        </p>
        <p>
          You are about to authorize payment against estimated scores. Whether
          that is acceptable is yours to decide.
        </p>
      </div>
    </div>
  );
}
