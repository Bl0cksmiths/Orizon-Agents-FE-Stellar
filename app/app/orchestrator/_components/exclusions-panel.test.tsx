// @vitest-environment jsdom
/**
 * Unit tests for ExclusionsPanel.
 *
 * This panel is the only place a buyer is told which agents did not make the
 * plan they are about to pay for, so the assertions are written against the
 * words it says rather than its markup: a refactor is free, a changed claim
 * is not.
 *
 * Several of these guard a claim this codebase has already made wrongly:
 *
 *   - Eligibility is never "being routed". Clearing the floor puts an agent in
 *     the candidate pool; the planner still selects per request.
 *   - An excluded agent never "fails" work. It was passed over, so it was
 *     never given any.
 *   - A null `lower_bound_bps` is an agent with NO reputation entry, which is
 *     not a bound of zero and does not put an agent under the floor. Printing
 *     "0.00" beside the agent would state a score nobody computed.
 *   - `reason_code` is deliberately not set-checked by the runtime guard, so a
 *     backend that adds a fourth reason must still render a usable row rather
 *     than blanking the panel.
 *
 * jsdom loads no user-agent stylesheet, so a closed <details> still has its
 * children in the DOM. "Collapsed" is therefore asserted as `details.open`
 * being false plus the count being inside the <summary>, which is the part the
 * browser keeps on screen either way.
 *
 * Assertions are plain DOM checks — this repo does not install jest-dom.
 */

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import type { DecomposeResponse, PlanFloorNotice } from "@/lib/types";
import { ExclusionsPanel } from "./exclusions-panel";

afterEach(cleanup);

/** 2.75 on the 0–5 scale the panel prints. */
const FLOOR_BPS = 5500;

function plan(over: Partial<DecomposeResponse> = {}): DecomposeResponse {
  return {
    plan_id: "pl_test",
    intent: "ship a landing page",
    steps: [],
    total_usdc: 0.123,
    total_eta: 6.7,
    floor_bps: FLOOR_BPS,
    ...over,
  };
}

/**
 * A rated agent that was excluded for sitting under the floor. Rated DOWN, not
 * never rated: a never-rated agent's bound comes off the Bayesian prior and
 * CLEARS the floor, so a fixture that put a cold-start agent below it would
 * have every assertion built on it measuring the inverse of the guarantee.
 */
function notice(over: Partial<PlanFloorNotice> = {}): PlanFloorNotice {
  return {
    kind: "excluded",
    agent_id: "vision.ocr",
    agent_name: "vision.ocr",
    reason: "below routing floor (4200 < 5500 bps)",
    reason_code: "below_floor",
    lower_bound_bps: 4200,
    floor_bps: FLOOR_BPS,
    ...over,
  };
}

function renderPanel(p: DecomposeResponse) {
  const { container } = render(<ExclusionsPanel plan={p} />);
  const details = container.querySelector("details");
  const summary = container.querySelector("summary");
  return {
    container,
    details: details as HTMLDetailsElement | null,
    summary: summary as HTMLElement | null,
    text: () => container.textContent ?? "",
    summaryText: () => summary?.textContent ?? "",
  };
}

/** Open the disclosure the way a reader does, and return the full text. */
function opened(p: DecomposeResponse) {
  const r = renderPanel(p);
  fireEvent.click(r.summary as HTMLElement);
  expect(r.details?.open).toBe(true);
  return r;
}

/**
 * A notice of a kind this build has no mark for. The guard passes any string
 * kind so that a backend adding one cannot blank the plan; this is what that
 * notice has to look like when it arrives.
 */
const delisted = (over: Partial<PlanFloorNotice> = {}) =>
  notice({
    kind: "delisted",
    agent_id: "summarize.pro",
    agent_name: "summarize.pro",
    reason: "withdrawn from routing by its operator",
    reason_code: undefined,
    lower_bound_bps: undefined,
    ...over,
  });

