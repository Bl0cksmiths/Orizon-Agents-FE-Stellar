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
import { belowFloorEvidence } from "@/lib/floor-evidence";
import { scoreOutOfFive } from "@/lib/reputation-math";
import { focusRing } from "@/lib/ui";
import type {
  DecomposeResponse,
  ExclusionReason,
  PlanFloorNotice,
  PlanFloorNoticeKind,
} from "@/lib/types";
import {
  hiddenNotices,
  hiddenNoticesText,
  isAwaitingFreshRead,
  isFloorAction,
  isUnbound,
  knownKind,
} from "./floor-notices";

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

/** What an unbound row wears instead of its kind's mark. It arrives as
 *  `kind: "excluded"`, but nothing judged it, and a magenta "✕ excluded" among
 *  the floor's verdicts would file it with them. Muted, with its own glyph and
 *  word: it is a setup step its operator has not finished, not a finding about
 *  the quality of this plan. */
const UNBOUND_MARK = {
  tone: "muted",
  glyph: "○",
  label: "no endpoint",
} as const;

/** What a notice of a kind this build does not know wears. Muted, like the
 *  unbound mark, because nothing about it can be claimed beyond what the
 *  backend's own `reason` prose says — no tone that implies a verdict, and no
 *  glyph borrowed from a kind it may not be. The label is the backend's own
 *  word for it, so the row still names what happened. */
const unknownMark = (kind: string) =>
  ({
    tone: "muted",
    glyph: "◇",
    label: kind.replace(/_/g, " "),
  }) as const;

/** How unknown kinds are counted in the closed summary. */
const OTHER_COUNT_LABEL = "other";

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
 * `below_floor` is only the opening of its sentence: what follows is built
 * from the notice's own evidence by `belowFloorEvidence`, because the cause of
 * a low bound is in the numbers, not in the reason code. It used to end "so
 * this is thin evidence rather than bad work", which is false for an agent
 * whose bound rests on many real low ratings. Nothing here says bad work, and
 * nothing here says not bad work, beyond what the count and dispute rate show.
 *
 * `unbound_endpoint` had no copy anywhere in the product before this one. The
 * obvious phrasing, "it would fail any work sent to it", is false in exactly
 * the way lib/binding-status.ts already corrects once: an unbound agent is
 * filtered out of the candidate list before the plan exists, so it is passed
 * over in silence rather than given work it cannot do.
 */
const REASON_COPY: Record<ExclusionReason, string> = {
  below_floor:
    "Its reputation lower bound is below the floor this plan was built against.",
  unbound_endpoint:
    "It is registered on-chain but has no endpoint bound, so there is nothing to dispatch a step to and the orchestrator passed it over — it has not failed anything, an unbound agent is never a candidate in the first place.",
  floor_relaxed:
    "The floor was relaxed so this step would still have a candidate: the agent sits below it and was kept anyway, which is a compromise on this plan's quality rather than a clean pick.",
};

/**
 * An agent held off because it was rated since its last reputation read and
 * the fresh read has not answered yet (finding S8). The backend still codes it
 * `below_floor`, but its bound is from BEFORE the new rating and can clear the
 * floor, so the below-floor sentence would state as fact a comparison that
 * says the opposite. This one says what happened instead.
 */
const AWAITING_COPY =
  "It was rated since its last reputation read, so it is held off routing until a fresh read answers. The bound below is from before that rating, so it is not a verdict that the agent sits under the floor.";

/**
 * Deliberately typed to return `string | undefined`.
 *
 * `screenDecomposeResponse` checks `reason_code` (like `kind`) only as a
 * string, so that a backend adding a fourth reason cannot blank this panel. An unrecognised code therefore reaches this map, and indexing
 * `Record<ExclusionReason, string>` would have TypeScript promise a string
 * that is not there. The row falls back to the backend prose, which is
 * required on every notice and so always available.
 */
