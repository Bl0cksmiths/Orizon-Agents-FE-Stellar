/**
 * What the reputation floor did to this plan, before the buyer funds it.
 *
 * SOW §6.1 asks for "a routing example where a sub-floor agent is excluded",
 * and this is the panel that has to show it. It answers one question — which
 * agents did not make this plan, and why — in three registers at once: a count
 * that is readable without opening anything, a sentence per decision that a
 * buyer can act on, and the deciding numbers as numbers.
 *
 * COLLAPSED BY DEFAULT, NEVER HIDDEN. Those are two halves of one product
 * rule, and neither half survives without the other. The previous rendering
 * was always expanded, so a plan with three notices pushed the authorize
 * controls off a phone screen and made the ordinary case — one substitution,
 * the floor working exactly as designed — look like an incident report.
 * Hiding it behind a toggle that shows nothing when closed is the opposite
 * failure: someone is about to spend money, and "two agents were excluded" is
 * material to them even if they never read why. So the closed state carries
 * the count and the per-kind breakdown, and the detail is one keypress away.
 *
 * Native <details>/<summary> rather than a bespoke disclosure: it is focusable,
 * toggles on Enter and Space, and announces its own expanded state to a screen
 * reader with no ARIA and no JavaScript. This codebase has no disclosure
 * primitive to extend, and the cheapest way to get a disclosure wrong is to
 * hand-build the second one.
 *
 * The deciding numbers are read from `lower_bound_bps` / `floor_bps` and never
 * parsed back out of `reason`. The backend prose still renders — an operator
 * reading over a buyer's shoulder wants "below routing floor (3100 < 5500
 * bps)" verbatim — but as the footnote, not the headline.
 *
 * No outer margin: spacing between this panel and the step list belongs to
 * whatever composes the card, not to a component that cannot see its siblings.
 */

import { Badge } from "@/components/ui/badge";
import { scoreOutOfFive } from "@/lib/reputation-math";
import { focusRing } from "@/lib/ui";
import type {
  DecomposeResponse,
  ExclusionReason,
  PlanFloorNotice,
  PlanFloorNoticeKind,
} from "@/lib/types";

/** The order the closed summary counts kinds in: what was lost, what moved,
 *  what was kept anyway. The rows themselves stay in the backend's order,
 *  which tracks the steps the buyer just read above. */
const KIND_ORDER: PlanFloorNoticeKind[] = [
  "excluded",
  "substituted",
  "degraded",
];

/** Tone per kind, matching the inline step marks on the plan card so one event
 *  is never two colours on one card. The tint is decoration only — every row
 *  also carries a glyph and the words. */
const KIND_TONE: Record<PlanFloorNoticeKind, "magenta" | "cyan" | "violet"> = {
  excluded: "magenta",
  substituted: "cyan",
  degraded: "violet",
};

/** Glyph per kind, so each badge still reads with colour stripped out. */
const KIND_GLYPH: Record<PlanFloorNoticeKind, string> = {
  excluded: "✕",
  substituted: "⇄",
  degraded: "▾",
};

/** Badge wording. "degraded" is the backend's word and means nothing to a
 *  buyer; "kept below floor" says what happened, and "kept" is the word that
 *  separates it from "excluded" at a glance. */
const KIND_LABEL: Record<PlanFloorNoticeKind, string> = {
  excluded: "excluded",
  substituted: "substituted",
  degraded: "kept below floor",
};

/** The same three kinds, phrased to be counted in the closed summary. */
const KIND_COUNT_LABEL: Record<PlanFloorNoticeKind, string> = {
  excluded: "excluded",
  substituted: "substituted",
  degraded: "kept below the floor",
};

/**
 * One sentence per reason, and the wording of each is load-bearing.
 *
 * `reason` from the backend is operator prose: "below routing floor (3100 <
 * 5500 bps)" is precise and gives a buyer nothing to act on. These lead
 * instead, and the prose renders beneath them rather than being thrown away.
 *
 * Two phrasings are banned, and both bans are corrections of mistakes this
 * codebase has already made. Nothing here says an agent "is being routed" or
 * "will be routed": clearing the floor makes an agent ELIGIBLE, and the
 * planner still selects per request. And nothing here says an excluded agent
 * fails work — an agent that was passed over was never given any.
 *
 * `unbound_endpoint` had no copy anywhere in the product before this one. The
 * obvious phrasing, "it would fail any work sent to it", is false in exactly
 * the way lib/binding-status.ts already corrects once: an unbound agent is
 * filtered out of the candidate list before the plan exists, so it is passed
 * over in silence rather than given work it cannot do.
 */
