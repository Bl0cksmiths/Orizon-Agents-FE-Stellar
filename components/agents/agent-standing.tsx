/**
 * Whether an agent can actually be hired, said in its own marketplace row.
 *
 * `/app/agents` is the shop window for a supply side anyone can now register
 * into, and a row there has shown a score and nothing about standing: a buyer
 * could read a healthy 4.8 off a row the orchestrator passes over every time.
 * This cell is the per-row answer. It renders `null` whenever it has nothing
 * truthful to add, because an agent in good standing is not news and a marker
 * on every row is a marker on none.
 *
 * The floor rule is the backend's `passes_floor`, verbatim: the reputation
 * LOWER BOUND against the floor, `lower_bound_bps >= floor_bps`, never the
 * smoothed headline score. The two agree almost everywhere and disagree
 * exactly where it matters — an agent with a healthy average and too few
 * settled ratings behind it — and that agent is the whole reason this cell
 * exists. `>=` is the backend's comparison, so an agent sitting exactly on
 * the floor clears it.
 *
 * Three claims are load-bearing, and each is easy to get wrong by accident:
 *
 *   - "Not eligible", never "will not be routed". Story 3.02 added a
 *     starvation backstop that re-admits a below-floor agent when too few
 *     clear the floor, so a flat never is an overclaim. This codebase has
 *     already had to correct that class of wording twice.
 *   - Not eligible is not gone. Below the floor the agent keeps its listing
 *     and its history — the floor gates selection, not the catalog — so no
 *     copy here may imply removal.
 *   - Passed over, never at fault. The floor acts while a plan is being
 *     built, so a below-floor agent was not asked and found wanting: it was
 *     not asked. Thin evidence is not bad work.
 *
 * Provenance is the cell's other fact. `source === "onchain"` means anyone
 * registered this agent against the on-chain registry; `"seeded"` is the
 * first-party catalog. The on-chain ones are marked, because on a marketplace
 * open to anyone, who put an agent here is part of what a buyer is deciding
 * about. The signals provenance must NOT be read from are documented on
 * `isOnchain` below — each of them is a plausible-looking mistake.
 *
 * Binding is the third fact, and it is tri-state on purpose. `bound === false`
 * on an on-chain agent means registered but with no endpoint bound yet — not
 * yet operational. `null` or absent means the question does not apply: a
 * seeded agent runs on a worker inside the backend and has no endpoint to
 * bind, so "unbound" there would report a defect that does not exist. The
 * wording for it is imported from `lib/binding-status`, never retyped; that
 * sentence is the fourth surface to state the same claim and three copies of
 * a claim drift. On the connected operator's own rows the page's per-agent
 * lookup answers the same question with fresher data and its own marker, so
 * the cell stands down there (`bindingLookup`) rather than contradict it.
 *
 * Degrees of not-knowing are kept apart rather than collapsed, because each
 * one is a different reason to say less. A null `rep` is "no score is known";
 * a null `floorBps` is "the batch has not loaded"; and `rep.degraded` is the
 * sharpest of the three — the score IS the Bayesian prior, served because the
 * on-chain read did not come back rather than because the agent is new. Both
 * arrive as `source: "prior"` and are otherwise indistinguishable, so a floor
 * verdict computed from a degraded score is provisional and has to say so.
 *
 * The cell fetches nothing. The page owns the reputation batch, so every
 * branch below is a pure reading of what that batch returned — which is also
 * what makes each one testable without a network.
 */

import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { UNBOUND_WARNING } from "@/lib/binding-status";
import type { Agent, ReputationInfo } from "@/lib/types";

/**
 * bps 0..10000 over a 0–100 rating scale → the familiar 0–5 score.
 *
 * Duplicated from ReputationBadge rather than imported because the badge does
 * not export it, and the two have to round identically: that chip and this
 * cell sit in the same table row, and a 4.20 beside a 4.2 reads as two
 * different numbers for one score.
 */
const score = (bps: number) => (bps / 2000).toFixed(2);