describe("ExclusionsPanel · a notice kind this build does not know", () => {
  it("renders it as a row with a neutral mark and the backend's reason", () => {
    const { container, text } = opened(plan({ notices: [delisted()] }));
    const rows = container.querySelectorAll("li");
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row.textContent).toContain("summarize.pro");
    expect(text()).toContain("withdrawn from routing by its operator");
    // Neutral: no tone that files it with a verdict, and no borrowed glyph.
    const badge = row.querySelector("span");
    expect(badge?.textContent).toBe("◇delisted");
    expect(badge?.className).toContain("text-muted");
    expect(row.innerHTML).not.toMatch(/magenta|cyan|violet/);
    expect(row.querySelector('[aria-hidden="true"]')?.textContent).toBe("◇");
  });

  it("names the kind in words, spacing out the backend's token", () => {
    const { container } = opened(
      plan({ notices: [delisted({ kind: "quarantined_by_operator" })] }),
    );
    expect(container.querySelector("li")?.textContent).toContain(
      "quarantined by operator",
    );
  });

  // Collapsed is never hidden: the count a buyer reads with the panel shut
  // has to include it, apart from the kinds this build can name.
  it("counts it in the closed summary, apart from the known kinds", () => {
    const { summaryText } = renderPanel(
      plan({ notices: [notice(), delisted()] }),
    );
    expect(summaryText()).toContain("2 changes");
    expect(summaryText()).toContain("1 excluded");
    expect(summaryText()).toContain("1 other");
  });
});

describe("ExclusionsPanel · when there is nothing to disclose", () => {
  it("renders nothing when the plan carries no notices field", () => {
    const { container } = render(<ExclusionsPanel plan={plan()} />);
    expect(container.innerHTML).toBe("");
  });

  it("renders nothing for an empty notice list", () => {
    const { container } = render(
      <ExclusionsPanel plan={plan({ notices: [] })} />,
    );
    expect(container.innerHTML).toBe("");
  });

  // The runtime guard accepts `notices: null` from the backend even though the
  // type spells it optional, so null has to land on the same branch as absent.
  it("renders nothing when the backend sent a null notice list", () => {
    const nulled = { ...plan(), notices: null } as unknown as DecomposeResponse;
    const { container } = render(<ExclusionsPanel plan={nulled} />);
    expect(container.innerHTML).toBe("");
  });
});