const REASON_COPY: Record<ExclusionReason, string> = {
  below_floor:
    "Its reputation lower bound is below the floor this plan was built against — the bound discounts a score for how little settled work backs it, so this is thin evidence rather than bad work.",
  unbound_endpoint:
    "It is registered on-chain but has no endpoint bound, so there is nothing to dispatch a step to and the orchestrator passed it over — it has not failed anything, an unbound agent is never a candidate in the first place.",
  floor_relaxed:
    "The floor was relaxed so this step would still have a candidate: the agent sits below it and was kept anyway, which is a compromise on this plan's quality rather than a clean pick.",
};

/**
 * Deliberately typed to return `string | undefined`.
 *
 * `isDecomposeResponse` set-checks `kind` but pointedly does NOT set-check
 * `reason_code`, so that a backend adding a fourth reason cannot blank this
 * panel. An unrecognised code therefore reaches this map, and indexing
 * `Record<ExclusionReason, string>` would have TypeScript promise a string
 * that is not there. The row falls back to the backend prose, which is
 * required on every notice and so always available.
 */
function reasonCopy(code: ExclusionReason | undefined): string | undefined {
  if (code === undefined) return undefined;
  return (REASON_COPY as Record<string, string | undefined>)[code];
}

/** What to call the agent. The id is the fallback, not the decoration: a
 *  notice with no `agent_name` still has to name somebody. */
const nameOf = (n: PlanFloorNotice) => n.agent_name ?? n.agent_id;

/** The agent that took the work instead, or null. Null is rendered as no
 *  clause at all rather than as "another agent" — a substitution whose
 *  replacement we cannot name is not one we should describe. */
const replacementOf = (n: PlanFloorNotice) =>
  n.replacement_name ?? n.replacement_id ?? null;

const numbersRow =
  "flex flex-wrap items-baseline gap-x-4 gap-y-1 font-mono text-[11px] text-muted";
const footnote = "break-words font-mono text-[11px] leading-relaxed text-muted";

function NoticeRow({
  notice,
  planFloorBps,
}: {
  notice: PlanFloorNotice;
  planFloorBps: number | undefined;
}): JSX.Element {
  const copy = reasonCopy(notice.reason_code);
  const replacement =
    notice.kind === "substituted" ? replacementOf(notice) : null;

  // The notice's own floor wins. The plan-level floor is the same number from
  // the same response and is only a fallback, so that a lower bound is never
  // printed without the line it had to clear beside it.
  const floorBps = notice.floor_bps ?? planFloorBps;

  // Not a floor verdict at all: the agent has no endpoint to dispatch to, so
  // its standing was never consulted and the backend leaves its bound null on
  // purpose. That null says nothing about its ratings.
  const unbound = notice.reason_code === "unbound_endpoint";

  const bound = notice.lower_bound_bps;
  // null and undefined are different facts and must not collapse into one
  // branch. On a floor notice, null means the agent had NO reputation entry —
  // which is not a bound of zero, and on its own does not put an agent under
  // the floor. undefined means a backend predating the field sent nothing at
  // all, and there is nothing honest to say about a number we were never
  // given. On an unbound notice null is deliberate, and reading it as "no
  // entry" would state an absence of ratings nobody checked for.
  const noEntry = bound === null && !unbound;
  // No deciding numbers on an unbound row, because nothing was decided on
  // numbers: "lower bound none on record" would repeat the false no-ratings
  // claim, and the floor beside it would imply a comparison that never ran.
  const showNumbers =
    !unbound && (bound !== undefined || floorBps !== undefined);

  return (
    <li className="clip-cyber-sm space-y-2 border border-border bg-bg/60 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={KIND_TONE[notice.kind]}>
          <span aria-hidden="true">{KIND_GLYPH[notice.kind]}</span>
          {KIND_LABEL[notice.kind]}
        </Badge>
        {/* break-all on the ids alone, not on the whole line: an agent id is
            one 32-character token with no break opportunity in it and this
            card has to survive a 390px viewport with the panel open, but the
            same rule applied to the sentence around it would hyphenate
            "replaced" down the middle in a narrow column. */}
        <span className="min-w-0 break-words text-sm">
          <b className="break-all text-text">{nameOf(notice)}</b>
          {replacement !== null && (
            <>
              {/* Words, not a bare arrow: "⇄" alone leaves the direction of a
                  substitution to the reader and to a screen reader, and the
                  direction is the whole content of the row. */}
              <span className="text-muted"> replaced by </span>
              <b className="break-all text-text">{replacement}</b>
            </>
          )}
        </span>
      </div>

      <p className="text-sm leading-relaxed">{copy ?? notice.reason}</p>

      {showNumbers && (
        <p className={numbersRow}>
          {bound !== undefined && (
            <span>
              lower bound{" "}
              <span className="text-text">
                {bound === null ? "none on record" : scoreOutOfFive(bound)}
              </span>
            </span>
          )}
          {floorBps !== undefined && (
            <span>
              floor{" "}
              <span className="text-text">{scoreOutOfFive(floorBps)}</span>
            </span>
          )}
        </p>
      )}

      {noEntry && (
        <p className={footnote}>
          <span aria-hidden="true">⋯ </span>No reputation entry exists for this
          agent, so there is no lower bound to print. That is an absence of
          ratings, not a score of zero, and by itself it does not put an agent
          under the floor.
        </p>
      )}

      {/* The operator's own sentence, kept verbatim. It is demoted rather than
          dropped: it carries the raw basis points, and it is what an operator
          will want to match against a backend log. */}
      {copy !== undefined && <p className={footnote}>{notice.reason}</p>}
    </li>
  );
}