function reasonCopy(notice: PlanFloorNotice): string | undefined {
  const code = notice.reason_code;
  if (code === undefined) return undefined;
  const opening = (REASON_COPY as Record<string, string | undefined>)[code];
  if (code !== "below_floor" || opening === undefined) return opening;
  // The evidence sentence, or none when the count is unknown: an unread or
  // null count says nothing about why the bound sits where it does.
  const evidence = belowFloorEvidence({
    count: notice.count,
    disputeRateBps: notice.dispute_rate_bps,
  });
  return evidence === null ? opening : `${opening} ${evidence}`;
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
  const awaiting = isAwaitingFreshRead(notice);
  const copy = awaiting ? AWAITING_COPY : reasonCopy(notice);
  const replacement =
    notice.kind === "substituted" ? replacementOf(notice) : null;

  // The notice's own floor wins. The plan-level floor is the same number from
  // the same response and is only a fallback, so that a lower bound is never
  // printed without the line it had to clear beside it.
  const floorBps = notice.floor_bps ?? planFloorBps;

  // Not a floor verdict at all: the agent has no endpoint to dispatch to, so
  // its standing was never consulted and the backend leaves its bound null on
  // purpose. That null says nothing about its ratings.
  const unbound = isUnbound(notice);
  const kind = knownKind(notice);
  const mark = unbound
    ? UNBOUND_MARK
    : kind === null
      ? unknownMark(notice.kind)
      : {
          tone: KIND_TONE[kind],
          glyph: KIND_GLYPH[kind],
          label: KIND_LABEL[kind],
        };

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
        {/* max-w-full + break-all: an unknown kind's label is the backend's
            own token, and nothing promises it has a break opportunity. */}
        <Badge tone={mark.tone} className="max-w-full break-all">
          <span aria-hidden="true">{mark.glyph}</span>
          {mark.label}
        </Badge>
        {/* overflow-wrap: anywhere on the names, never word-break: break-all.
            A name is either words ("Faulty test agent (deliberate,
            team-run)") or one unbroken id (a 56-character address), and the
            card has to survive a 360px viewport with the panel open.
            break-all split the words too — "…(deliberate, tea / m-run)" on
            orizons.xyz at 390px. `anywhere` wraps at the spaces first and
            breaks inside a token only when that token alone is wider than
            the line, and unlike `break-word` it also lets the flex row shrink
            the name, so an id wraps instead of pushing the row wide. */}
        <span className="min-w-0 break-words text-sm">
          <b className="text-text [overflow-wrap:anywhere]">{nameOf(notice)}</b>
          {replacement !== null && (
            <>
              {/* Words, not a bare arrow: "⇄" alone leaves the direction of a
                  substitution to the reader and to a screen reader, and the
                  direction is the whole content of the row. */}
              <span className="text-muted"> replaced by </span>
              <b className="text-text [overflow-wrap:anywhere]">
                {replacement}
              </b>
            </>
          )}
        </span>
      </div>

      <p className="text-sm leading-relaxed">{copy ?? notice.reason}</p>

      {showNumbers && (
        <p className={numbersRow}>
          {bound !== undefined && (
            <span>
              {awaiting ? "last read lower bound" : "lower bound"}{" "}
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
  // Notices the guard dropped as unusable. Not nothing: the backend reported
  // something here, and a panel that vanished because every notice in it was
  // malformed would tell the buyer the floor did nothing.
  const hidden = hiddenNotices(plan);
  if (notices.length === 0 && hidden === 0) return null;

  // Unbound agents are counted apart from what the floor did. The backend
  // names up to eight on every plan while any registered agent is unbound, so
  // folded into the kinds they would turn an untouched plan into "8 excluded".
  const changes = notices.filter(isFloorAction);
  const unbound = notices.length - changes.length;

  // Only a kind this build knows indexes the per-kind counts. The guard lets
  // any string through, so that one new kind cannot blank the plan; a kind
  // with no arm is still counted, apart, and never silently left out of the
  // total the buyer reads with the panel shut.
  const counts: Record<PlanFloorNoticeKind, number> = {
    excluded: 0,
    substituted: 0,
    degraded: 0,
  };
  let other = 0;
  for (const n of changes) {
    const kind = knownKind(n);
    if (kind === null) other += 1;
    else counts[kind] += 1;
  }

  const breakdown = [
    ...KIND_ORDER.filter((k) => counts[k] > 0).map(
      (k) => `${counts[k]} ${KIND_COUNT_LABEL[k]}`,
    ),
    ...(other > 0 ? [`${other} ${OTHER_COUNT_LABEL}`] : []),
    ...(unbound > 0 ? [`${unbound} with no endpoint bound`] : []),
    ...(hidden > 0 ? [hiddenNoticesText(hidden)] : []),
  ].join(" · ");

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
          Reputation floor ·{" "}
          {changes.length === 0
            ? "no changes"
            : `${changes.length} change${changes.length === 1 ? "" : "s"}`}
        </h3>
        {/* w-full puts the breakdown on its own flex line. It is inside the
            summary on purpose: the count is the part a buyer who never opens
            this panel is still entitled to see. */}
        <span className="w-full font-mono text-[11px] text-muted">
          {breakdown}
        </span>
      </summary>

      <div className="space-y-3 px-4 pb-4">
        {/* Two claims, each made only when true. "The floor acted on these
            agents" over a list of unbound agents would credit the floor with
            decisions it never took. */}
        {changes.length > 0 && (
          <p className="text-sm leading-relaxed text-muted">
            The reputation floor acted on {unbound > 0 ? "some of " : ""}these
            agents while this plan was built. It decides who is eligible to be
            picked, before any step is dispatched, by comparing a statistical
            lower bound on each agent&apos;s reputation against the floor.
          </p>
        )}
        {unbound > 0 && (
          <p className="text-sm leading-relaxed text-muted">
            {changes.length > 0 ? "Those marked “no endpoint”" : "These agents"}{" "}
            were never candidates: they are registered on-chain but have no
            endpoint bound to dispatch a step to, so the floor did not judge
            them either way.
          </p>
        )}
        {hidden > 0 && (
          <p className="text-sm leading-relaxed text-muted">
            {hiddenNoticesText(hidden)}: {hidden === 1 ? "it" : "they"} arrived
            incomplete, so there is nothing reliable to say about{" "}
            {hidden === 1 ? "it" : "them"} here.
          </p>
        )}
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