describe("ExclusionsPanel · the disclosure", () => {
  const three = plan({
    notices: [
      notice(),
      notice({
        kind: "substituted",
        agent_id: "ocr.legacy",
        agent_name: "ocr.legacy",
        replacement_id: "design.figma",
        replacement_name: "design.figma",
      }),
      notice({
        kind: "degraded",
        agent_id: "code.next",
        agent_name: "code.next",
        reason: "re-admitted by starvation backstop (4800 < 5500 bps)",
        reason_code: "floor_relaxed",
        lower_bound_bps: 4800,
      }),
    ],
  });

  it("starts collapsed", () => {
    const { details } = renderPanel(three);
    expect(details).not.toBeNull();
    expect(details?.open).toBe(false);
  });

  // The product rule: collapsed is not hidden. Someone who never opens this is
  // still entitled to know exclusions happened before they authorize a payment.
  it("shows the count and the per-kind breakdown while collapsed", () => {
    const { summaryText } = renderPanel(three);
    expect(summaryText()).toContain("3 changes");
    expect(summaryText()).toContain("1 excluded");
    expect(summaryText()).toContain("1 substituted");
    expect(summaryText()).toContain("1 kept below the floor");
  });

  // The backend names up to eight unbound agents on every plan while any
  // registered agent is unbound. Folded into the kinds, an untouched plan
  // would read "8 excluded" under a heading about the floor.
  it("counts unbound agents apart from the floor's changes", () => {
    const unboundNotice = (id: string) =>
      notice({
        agent_id: id,
        agent_name: id,
        reason: "no endpoint bound",
        reason_code: "unbound_endpoint",
        lower_bound_bps: null,
      });
    const { summaryText } = renderPanel(
      plan({
        notices: [notice(), unboundNotice("a.one"), unboundNotice("a.two")],
      }),
    );
    expect(summaryText()).toContain("1 change");
    expect(summaryText()).not.toContain("3 changes");
    expect(summaryText()).toContain("1 excluded");
    expect(summaryText()).toContain("2 with no endpoint bound");
  });

  it("reads no changes when only unbound agents were left out", () => {
    const { summaryText } = renderPanel(
      plan({
        notices: [
          notice({
            reason: "no endpoint bound",
            reason_code: "unbound_endpoint",
            lower_bound_bps: null,
          }),
        ],
      }),
    );
    expect(summaryText()).toContain("no changes");
    expect(summaryText()).toContain("1 with no endpoint bound");
    expect(summaryText()).not.toMatch(/\d+ excluded/);
  });

  it("credits the floor only with what the floor did", () => {
    const unboundOnly = opened(
      plan({
        notices: [
          notice({
            reason: "no endpoint bound",
            reason_code: "unbound_endpoint",
            lower_bound_bps: null,
          }),
        ],
      }),
    );
    expect(unboundOnly.text()).not.toContain("The reputation floor acted on");
    expect(unboundOnly.text()).toContain("never candidates");
    expect(unboundOnly.text()).toContain("the floor did not judge them");
    cleanup();

    const mixed = opened(
      plan({
        notices: [
          notice(),
          notice({
            agent_id: "a.two",
            agent_name: "a.two",
            reason: "no endpoint bound",
            reason_code: "unbound_endpoint",
            lower_bound_bps: null,
          }),
        ],
      }),
    );
    expect(mixed.text()).toContain(
      "The reputation floor acted on some of these agents",
    );
    expect(mixed.text()).toContain("Those marked “no endpoint”");
    cleanup();

    const floorOnly = opened(plan({ notices: [notice()] }));
    expect(floorOnly.text()).toContain(
      "The reputation floor acted on these agents",
    );
    // The intro names the floor for what it is, a statistical lower bound,
    // and no longer claims that nothing below reflects work an agent did.
    expect(floorOnly.text()).toContain(
      "by comparing a statistical lower bound on each agent's reputation against the floor.",
    );
    expect(floorOnly.text()).not.toMatch(/judgement on work|actually did/);
    expect(floorOnly.text()).not.toContain("never candidates");
  });

  it("counts a single change in the singular", () => {
    const { summaryText } = renderPanel(plan({ notices: [notice()] }));
    expect(summaryText()).toContain("1 change");
    expect(summaryText()).not.toContain("1 changes");
  });

  it("expands on click and collapses again", () => {
    const { details, summary } = renderPanel(three);
    fireEvent.click(summary as HTMLElement);
    expect(details?.open).toBe(true);
    fireEvent.click(summary as HTMLElement);
    expect(details?.open).toBe(false);
  });

  // Inside a Card whose title is an h2, so h3 — and inside the summary, which
  // is where the heading has to live for it to survive the collapsed state.
  it("titles itself at the heading level the card leaves free", () => {
    const { summary } = renderPanel(three);
    const heading = screen.getByRole("heading", { level: 3 });
    expect(summary?.contains(heading)).toBe(true);
    expect(heading.textContent).toContain("Reputation floor");
  });

  // Focusable here; that the ring is VISIBLE is a paint question jsdom
  // cannot answer, and e2e/plan-floor.spec.ts measures it in a browser.
  it("puts the disclosure on the keyboard", () => {
    const { summary } = renderPanel(three);
    (summary as HTMLElement).focus();
    expect(document.activeElement).toBe(summary);
  });

  // Meaning never by colour alone: each row carries a glyph and the words as
  // well as the tone, and "degraded" is the backend's word, not a buyer's.
  it("labels each kind in words, not only in tone", () => {
    const { text } = opened(three);
    expect(text()).toContain("excluded");
    expect(text()).toContain("substituted");
    expect(text()).toContain("kept below floor");
  });

  // An agent id is one unbreakable 32-character token and the panel has an
  // explicit 390px acceptance criterion with the disclosure open.
  it("lets a long agent id break rather than overflow", () => {
    const longId = "a".repeat(32);
    const { container } = opened(
      plan({ notices: [notice({ agent_id: longId, agent_name: null })] }),
    );
    const holder = Array.from(container.querySelectorAll("b")).find((el) =>
      el.className.includes("break-all"),
    );
    expect(holder?.textContent).toBe(longId);
  });
});

