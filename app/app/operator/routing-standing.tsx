/**
 * Whether the orchestrator can pick this agent, and if not, which gate stopped it.
 *
 * This is the one panel that answers the question an operator actually has, and
 * it exists because the answer is currently scattered across three surfaces that
 * each tell half of it. Selection turns on TWO independent gates, and an agent
 * is passed over unless both hold:
 *
 *   1. An endpoint is bound. An unbound on-chain agent is filtered out of the
 *      planner's candidate list, out of the floor-substitution search, and out
 *      of the returned plan. It is not routed to and failed — it is silently
 *      passed over, which is the worse failure mode because nothing ever breaks
 *      loudly enough for the operator to notice. `UNBOUND_WARNING` carries that
 *      wording and is imported rather than retyped for exactly that reason.
 *
 *   2. The Wilson LOWER BOUND clears the network floor — `lower_bound_bps >=
 *      floor_bps`, matching the backend's `passes_floor`. NOT the smoothed
 *      headline score. This is the single most misunderstood rule in the
 *      system: an agent can show a perfectly healthy headline score and still
 *      be ineligible, because the lower bound discounts for how few ratings
 *      back that score up. Every operator who has asked "why is my 4.8 agent
 *      getting nothing" has been looking at the wrong number.
 *
 * Two words are load-bearing throughout. "Eligible" is never "being routed":
 * clearing both gates puts the agent in the candidate pool, and the planner
 * still chooses per request. Conflating the two is a real bug elsewhere in this
 * codebase and it is not repeated here. And "not eligible" is never
 * "excluded": a starvation backstop can re-admit a below-floor agent, so the
 * floor is the normal rule rather than a wall.
 *
 * The panel fetches nothing. The page owns the reputation batch and the binding
 * lookup because both are shared across the dashboard; this component is a pure
 * reading of what they returned, which is also what makes every branch below
 * testable without a network.
 */

import { ButtonLink } from "@/components/ui/button";
import { ReputationBadge } from "@/components/ui/reputation-badge";
import { KVRow } from "@/components/ui/kv-row";
import { bindHref, UNBOUND_WARNING } from "@/lib/binding-status";
import type { BindingState } from "@/app/app/agents/use-binding-status";
import type { ReputationInfo } from "@/lib/types";

/**
 * bps 0..10000 over a 0–100 rating scale → the familiar 0–5 score.
 *
 * Duplicated from ReputationBadge rather than imported because the badge does
 * not export it. The two have to round identically: the chip and the sentence
 * explaining the chip sit inches apart, and a 4.20 next to a 4.2 reads as two
 * different numbers for the same thing.
 */
const score = (bps: number) => (bps / 2000).toFixed(2);

/**
 * Where one gate stands. `unknown` is a first-class outcome and not a soft
 * `fail`: we have plenty of ways to not know something, and none of them are
 * grounds for telling an operator their agent cannot be selected.
 */
type Gate = "pass" | "fail" | "unknown";

/** "a", "a and b", "a, b and c" — the verdict names every blocker it has, not
 *  just the first one, so fixing the named problem cannot leave a second one
 *  waiting unannounced. */
