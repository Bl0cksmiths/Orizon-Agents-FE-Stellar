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
 * The cell fetches nothing. The page owns the reputation batch, so every
 * branch below is a pure reading of what that batch returned — which is also
 * what makes each one testable without a network.
 */

import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
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
    marks.push(
      <StandingMark
        key="source"
        tone="violet"
        glyph="⬡"
        label="on-chain"
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
    const detail =
      `${agent.name} is below the network floor: its reputation lower bound ` +
      `${score(rep.lower_bound_bps)} is under the ${score(floorBps)} floor, ` +
      `so it is not eligible for selection under the normal rule. It keeps ` +
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