describe("ExclusionsPanel · one sentence per reason_code", () => {
  // With no count on the notice, the sentence stops at the fact: nothing
  // about why the bound sits there, in either direction.
  it("explains below_floor as a bound under the floor, and nothing more", () => {
    const { text } = opened(
      plan({ notices: [notice({ reason_code: "below_floor" })] }),
    );
    expect(text()).toContain(
      "Its reputation lower bound is below the floor this plan was built against.",
    );
    expect(text()).not.toMatch(/thin evidence|bad work|rests on/);
  });

  // An unbound agent is filtered out of the candidate list before the plan
  // exists. It is passed over in silence — it is not handed work it then fails.
  it("explains unbound_endpoint as never having been a candidate", () => {
    const { text } = opened(
      plan({
        notices: [
          notice({
            reason_code: "unbound_endpoint",
            reason: "no endpoint bound",
            lower_bound_bps: null,
          }),
        ],
      }),
    );
    expect(text()).toContain("registered on-chain but has no endpoint bound");
    expect(text()).toContain("it has not failed anything");
    expect(text()).toContain("never a candidate in the first place");
  });

  it("explains floor_relaxed as a compromise the buyer is being shown", () => {
    const { text } = opened(
      plan({
        notices: [
          notice({
            kind: "degraded",
            reason_code: "floor_relaxed",
            reason: "re-admitted by starvation backstop (4800 < 5500 bps)",
            lower_bound_bps: 4800,
          }),
        ],
      }),
    );
    expect(text()).toContain("The floor was relaxed so this step would still");
    expect(text()).toContain("compromise on this plan's quality");
  });

  // The guard deliberately does not set-check reason_code so that a backend
  // adding a fourth reason cannot blank this panel.
  it("still renders a row for an unrecognised reason_code", () => {
    const unknown = {
      ...notice({ reason: "quarantined by the incident switch" }),
      reason_code: "quarantined",
    } as unknown as PlanFloorNotice;
    const { text } = opened(plan({ notices: [unknown] }));
    expect(text()).toContain("vision.ocr");
    expect(text()).toContain("quarantined by the incident switch");
    expect(text()).toContain("lower bound");
  });

  it("falls back to the backend prose when reason_code is absent", () => {
    const legacy = notice();
    delete legacy.reason_code;
    const { text } = opened(plan({ notices: [legacy] }));
    expect(text()).toContain("below routing floor (4200 < 5500 bps)");
  });

  // Demoted, never dropped: the prose carries the raw basis points an operator
  // matches against a backend log.
  it("keeps the backend prose alongside the buyer-facing sentence", () => {
    const { text } = opened(plan({ notices: [notice({ count: 7 })] }));
    expect(text()).toContain("That bound rests on 7 ratings");
    expect(text()).toContain("below routing floor (4200 < 5500 bps)");
  });
});