export function ExclusionsPanel({
  plan,
}: {
  plan: DecomposeResponse;
}): JSX.Element | null {
  // Optional on the type, nullable through the guard, and both mean the same
  // thing here: there is nothing to disclose, so no disclosure renders.
  const notices = plan.notices ?? [];
  if (notices.length === 0) return null;

  // `kind` is safe to index with — unlike `reason_code`, the guard set-checks
  // it, precisely because it picks a tone and a label that have no fallback.
  const counts: Record<PlanFloorNoticeKind, number> = {
    excluded: 0,
    substituted: 0,
    degraded: 0,
  };
  for (const n of notices) counts[n.kind] += 1;

  const breakdown = KIND_ORDER.filter((k) => counts[k] > 0)
    .map((k) => `${counts[k]} ${KIND_COUNT_LABEL[k]}`)
    .join(" · ");

  return (
    <details className="clip-cyber-sm group border border-violet/40 bg-violet/5">
      {/* list-none drops the marker in Chrome and Firefox, the ::-webkit
          pseudo-element drops Safari's; the ▸/▾ pair replaces it so the
          affordance survives with colour and images off. */}
      <summary
        className={`flex cursor-pointer select-none list-none flex-wrap items-baseline gap-x-2 gap-y-1 p-4 [&::-webkit-details-marker]:hidden ${focusRing}`}
      >
        <span aria-hidden="true" className="text-violet-readable">
          <span className="group-open:hidden">▸</span>
          <span className="hidden group-open:inline">▾</span>
        </span>
        <h3 className="font-mono text-[10px] uppercase tracking-[0.25em] text-violet-readable">
          Reputation floor · {notices.length} change
          {notices.length === 1 ? "" : "s"}
        </h3>
        {/* w-full puts the breakdown on its own flex line. It is inside the
            summary on purpose: the count is the part a buyer who never opens
            this panel is still entitled to see. */}
        <span className="w-full font-mono text-[11px] text-muted">
          {breakdown}
        </span>
      </summary>

      <div className="space-y-3 px-4 pb-4">
        <p className="text-sm leading-relaxed text-muted">
          The reputation floor acted on these agents while this plan was built.
          It decides who is eligible to be picked, before any step is
          dispatched, so nothing below is a judgement on work an agent actually
          did.
        </p>
        <ul className="space-y-3">
          {notices.map((n, i) => (
            <NoticeRow
              key={`${n.kind}-${n.agent_id}-${i}`}
              notice={n}
              planFloorBps={plan.floor_bps}
            />
          ))}
        </ul>
      </div>
    </details>
  );
}
