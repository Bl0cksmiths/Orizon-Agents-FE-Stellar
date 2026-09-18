// @vitest-environment jsdom
/**
 * Unit tests for PlannerFallbackNotice.
 *
 * The notice tells a buyer that the plan they are about to pay for was not
 * written by the planner. Like the reputation banner's suite, these are
 * written against what it says and when, not against its markup — a refactor
 * should be free, a changed claim should not.
 *
 * Assertions are plain DOM checks — this repo does not install jest-dom.
 */

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import type { DecomposeResponse } from "@/lib/types";
import {
  isPlannerFallback,
  PLANNER_FALLBACK_NOTICE_ID,
  PlannerFallbackNotice,
} from "./planner-fallback-notice";

afterEach(cleanup);

/** The one-step plan the backend serves when the planner comes back empty:
 *  its preferred fallback agent, carrying the rationale it is stamped with. */
function planFixture(over: Partial<DecomposeResponse> = {}): DecomposeResponse {
  return {
    plan_id: "pln_fallback",
    intent: "write a launch announcement for a budgeting app",
    steps: [
      {
        agent_id: "agt_01h8",
        agent_name: "copywrite.v3",
        rationale: "fallback: generate copy for the intent",
        est_price_usdc: 0.012,
        est_eta_seconds: 0.8,
        rep_bps: 8714,
        rep_source: "onchain",
      },
    ],
    total_usdc: 0.012,
    total_eta: 0.8,
    floor_bps: 5500,
    reputation_degraded: false,
    ...over,
  };
}

describe("PlannerFallbackNotice — when it renders at all", () => {
  it("renders when the plan is the backend's fallback", () => {
    render(
      <PlannerFallbackNotice plan={planFixture({ planner_fallback: true })} />,
    );
    expect(screen.getByRole("status").textContent).not.toBe("");
  });

  it("renders nothing on the planner's own plan", () => {
    const { container } = render(
      <PlannerFallbackNotice plan={planFixture({ planner_fallback: false })} />,
    );
    expect(container.innerHTML).toBe("");
  });

  // Older backends omit the field. Not knowing how a plan was built is not
  // grounds for telling the buyer the planner never saw it.
  it("renders nothing when the flag is absent", () => {
    const { container } = render(
      <PlannerFallbackNotice plan={planFixture()} />,
    );
    expect(container.innerHTML).toBe("");
  });

  // The same test Authorize uses to decide whether to name the notice, so the
  // button can never point at an id that is not on the page.
  it("reports the notice as shown only for an explicit true", () => {
    expect(isPlannerFallback(planFixture({ planner_fallback: true }))).toBe(
      true,
    );
    expect(isPlannerFallback(planFixture({ planner_fallback: false }))).toBe(
      false,
    );
    expect(isPlannerFallback(planFixture())).toBe(false);
  });

  // A one-step plan is not evidence of a fallback: the planner may decide one
  // step is enough. Only the flag says who built it.
  it("does not infer a fallback from a one-step plan", () => {
    const plan = planFixture({ planner_fallback: false });
    expect(plan.steps).toHaveLength(1);
    const { container } = render(<PlannerFallbackNotice plan={plan} />);
    expect(container.innerHTML).toBe("");
  });
});

describe("PlannerFallbackNotice — what it says", () => {
  /** Everything the notice announces, as a screen reader would hear it. */
  function renderNotice() {
    render(
      <PlannerFallbackNotice plan={planFixture({ planner_fallback: true })} />,
    );
    return screen.getByRole("status").textContent ?? "";
  }

  it("says the planner was unavailable and the steps are a minimal fallback", () => {
    const text = renderNotice();
    expect(text).toContain("The planner was unavailable for this request");
    expect(text).toContain("not decomposed from your intent");
    expect(text).toContain("minimal fallback plan");
  });

  // The fallback is still a routing decision, and it is held to the same
  // checks as a planned step. Saying so is what keeps "fallback" from reading
  // as "unchecked".
  it("says the fallback only uses agents that passed the routing checks", () => {
    expect(renderNotice()).toContain(
      "built only from agents that passed the routing checks",
    );
  });

  it("hands the choice back: authorize it, or run the intent again", () => {
    const text = renderNotice();
    expect(text).toContain("You can authorize it as it stands");
    expect(text).toContain("run the same intent through the planner again");
  });
});

describe("PlannerFallbackNotice — claims it must not make", () => {
  function renderNotice() {
    render(
      <PlannerFallbackNotice plan={planFixture({ planner_fallback: true })} />,
    );
    return screen.getByRole("status").textContent ?? "";
  }

  // The backend never sends the provider's error, so any cause named here
  // would be a guess presented as a diagnosis.
  it("names no cause for the outage", () => {
    expect(renderNotice()).not.toMatch(
      /rate.?limit|quota|timed? ?out|openai|anthropic|provider|model is|api key|\b[45]\d\d\b/i,
    );
  });

  // Nobody here knows when the planner is back. Asking again is offered; a
  // clock is not.
  it("promises no recovery and sets no clock", () => {
    expect(renderNotice()).not.toMatch(
      /soon|shortly|in a (minute|moment)|momentarily|will (work|succeed|recover)|restored|back up/i,
    );
  });

  // Minimal is not broken, and the routing checks ran. This is information,
  // not a warning, and it must not steer the buyer off a valid plan.
  it("does not alarm the buyer or steer them off the plan", () => {
    expect(renderNotice()).not.toMatch(
      /warning|unsafe|risky|do not (authorize|proceed)|don't (authorize|proceed)|we recommend|you should not|cancel/i,
    );
  });

  // "Degraded" is already spent twice on this card: the starvation backstop's
  // re-admission, and the failed-read flag behind the reputation banner. A
  // third meaning within a few hundred pixels is one too many.
  it("never uses a word the card already spends on something else", () => {
    render(
      <PlannerFallbackNotice plan={planFixture({ planner_fallback: true })} />,
    );
    expect(screen.getByRole("status").outerHTML).not.toMatch(/degraded/i);
  });
});

describe("PlannerFallbackNotice — how it is announced and structured", () => {
  const renderShown = () =>
    render(
      <PlannerFallbackNotice
        plan={planFixture({ planner_fallback: true })}
        onReplan={() => {}}
      />,
    );

  // Informational, so polite. An assertive alert would cut a screen reader
  // off mid-plan to say something that is not urgent.
  it("announces politely and never as an alert", () => {
    renderShown();
    expect(screen.getByRole("status")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  // The card's own "Execution plan" is the h2 this sits under.
  it("heads the notice at h3, under the card heading", () => {
    renderShown();
    const heading = screen.getByRole("heading", { level: 3 });
    expect(heading.textContent).toBe("Built without the planner");
  });

  // Authorize names this id in `aria-describedby`. It has to sit on the
  // status region itself, or the description would be a fragment of it.
  it("carries the id the Authorize control is described by", () => {
    renderShown();
    expect(screen.getByRole("status").id).toBe(PLANNER_FALLBACK_NOTICE_ID);
    expect(
      document.querySelectorAll(`#${PLANNER_FALLBACK_NOTICE_ID}`),
    ).toHaveLength(1);
  });

  // Meaning is never carried by the violet alone: the glyph is decorative
  // and the word beside it does the work.
  it("pairs its glyph with a word, and hides the glyph from readers", () => {
    renderShown();
    const status = screen.getByRole("status");
    const glyph = status.querySelector('[aria-hidden="true"]');
    expect(glyph?.textContent).toBe("↳");
    expect(status.textContent).toContain("fallback plan");
  });
});