describe("ExclusionsPanel · a below-floor row says only what its evidence shows", () => {
  /** The row's buyer-facing sentence: the first paragraph inside the row. */
  const sentence = (n: PlanFloorNotice) => {
    const { container } = opened(plan({ notices: [n] }));
    return container.querySelector("li p")?.textContent ?? "";
  };
  const OPENING =
    "Its reputation lower bound is below the floor this plan was built against.";

  it("calls a bound on a single rating thin evidence", () => {
    expect(sentence(notice({ count: 1, dispute_rate_bps: 0 }))).toBe(
      `${OPENING} That bound rests on a single rating, so the evidence behind it is thin.`,
    );
  });

  // The reference agent the old copy got wrong: dispatches that timed out,
  // rated 20/100 on-chain, many times. Not thin, and not excused.
  it("describes a bound on many ratings as that record, not as thin evidence", () => {
    const s = sentence(notice({ count: 9, dispute_rate_bps: 0 }));
    expect(s).toBe(
      `${OPENING} That bound rests on 9 ratings, and that record, read conservatively, falls short of the floor.`,
    );
    expect(s).not.toMatch(/thin|rather than/);
  });

  it("states a non-zero dispute rate as such", () => {
    expect(sentence(notice({ count: 7, dispute_rate_bps: 1428 }))).toContain(
      "falls short of the floor. 14.3% of those ratings were disputes.",
    );
  });

  it("says a bound on no ratings is the starting estimate", () => {
    expect(sentence(notice({ count: 0, dispute_rate_bps: 0 }))).toContain(
      "That bound rests on no ratings: it is the starting estimate an unrated agent is credited with",
    );
  });

  it("says nothing about cause when the count is null or unread", () => {
    for (const count of [null, undefined]) {
      expect(sentence(notice({ count, dispute_rate_bps: 2500 }))).toBe(OPENING);
      cleanup();
    }
  });

  it("never claims bad work, or its absence, at any count", () => {
    for (const count of [null, 0, 1, 2, 40]) {
      for (const rate of [0, 5000]) {
        const s = sentence(notice({ count, dispute_rate_bps: rate }));
        expect(s).not.toMatch(/bad work|not a judgement|rather than|poor/i);
        cleanup();
      }
    }
  });

  // The fresh-read case is not a verdict under the floor, so its evidence
  // is not worded as one: the sentence is exactly what it was.
  it("leaves an awaiting-fresh-read row's sentence unchanged by its evidence", () => {
    expect(
      sentence(
        notice({
          lower_bound_bps: 6100,
          awaiting_fresh_read: true,
          count: 9,
          dispute_rate_bps: 1111,
        }),
      ),
    ).toBe(
      "It was rated since its last reputation read, so it is held off routing until a fresh read answers. The bound below is from before that rating, so it is not a verdict that the agent sits under the floor.",
    );
  });
});