function joinClauses(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? "";
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

/** Glyph per outcome. Paired with words everywhere it appears — the tint is
 *  decoration, and a panel that says "not eligible" only in magenta says
 *  nothing at all to a third of the people reading it. */
const GLYPH: Record<Gate, string> = { pass: "✓", fail: "✕", unknown: "⋯" };

const TONE: Record<Gate, string> = {
  pass: "border-cyan/40 bg-cyan/5 text-cyan",
  fail: "border-magenta/40 bg-magenta/5 text-magenta",
  unknown: "border-border bg-white/5 text-muted",
};

const gateHeading =
  "font-mono text-[10px] uppercase tracking-widest text-muted";
const body = "font-mono text-[11px] leading-relaxed text-muted";

export function RoutingStanding({
  agentId,
  bindingState,
  reputation,
  floorBps,
  priorBps,
}: {
  agentId: string;
  bindingState: BindingState | null;
  reputation: ReputationInfo | null;
  /** Null when the reputation batch has not loaded. The floor and the score
   *  arrive together, so a null floor and a null `reputation` co-occur — but
   *  both are typed independently rather than bundled, because inventing a
   *  floor to satisfy a signature is exactly how a missing number becomes a
   *  confident verdict. */
  floorBps: number | null;
  priorBps: number | null;
}): JSX.Element {
  // `null` is "no claim applies" — a seeded catalog agent, another wallet's
  // agent, or one past the hook's cap. It is NOT an unbound agent, and it is
  // not a blocker either, so it passes the gate silently and renders no
  // binding section at all. `checking` and `error` are the other half of that
  // rule: neither may ever reach the operator as "unbound", because telling
  // someone their live production service cannot be selected for work, when we
  // simply have not heard back, is a false accusation about their revenue.
  const bindingGate: Gate =
    bindingState === null || bindingState === "bound"
      ? "pass"
      : bindingState === "unbound"
        ? "fail"
        : "unknown";

  // The backend's rule, verbatim: the Wilson lower bound against the floor.
  // "Wilson" stays in the comments and out of the copy: naming the
  // statistic tells an operator nothing they can act on, and the sentence
  // below the gate already explains what the lower bound is and why it,
  // rather than the headline score, is the number that decides.
  // A null reputation means this agent was not in the batch — unknown, and
  // deliberately not defaulted to the prior, which would be inventing a score.
  const floorGate: Gate =
    reputation === null
      ? "unknown"
      : floorBps === null
        ? "unknown"
        : reputation.lower_bound_bps >= floorBps
          ? "pass"
          : "fail";

  // A failure outranks an unknown. Both gates must hold, so one confirmed
  // failure settles the verdict no matter what the other gate is doing.
  const verdict: Gate =
    bindingGate === "fail" || floorGate === "fail"
      ? "fail"
      : bindingGate === "unknown" || floorGate === "unknown"
        ? "unknown"
        : "pass";

  const blockers: string[] = [];
  if (bindingGate === "fail") blockers.push("no endpoint is bound");
  if (floorGate === "fail")
    blockers.push("its reputation lower bound is below the network floor");

  const unread: string[] = [];
  if (bindingGate === "unknown")
    unread.push(
      bindingState === "error"
        ? "the endpoint lookup failed"
        : "the endpoint lookup has not come back yet",
    );
  if (floorGate === "unknown")
    unread.push(
      reputation === null
        ? "no reputation score is known for this agent"
        : "the network floor is not known",
    );

  const holds: string[] = [];
  if (bindingState === "bound") holds.push("an endpoint is bound");
  if (floorGate === "pass")
    holds.push("the reputation lower bound clears the network floor");

  const headline =
    verdict === "pass"
      ? "Eligible — the planner selects per request."
      : verdict === "fail"
        ? `Not eligible — ${joinClauses(blockers)}.`
        : `Standing not confirmed — ${joinClauses(unread)}.`;

  const rationale =
    verdict === "pass"
      ? `Nothing is blocking selection: ${joinClauses(holds)}. Eligibility is not selection — it puts this agent in the candidate pool, and the planner chooses from that pool on every request.`
      : verdict === "fail"
        ? "An agent is selected only when both gates hold: an endpoint is bound, and the reputation lower bound clears the network floor."
        : "This is not a verdict. Nothing here says the agent cannot be selected — one of the two gates has simply not been read.";

  // Derived from the agent id rather than useId: this panel holds no state and
  // needs no client boundary, and an id is letters, digits and underscore only.
  const headingId = `routing-standing-${agentId}`;

  return (
    <section aria-labelledby={headingId} className="space-y-5">
      <div>
        <h2 id={headingId} className="text-sm font-semibold tracking-tight">
          Routing standing
        </h2>
        <p className={`mt-1 ${body}`}>
          Whether the orchestrator can pick{" "}
          <span className="break-all text-text">{agentId}</span>, and what
          decides it.
        </p>
      </div>

      {/* A live region, because this verdict changes under the operator as the
          binding lookup lands. The change from "not confirmed" to a real answer
          is the whole point of the panel and should not be silent. */}
      <p
        role="status"
        className={`clip-cyber-sm flex flex-wrap items-baseline gap-x-2 gap-y-1 border px-3 py-2 font-mono text-xs leading-relaxed ${TONE[verdict]}`}
      >
        <span aria-hidden="true">{GLYPH[verdict]}</span>
        <span className="min-w-0 break-words">{headline}</span>
      </p>

      <p className={body}>{rationale}</p>

      {/* Omitted entirely when bindingState is null: no claim applies, and a
          greyed-out "not applicable" row is still a claim. */}
      {bindingState !== null && (
        <div className="space-y-1.5">
          <h3 className={gateHeading}>Gate 1 · Endpoint binding</h3>
          {bindingState === "bound" && (
            <p className={body}>
              <span aria-hidden="true">✓ </span>An endpoint is bound, so this
              agent reaches the planner as a candidate.
            </p>
          )}
          {bindingState === "unbound" && (
            <>
              <p className={body}>
                <span aria-hidden="true">✕ </span>
                {UNBOUND_WARNING}
              </p>
              <p className="pt-1">
                {/* ButtonLink carries the shared `focusRing` through the button
                    base, and the id rides in the href so an id that reached us
                    from the chain is never retyped by hand. The label repeats
                    it so several of these on one page are told apart aloud.
                    Capped and breakable because an agent id is one unbreakable
                    token and this panel has to survive a 320px viewport. */}
                <ButtonLink
                  variant="outline"
                  size="sm"
                  href={bindHref(agentId)}
                  className="max-w-full break-all"
                >
                  bind {agentId}
                </ButtonLink>
              </p>
            </>
          )}
          {bindingState === "checking" && (
            <p className={body}>
              <span aria-hidden="true">⋯ </span>Checking the endpoint binding.
              An unfinished lookup is not an unbound agent, so nothing is
              claimed here until it lands.
            </p>
          )}
          {bindingState === "error" && (
            <p className={body}>
              <span aria-hidden="true">? </span>The endpoint binding could not
              be read. That is a fact about our request, not about this agent —
              it is not a claim that the endpoint is missing.
            </p>
          )}
        </div>
      )}

      <div className="space-y-2">
        <h3 className={gateHeading}>Gate 2 · Network floor</h3>

        {reputation === null || floorBps === null ? (
          <p className={body}>
            <span aria-hidden="true">⋯ </span>
            {reputation === null
              ? `No reputation score is known for this agent — it was not in the batch, so whether it clears ${floorBps === null ? "the network floor" : `the ${score(floorBps)} floor`} cannot be answered here. It is not carrying the prior either; assuming the prior would be inventing a number.`
              : "The network floor is not known, so whether this agent clears it cannot be answered here. The score above is real; the line it has to cross is what is missing."}
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <ReputationBadge
                bps={reputation.smoothed_bps}
                lowerBoundBps={reputation.lower_bound_bps}
                source={reputation.source}
                count={reputation.count}
                disputeRateBps={reputation.dispute_rate_bps}
                floorBps={floorBps}
              />
              <span className={body}>
                {floorGate === "pass"
                  ? `✓ Lower bound ${score(reputation.lower_bound_bps)} clears the ${score(floorBps)} floor.`
                  : `✕ Lower bound ${score(reputation.lower_bound_bps)} is below the ${score(floorBps)} floor.`}
              </span>
            </div>

            <dl className="space-y-1 font-mono text-[11px]">
              <KVRow
                k="lower bound"
                value={score(reputation.lower_bound_bps)}
                valueClassName="text-text"
              />
              <KVRow
                k="network floor"
                value={score(floorBps)}
                valueClassName="text-text"
              />
              <KVRow
                k="headline score"
                value={score(reputation.smoothed_bps)}
                valueClassName="text-muted"
              />
            </dl>

            <p className={body}>
              The floor is checked against the lower bound, never the headline{" "}
              {score(reputation.smoothed_bps)}. The lower bound is what is left
              after discounting for how few ratings back that headline up, so an
              agent can show a healthy score and still be ineligible.
            </p>

            {floorGate === "fail" && (
              <>
                <p className={body}>
                  Ratings from completed work raise the lower bound, twice over:
                  they move the average, and they shrink the uncertainty the
                  bound subtracts from it. Nothing about the agent itself has to
                  change.
                </p>
                <p className={body}>
                  Below the floor is not eligible under the normal rule, not
                  permanently excluded — a starvation backstop can still
                  re-admit a below-floor agent.
                </p>
              </>
            )}

            {/* Ordered before the cold-start note and mutually exclusive with
                it. Both arrive as `source: "prior"` and are indistinguishable
                otherwise, and one of them means we could not read the chain. */}
            {reputation.degraded === true ? (
              <p className={`${body} text-magenta`}>
                <span aria-hidden="true">⚠ </span>This score is not a reading of
                the chain. The on-chain read failed and the Bayesian prior of{" "}
                {priorBps === null ? "the network" : score(priorBps)} was served
                in its place — the reputation service fails open. Treat the
                result above as provisional: it was computed from the prior, not
                from this agent&apos;s history. Reload once the read recovers.
              </p>
            ) : (
              reputation.source === "prior" && (
                <p className={body}>
                  <span aria-hidden="true">≈ </span>Never rated on-chain. This
                  is the Bayesian prior
                  {priorBps === null ? "" : ` of ${score(priorBps)}`}, and a
                  brand-new agent&apos;s lower bound sits below the floor — the
                  honest cold-start position, not a fault.
                </p>
              )
            )}
          </>
        )}
      </div>
    </section>
  );
}
