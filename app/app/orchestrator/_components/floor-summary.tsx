/**
 * The reputation floor this plan was built under, stated once at plan level.
 *
 * Story 3.02 taught the plan card to report what the floor DID — this agent
 * was passed over, that one replaced it. It never named the floor itself, so
 * a buyer read three verdicts against a threshold nobody stated. This line
 * states it, above the steps, before the authorize button, because the floor
 * is the only protection the buyer is being sold on this screen.
 *
 * ON COUNTING — the part a later reader will be tempted to "fix" into a
 * fraction. There is no honest way to print "N of M agents cleared the floor"
 * from this payload:
 *
 *   - `steps.length` is how many agents the planner SELECTED. That is not how
 *     many cleared the floor; the planner picks a handful out of the eligible
 *     set, and the size of that set is never sent.
 *   - `notices.length` is how many the floor acted on. That is not the
 *     complement of anything either — an agent that quietly cleared the floor
 *     and was then simply not chosen produces no notice at all.
 *
 * Divide any of these by any other and the result is a fabrication with a
 * convincing denominator. So this component prints the two counts the
 * response actually contains, never as a ratio, and says in words that the
 * eligible set is not in the response. Do not turn this into "3 of 12 agents
 * cleared the 2.75 floor". We do not know the 12.
 *
 * Two wordings are load-bearing and both are corrections of bugs this
 * codebase has already shipped. Clearing the floor makes an agent ELIGIBLE;
 * the planner still selects per request, so nothing here says an agent is
 * being routed anywhere. And an agent under the floor is passed over while
 * the plan is built — it is never sent work, so no copy here may suggest it
 * failed any.
 *
 * The comparison is each agent's reputation LOWER BOUND against the floor,
 * matching the backend's `passes_floor`, never the headline score. The name
 * of the statistic behind that bound stays in this comment: it tells a buyer
 * nothing they can act on.
 */

import { Badge } from "@/components/ui/badge";
import { scoreOutOfFive } from "@/lib/reputation-math";
import type { DecomposeResponse } from "@/lib/types";

/** One plan card renders at a time on the orchestrator page, so a fixed id
 *  cannot collide. A derived one would be worse: `plan_id` reaches us from
 *  the backend, and an IDREF has to be whitespace-free — not ours to promise. */
const HEADING_ID = "floor-summary-heading";

const body = "text-sm leading-relaxed text-muted";

export function FloorSummary({
  plan,
}: {
  plan: DecomposeResponse;
}): JSX.Element | null {
  const floorBps = plan.floor_bps;

  // No floor in the payload → say nothing at all. A backend predating story
  // 3.02 sends none, and defaulting to 5500 (or any constant) would narrate a
  // threshold nobody applied: the floor is configurable per deployment, so a
  // hardcoded copy is wrong the moment one deployment moves it. A confident
  // wrong number is worse here than silence.
  //
  // `== null` rather than a falsy test on purpose: a floor of 0 is a real,
  // configurable floor and has to render like any other.
  if (floorBps == null) return null;

  const floor = scoreOutOfFive(floorBps);
  const notices = plan.notices ?? [];

  // Both spellings, because the wire format is asymmetric: `kind` has always
  // been sent, `reason_code` is optional so an older backend sends the kind
  // alone. Either one on its own is the starvation backstop having fired.
  const relaxed = notices.some(
    (n) => n.kind === "degraded" || n.reason_code === "floor_relaxed",
  );

  // Distinct agents, not notice rows: two notices can name the same agent,
  // and a buyer reads this number as a head count, not a row count.
  const actedOn = new Set(notices.map((n) => n.agent_id)).size;
  const steps = plan.steps.length;

  return (
    <section
      aria-labelledby={HEADING_ID}
      className={`clip-cyber-sm mb-4 border p-4 ${
        relaxed ? "border-magenta/40 bg-magenta/5" : "border-cyan/40 bg-cyan/5"
      }`}
    >
      <div className="flex flex-wrap items-center gap-2">
        {/* h3: this section sits inside the plan Card, under its h2. */}
        <h3
          id={HEADING_ID}
          className="font-mono text-[10px] uppercase tracking-[0.25em] text-muted"
        >
          <span aria-hidden="true">▸ </span>routing floor
        </h3>
        {/* Glyph AND words, here and in the prose below. The tint is
            decoration and carries none of this on its own. */}
        <Badge tone={relaxed ? "magenta" : "cyan"}>
          <span aria-hidden="true">{relaxed ? "▾" : "✓"}</span>
          {relaxed ? `floor ${floor} · relaxed` : `floor ${floor} · applied`}
        </Badge>
      </div>

      <p className={`mt-2 ${body}`}>
        Every agent considered for this plan was checked against a{" "}
        <b className="text-text">{floor}</b> routing floor before the planner
        chose. The check is each agent&apos;s reputation lower bound against
        that floor, never its headline score.
      </p>

      <p className="mt-2 break-words font-mono text-[11px] leading-relaxed text-muted">
        {steps} step{steps === 1 ? "" : "s"} planned · the floor acted on{" "}
        {actedOn === 0
          ? "no agents"
          : `${actedOn} agent${actedOn === 1 ? "" : "s"}`}
      </p>

      {/* Two paragraphs used to sit here: one explaining that the eligible set
          is not in the response, and one explaining that the floor acts before
          any work is assigned. Both were true and both were cut.

          The first was meta-commentary about our own API — a buyer does not
          need to know which denominators the payload omits, only that no
          fraction is being claimed, which printing two separate counts already
          conveys. The reasoning it carried belongs to whoever edits this file
          and is in the comment above `actedOn`, not on the card.

          The second is said better one section down: the exclusions panel
          opens with "It decides who is eligible to be picked, before any step
          is dispatched", right beside the agents it applies to.

          What is left is the frame a buyer needs before reading the steps: the
          threshold, the rule it uses, the two counts, and the warning when the
          floor was relaxed. Ninety words of preamble above a three-step plan
          made the protection read as an obstacle. */}

      {relaxed && (
        <p className={`mt-2 ${body} text-magenta`}>
          <span aria-hidden="true">⚠ </span>
          This plan was built under a relaxed floor. Not enough agents cleared{" "}
          {floor} to build it, so the starvation backstop re-admitted at least
          one below that line rather than return no plan — the steps affected
          carry a below-floor badge. Authorizing this plan buys less protection
          than a {floor} floor promises, and that is true of the plan as a
          whole, not only of the steps marked.
        </p>
      )}
    </section>
  );
}