/**
 * Was this agent registered on-chain by someone, rather than seeded into the
 * first-party catalog?
 *
 * `source` is the signal of record and is read first. `owner` only
 * corroborates it, for a response from a backend that predates the field, and
 * it is sound there for the reason `needsBinding` already relies on: the seed
 * never sets an owner.
 *
 * Two tempting signals are deliberately NOT used here.
 *
 * `agent.real` means "backed by a real Agno worker rather than a mock". It is
 * an internal detail of the catalog: `registry_sync` sets it false for EVERY
 * on-chain agent and the seeded catalog is a mix, so keying provenance off it
 * would mark roughly the opposite population — every marker on the page would
 * be pointing at the wrong rows while looking entirely plausible.
 *
 * The `agt_` id prefix is not provenance either. Reading provenance out of an
 * id format is forbidden by a product rule, and for a good reason: an id is a
 * naming convention, and a convention is not a fact about who registered what.
 */
function isOnchain(agent: Agent): boolean {
  if (agent.source) return agent.source === "onchain";
  return !!agent.owner;
}

/**
 * One marker, built on the shared Badge rather than beside it.
 *
 * The visible label carries a glyph AND words: a row that says "ineligible"
 * only by turning magenta says nothing at all to a reader who cannot see the
 * tint (WCAG 1.4.1). The long form rides along twice — `title` for a pointer,
 * `sr-only` for a screen reader — because the visible label has to stay short
 * enough not to widen the column, and a short label alone is a verdict with
 * no reasoning attached to it.
 */
function StandingMark({
  tone,
  glyph,
  label,
  detail,
}: {
  tone: "violet" | "magenta" | "muted";
  glyph: string;
  label: string;
  detail: string;
}): JSX.Element {
  return (
    <span title={detail} className="inline-flex max-w-full">
      {/* `max-w-full` plus normal wrapping is what keeps this cell from
          widening the row. The registry scrolls sideways inside a container
          on a page that hides horizontal overflow, so a marker that refuses
          to wrap pushes the columns after it off the side of the screen. */}
      <Badge tone={tone} className="max-w-full whitespace-normal break-words">
        <span aria-hidden="true">
          {glyph} {label}
        </span>
        <span className="sr-only">{detail}</span>
      </Badge>
    </span>
  );
}