describe("ExclusionsPanel · the deciding numbers", () => {
  // Matched with their labels attached, because the buyer-facing sentence for
  // below_floor contains the words "reputation lower bound" too — a bare
  // substring check would pass on the prose and prove nothing about the data.
  it("renders the bound against the floor on the 0–5 scale", () => {
    const { text } = opened(plan({ notices: [notice()] }));
    expect(text()).toContain("lower bound 2.10");
    expect(text()).toContain("floor 2.75");
  });

  it("falls back to the plan's floor when the notice omits its own", () => {
    const n = notice();
    delete n.floor_bps;
    const { text } = opened(plan({ notices: [n], floor_bps: FLOOR_BPS }));
    expect(text()).toContain("2.75");
  });

  // The assertion this panel exists to protect. On a floor notice, no entry is
  // an absence of ratings, not a score of zero, and an agent with no entry
  // PASSES the floor.
  it("renders a floor notice's null lower bound as an absence, never as 0.00", () => {
    const { text } = opened(
      plan({
        notices: [
          notice({ reason_code: "below_floor", lower_bound_bps: null }),
        ],
      }),
    );
    expect(text()).toContain("none on record");
    expect(text()).toContain("No reputation entry exists for this agent");
    expect(text()).toContain("not a score of zero");
    expect(text()).toContain("does not put an agent under the floor");
    expect(text()).not.toContain("0.00");
  });

  // An unbound agent's null is deliberate: its standing was never consulted,
  // so "no reputation entry" would be a claim about ratings nobody looked at —
  // false for any unbound agent with a rating history.
  it("never calls an unbound agent unrated", () => {
    const { text } = opened(
      plan({
        notices: [
          notice({
            reason_code: "unbound_endpoint",
            reason: "no endpoint bound",
            lower_bound_bps: null,
          }),
        ],
      }),
    );
    expect(text()).not.toContain("No reputation entry exists");
    expect(text()).not.toMatch(/absence of ratings/i);
    expect(text()).not.toContain("0.00");
    expect(text()).toContain("registered on-chain but has no endpoint bound");
  });

  // It arrives as kind "excluded", but a magenta "✕ excluded" would file it
  // with the floor's verdicts. The row wears its own words instead.
  it("marks an unbound row in its own words, not as a floor exclusion", () => {
    const { container } = opened(
      plan({
        notices: [
          notice({
            reason_code: "unbound_endpoint",
            reason: "no endpoint bound",
            lower_bound_bps: null,
          }),
        ],
      }),
    );
    const row = container.querySelector("li");
    expect(row?.textContent).toContain("no endpoint");
    expect(row?.textContent).not.toMatch(/excluded/i);
    expect(row?.innerHTML).not.toContain("magenta");
  });

  // Nothing was decided on numbers, so none are printed — not "none on
  // record", and not the floor, which would imply a comparison that never ran.
  it("prints no deciding numbers on an unbound row", () => {
    const { text } = opened(
      plan({
        notices: [
          notice({
            reason_code: "unbound_endpoint",
            reason: "no endpoint bound",
            lower_bound_bps: null,
            floor_bps: FLOOR_BPS,
          }),
        ],
      }),
    );
    expect(text()).not.toMatch(/lower bound (none on record|\d)/);
    expect(text()).not.toContain("none on record");
    expect(text()).not.toContain("floor 2.75");
  });

  // Absent is not null: a backend predating the field told us nothing, and
  // there is nothing honest to say about a number we were never given.
  it("says nothing about a bound the backend never sent", () => {
    const n = notice();
    delete n.lower_bound_bps;
    const { text } = opened(plan({ notices: [n] }));
    expect(text()).not.toMatch(/lower bound (none on record|\d)/);
    expect(text()).not.toContain("No reputation entry exists");
    expect(text()).toContain("floor 2.75");
  });

  it("drops the numbers row entirely when no floor is known either", () => {
    const n = notice();
    delete n.lower_bound_bps;
    delete n.floor_bps;
    const bare = plan({ notices: [n] });
    delete bare.floor_bps;
    const { text } = opened(bare);
    expect(text()).not.toMatch(/lower bound (none on record|\d)/);
    expect(text()).not.toContain("floor 2.75");
  });
});

describe("ExclusionsPanel · substitutions", () => {
  it("names both agents and makes the direction unambiguous", () => {
    const { text } = opened(
      plan({
        notices: [
          notice({
            kind: "substituted",
            agent_name: "vision.ocr",
            replacement_name: "design.figma",
            replacement_id: "design.figma",
          }),
        ],
      }),
    );
    expect(text()).toContain("vision.ocr replaced by design.figma");
  });

  it("falls back to ids when neither side was named", () => {
    const { text } = opened(
      plan({
        notices: [
          notice({
            kind: "substituted",
            agent_name: null,
            agent_id: "agt_out",
            replacement_name: null,
            replacement_id: "agt_in",
          }),
        ],
      }),
    );
    expect(text()).toContain("agt_out replaced by agt_in");
  });

  // A substitution whose replacement we cannot name is not one we describe —
  // "replaced by another agent" is a claim with nothing behind it.
  it("claims no replacement when the backend named none", () => {
    const { text } = opened(
      plan({
        notices: [
          notice({
            kind: "substituted",
            replacement_id: null,
            replacement_name: null,
          }),
        ],
      }),
    );
    expect(text()).not.toContain("replaced by");
    expect(text()).toContain("vision.ocr");
  });
});

