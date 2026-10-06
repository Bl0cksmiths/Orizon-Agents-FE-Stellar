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
 *   - The floor-action notices say how many agents the floor acted on. That
 *     is not the complement of anything either — an agent that quietly
 *     cleared the floor and was then simply not chosen produces no notice at
 *     all. Nor is `notices.length` that count: the same array carries
 *     unbound agents, which were never candidates and are reported apart.
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
import { focusRing } from "@/lib/ui";
import type { DecomposeResponse } from "@/lib/types";
import {
  hasUnverifiedReputation,
  UNVERIFIED_BANNER_ID,
} from "./degraded-banner";
import {
  hiddenNotices,
  hiddenNoticesText,
  isAwaitingFreshRead,
  isFloorAction,
  isUnbound,
  isUnreachable,
  isExternalNotRouted,
  isMissingInput,
  isProviderUnavailable,
  isSimulatedWorker,
  namesNoAgent,
  knownKind,
} from "./floor-notices";

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
  // and a buyer reads this number as a head count, not a row count. Floor
  // actions only — the backend lists unbound agents in the same array, and
  // five of them would otherwise read as "the floor acted on 5 agents".
  const actedOn = new Set(notices.filter(isFloorAction).map((n) => n.agent_id))
    .size;
  // Said separately and without the floor in the sentence: these agents were
  // never candidates, and have not failed or been judged on anything.
  const unbound = new Set(notices.filter(isUnbound).map((n) => n.agent_id))
    .size;
  // Likewise apart: their endpoint failed its latest health check. Not a
  // reputation verdict, and not the floor acting.
  const unreachable = new Set(
    notices.filter(isUnreachable).map((n) => n.agent_id),
  ).size;
  // Left out by routing policy: operator agents while plans are in-platform
  // only, and built-in agents whose workers would only simulate. Neither is
  // the floor acting, nor a word about the agent.
  const externalNotices = notices.filter(isExternalNotRouted);
  const external = new Set(externalNotices.map((n) => n.agent_id)).size;
  // An aggregate notice stands for every operator agent and names none, so
  // there is no head count to give — only the fact.
  const externalUncounted = externalNotices.some(namesNoAgent);
  // Proposed steps dropped for want of their input, and agents whose model
  // provider is down: neither the floor nor a word about the agent.
  const noInput = notices.filter(isMissingInput).length;
  const noProvider = new Set(
    notices.filter(isProviderUnavailable).map((n) => n.agent_id),
  ).size;
  const simulated = new Set(
    notices.filter(isSimulatedWorker).map((n) => n.agent_id),
  ).size;
  // Agents the backend reported under a kind this build has no wording for.
  // Counted and pointed at rather than left out: the exclusions panel lists
  // them neutrally with the backend's own reason, and the counts here must
  // not read as though they were not there.
  const undescribed = new Set(
    notices
      .filter((n) => isFloorAction(n) && knownKind(n) === null)
      .map((n) => n.agent_id),
  ).size;
  // Held off for a fresh reputation read, not judged under the floor: said
  // apart so the count above is never read as that many agents below it.
  const awaiting = new Set(
    notices.filter(isAwaitingFreshRead).map((n) => n.agent_id),
  ).size;
  const hidden = hiddenNotices(plan);
  const steps = plan.steps.length;

  // A reputation read failed, so the floor measured estimates rather than
  // records. The floor still RAN, which is why a plain "applied" was so
  // convincing: under the shipped config the prior's lower bound clears the
  // floor, so a cold start reads as every agent passing a check that, for
  // them, compared nothing real. This section is the first claim on the card,
  // and it used to make that claim in the success colour with a check mark
  // while the only contrary word sat a phone-screen and more further down.
  const unverified = hasUnverifiedReputation(plan);
  const warn = relaxed || unverified;
  const state = [unverified && "unverified", relaxed && "relaxed"]
    .filter(Boolean)
    .join(" · ");

  return (
    <section
      aria-labelledby={HEADING_ID}
      className={`clip-cyber-sm mb-4 border p-4 ${
        warn ? "border-magenta/40 bg-magenta/5" : "border-cyan/40 bg-cyan/5"
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
        <Badge tone={warn ? "magenta" : "cyan"}>
          <span aria-hidden="true">
            {unverified ? "⚠" : relaxed ? "▾" : "✓"}
          </span>
          {`floor ${floor} · ${state || "applied"}`}
        </Badge>
      </div>

      {unverified ? (
        // The warning itself, not a pointer to it: a buyer who reads only
        // this far has already been told the one thing that changes what the
        // floor is worth. "Could not be read" rather than "failed" — this
        // card says nothing about failure that could be heard as the agents'.
        <p className={`mt-2 ${body}`}>
          <b className="text-magenta">
            Compared against estimates, not on-chain records.
          </b>{" "}
          Every agent considered for this plan was checked against a{" "}
          <b className="text-text">{floor}</b> routing floor, but at least one
          reputation read could not be completed. Where it could not, the check
          used the estimate every unrated agent starts with, so on those agents
          the floor did not filter on evidence.{" "}
          <a
            href={`#${UNVERIFIED_BANNER_ID}`}
            className={`text-magenta underline underline-offset-2 ${focusRing}`}
          >
            What this means before you authorize
            <span aria-hidden="true"> ↓</span>
          </a>
        </p>
      ) : (
        <p className={`mt-2 ${body}`}>
          Every agent considered for this plan was checked against a{" "}
          <b className="text-text">{floor}</b> routing floor before the planner
          chose. The check is each agent&apos;s reputation lower bound against
          that floor, never its headline score.
        </p>
      )}

      <p className="mt-2 break-words font-mono text-[11px] leading-relaxed text-muted">
        {steps} step{steps === 1 ? "" : "s"} planned · the floor acted on{" "}
        {actedOn === 0
          ? "no agents"
          : `${actedOn} agent${actedOn === 1 ? "" : "s"}`}
        {awaiting > 0 &&
          (awaiting === 1
            ? " · 1 of them was held off until a fresh reputation read answers, not judged under the floor"
            : ` · ${awaiting} of them were held off until a fresh reputation read answers, not judged under the floor`)}
        {unbound > 0 &&
          (unbound === 1
            ? " · 1 agent with no endpoint bound was never a candidate"
            : ` · ${unbound} agents with no endpoint bound were never candidates`)}
        {unreachable > 0 &&
          (unreachable === 1
            ? " · 1 agent whose endpoint failed its latest health check was left out"
            : ` · ${unreachable} agents whose endpoints failed their latest health check were left out`)}
        {external > 0 &&
          (externalUncounted
            ? " · operator agents were left out: plans use only the platform's own agents for now"
            : external === 1
              ? " · 1 operator agent was left out: plans use only the platform's own agents for now"
              : ` · ${external} operator agents were left out: plans use only the platform's own agents for now`)}
        {simulated > 0 &&
          (simulated === 1
            ? " · 1 agent whose worker is not live yet was left out, so nothing simulated is charged"
            : ` · ${simulated} agents whose workers are not live yet were left out, so nothing simulated is charged`)}
        {noInput > 0 &&
          (noInput === 1
            ? " · 1 proposed step was left out because it would have had nothing to work on"
            : ` · ${noInput} proposed steps were left out because they would have had nothing to work on`)}
        {noProvider > 0 &&
          (noProvider === 1
            ? " · 1 agent was left out because its model provider is unavailable"
            : ` · ${noProvider} agents were left out because their model provider is unavailable`)}
        {undescribed > 0 &&
          ` · ${undescribed === 1 ? "1 agent" : `${undescribed} agents`} reported under a kind this card has no wording for, listed below`}
        {hidden > 0 && ` · ${hiddenNoticesText(hidden)}`}
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
