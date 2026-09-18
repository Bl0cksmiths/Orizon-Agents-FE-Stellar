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

  it("puts the disclosure on the keyboard with the shared focus ring", () => {
    const { summary } = renderPanel(three);
    (summary as HTMLElement).focus();
    expect(document.activeElement).toBe(summary);
    expect(summary?.className).toContain("focus-visible:ring-cyan");
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
  it("explains below_floor as thin evidence rather than bad work", () => {
    const { text } = opened(
      plan({ notices: [notice({ reason_code: "below_floor" })] }),
    );
    expect(text()).toContain(
      "Its reputation lower bound is below the floor this plan was built against",
    );
    expect(text()).toContain("thin evidence rather than bad work");
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
    const { text } = opened(plan({ notices: [notice()] }));
    expect(text()).toContain("thin evidence rather than bad work");
    expect(text()).toContain("below routing floor (4200 < 5500 bps)");
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

  it("says none of it while collapsed", () => {
    const { text } = renderPanel(everyReason);
    for (const bad of FORBIDDEN) expect(text()).not.toMatch(bad);
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