export function AgentStanding({
  agent,
  rep,
  floorBps,
  bindingLookup = false,
}: {
  agent: Agent;
  /**
   * This agent's entry in the reputation batch, or null when it has none.
   *
   * Null is "no score is known for this agent", NOT the prior. Falling back to
   * the prior would be inventing a number and then judging the agent by it.
   */
  rep: ReputationInfo | null;
  /**
   * The network floor, or null when the batch has not loaded.
   *
   * There is deliberately no constant to fall back to: the floor is
   * configurable per deployment, and a verdict measured against a number the
   * backend never sent is a verdict nobody computed.
   */
  floorBps: number | null;
  /**
   * Whether the page's per-agent binding lookup (story 2.05) covers this row.
   *
   * When it does, that lookup is the authority on binding: it is fresher than
   * the registry payload, and the page renders its own marker and warning for
   * it beside this cell. A second, list-derived marker here would put two
   * answers to one question in the same row — "not yet operational" beside
   * "checking endpoint…", or the unbound warning twice over — so the cell
   * leaves binding to the lookup and reads `bound` only on the rows it does
   * not ask about.
   */
  bindingLookup?: boolean;
}): JSX.Element | null {
  const onchain = isOnchain(agent);

  const marks: ReactNode[] = [];

  if (onchain) {
    // Stated as a fact about where the listing came from, not as a warning.
    // An externally registered agent is the point of opening the registry up,
    // so this marker identifies the agent — it does not caution against it.
    const detail =
      `${agent.name} was registered on-chain against the public registry by ` +
      `its owner, rather than seeded into the first-party catalog.`;
    // "external", not "on-chain". This row also carries a reputation chip that
    // says "on-chain reputation" when the score was read from the ledger — and
    // a SEEDED agent can have one, because the first-party catalog is rated on
    // chain like everything else. Two different "on-chain"s in one row makes
    // the buyer resolve an ambiguity we created: is this agent external, or is
    // its score settled? Provenance is the question this marker answers.
    marks.push(
      <StandingMark
        key="source"
        tone="violet"
        glyph="⬡"
        label="external"
        detail={detail}
      />,
    );
  }

  // Only the explicit `false` is a claim, and only about an on-chain agent.
  // The provenance guard is the same rule as the tri-state, stated twice on
  // purpose: a seeded row must never reach this marker even if a payload
  // someday carries `bound: false` on one, because that would read as a
  // broken service to a buyer looking at a perfectly working catalog agent.
  // A row the binding lookup covers is skipped outright: the lookup's own
  // marker speaks for binding there, including while it is still in flight.
  if (onchain && !bindingLookup && agent.bound === false) {
    // The short visible label is for a buyer scanning the registry; the long
    // form is `UNBOUND_WARNING` verbatim, addressed to the operator who can
    // act on it. The lead-in adds the buyer's framing without contradicting
    // a word of it — the agent is listed, it simply cannot be picked yet.
    const detail = `${agent.name} is registered, but no endpoint is bound yet. ${UNBOUND_WARNING}`;
    marks.push(
      <StandingMark
        key="bound"
        tone="magenta"
        glyph="⊘"
        // "not yet operational" rather than "no endpoint bound": the buyer
        // scanning this column is deciding who to hire, and the missing
        // endpoint is the cause, not the consequence they care about. The
        // long form names the endpoint, so nothing is lost.
        label="not yet operational"
        detail={detail}
      />,
    );
  }

  // Both numbers or no verdict. A score with no floor has no line to cross,
  // and a floor with no score has nothing to measure; either way the honest
  // output is silence rather than a guess. Clearing the floor is silent too —
  // good standing is the ordinary case and needs no badge.
  if (rep !== null && floorBps !== null && rep.lower_bound_bps < floorBps) {
    // Named so several of these on one page are told apart by a screen
    // reader, the same reason the bind surfaces repeat the agent in their
    // labels: "below the network floor" with no subject names no row.
    // The agent's own bound is named; the FLOOR's value deliberately is not.
    // The floor is one network-wide number, stated once above the table.
    // Repeated down a column it becomes N chances to disagree with itself
    // after a deployment changes it, and it starts reading as a property of
    // the agent rather than of the marketplace.
    const detail =
      `${agent.name} is below the network floor: its reputation lower bound ` +
      `of ${score(rep.lower_bound_bps)} is under the floor stated above this ` +
      `table, so it is not eligible for selection under the normal rule. It keeps ` +
      `its listing and its history — the orchestrator passes over it while ` +
      `building a plan, and a starvation backstop can still re-admit it when ` +
      `too few agents clear the floor. The floor reads the lower bound, ` +
      `which discounts a score for how little settled work backs it, so this ` +
      `is thin evidence rather than bad work.`;
    marks.push(
      <StandingMark
        key="floor"
        tone="magenta"
        glyph="⚑"
        label="below floor · not eligible"
        detail={detail}
      />,
    );
  }

  // Ordered last so it qualifies the verdict it follows, and gated on a floor
  // having actually been read: with no floor there is no verdict to call
  // provisional, and the score on its own is the reputation column's story
  // rather than this cell's. A passing comparison is qualified too — a silent
  // pass computed from the prior is just as provisional as a loud one.
  if (rep !== null && floorBps !== null && rep.degraded === true) {
    const detail =
      `This standing is provisional. The on-chain reputation read did not ` +
      `come back, so the network's Bayesian prior was served in its place ` +
      `and the floor comparison on this row was computed from that prior ` +
      `rather than from ${agent.name}'s own history. That is not a cold ` +
      `start: this agent may well have a record we could not reach.`;
    marks.push(
      <StandingMark
        key="degraded"
        tone="muted"
        glyph="⚠"
        label="provisional"
        detail={detail}
      />,
    );
  }

  // Nothing truthful to add about this row. An empty cell is the output.
  if (marks.length === 0) return null;

  return (
    // Inline-level and capped: this lands in a `<td>` alongside the rest of
    // the row, and a table column sizes to its cells' max-content width, so
    // an uncapped run of markers widens the entire registry.
    <span className="inline-flex max-w-[14rem] flex-wrap items-center gap-1 align-middle">
      {marks}
    </span>
  );
}