describe("ExclusionsPanel · wording that must never regress", () => {
  /** Each of these has been shipped wrongly somewhere in this codebase. */
  const FORBIDDEN: RegExp[] = [
    /\bbeing routed\b/i,
    /\bwill be routed\b/i,
    /\bwilson\b/i,
    /\bwill fail\b/i,
    /\bfails\b/i,
  ];

  const everyReason = plan({
    notices: [
      notice({ reason_code: "below_floor" }),
      notice({
        kind: "substituted",
        reason_code: "below_floor",
        replacement_id: "design.figma",
        replacement_name: "design.figma",
      }),
      notice({
        reason_code: "unbound_endpoint",
        reason: "no endpoint bound",
        lower_bound_bps: null,
      }),
      notice({
        kind: "degraded",
        reason_code: "floor_relaxed",
        reason: "re-admitted by starvation backstop (4800 < 5500 bps)",
        lower_bound_bps: 4800,
      }),
    ],
  });

  // Collapsed, only the <summary> is on screen. jsdom keeps a closed
  // <details> body in `textContent`, so the collapsed claim is read off the
  // summary — and the rows are asserted to be outside it, so this cannot pass
  // by reading the same text as the open case below.
  it("says none of it while collapsed", () => {
    const { details, summary, summaryText } = renderPanel(everyReason);
    expect(details?.open).toBe(false);
    for (const bad of FORBIDDEN) expect(summaryText()).not.toMatch(bad);
    const rows = details?.querySelectorAll("li") ?? [];
    expect(rows.length).toBeGreaterThan(0);
    for (const row of Array.from(rows)) {
      expect(summary?.contains(row)).toBe(false);
    }
    expect(summaryText()).not.toContain("starvation backstop");
  });

  it("says none of it with every reason on screen", () => {
    const { text } = opened(everyReason);
    for (const bad of FORBIDDEN) expect(text()).not.toMatch(bad);
  });

  // The blunt regexes above cannot tell "it has not failed anything" from an
  // accusation, so failure may only ever appear as a denial of one.
  it("mentions failure only to deny it", () => {
    const { text } = opened(everyReason);
    const mentions = Array.from(text().matchAll(/(.{0,24})\bfail\w*/gi));
    expect(mentions.length).toBeGreaterThan(0);
    for (const m of mentions) expect(m[1]).toMatch(/\b(not|never|no)\b/i);
  });
});

describe("ExclusionsPanel — an agent awaiting a fresh reputation read", () => {
  // The backend holds an agent off when a rating landed since its last read
  // (finding S8). Its bound is the PRE-rating one and can clear the floor —
  // 6100 against 5500 here — while the code still says below_floor.
  const held = notice({
    reason:
      "rated since its last reputation read (6100 bps), so held off routing until a fresh read answers (floor 5500 bps)",
    lower_bound_bps: 6100,
    awaiting_fresh_read: true,
  });

  it("says it is held for a fresh read, and never that its bound is under the floor", () => {
    const { text } = opened(plan({ notices: [held] }));
    expect(text()).toContain(
      "It was rated since its last reputation read, so it is held off routing until a fresh read answers.",
    );
    expect(text()).toContain("last read lower bound");
    expect(text()).not.toContain("is below the floor");
    // The backend's own sentence still renders for an operator.
    expect(text()).toContain(
      "held off routing until a fresh read answers (floor 5500 bps)",
    );
  });

  it("keeps the below-floor sentence for a notice without the flag", () => {
    const { text } = opened(
      plan({ notices: [notice({ awaiting_fresh_read: false })] }),
    );
    expect(text()).toContain("is below the floor this plan was built against");
    expect(text()).not.toContain("last read lower bound");
  });
});
