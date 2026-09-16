// @vitest-environment jsdom
/**
 * Unit tests for DegradedBanner.
 *
 * This is the last thing a buyer reads before authorizing an on-chain payment
 * against scores nobody verified, so the tests are written against the words it
 * says and the claims it refuses to make — not against its markup. A refactor
 * should be free; a changed claim should not be.
 *
 * Three of these guard mistakes that are cheap to reintroduce by accident:
 *
 *   - The copy must never contain "degraded". On this card that word already
 *     means "re-admitted below the floor by the starvation backstop", on both
 *     `PlanStep.degraded` and a floor notice with `kind === "degraded"` — an
 *     evidence-based decision, and the opposite of an unread score. The
 *     component is named for the field it reads; the copy must not be.
 *   - A plan with a `degraded` STEP and healthy reads renders nothing. Those
 *     two fields differ by one word and mean unrelated things.
 *   - An absent flag is not a failed read. Backends predating story 3.03 omit
 *     the field entirely, and "we do not know" must never render as "it broke".
 *
 * Assertions are plain DOM checks — this repo does not install jest-dom.
 */

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import type { DecomposeResponse } from "@/lib/types";
import { DegradedBanner } from "./degraded-banner";

afterEach(cleanup);

/** A plan that is entirely ordinary apart from whatever a test overrides. */
function planFixture(over: Partial<DecomposeResponse> = {}): DecomposeResponse {
  return {
    plan_id: "pln_test",
    intent: "summarise this quarter's filings",
    steps: [
      {
        agent_id: "agt_summariser",
        agent_name: "Summariser",
        rationale: "best fit for long-document summarisation",
        est_price_usdc: 0.25,
        est_eta_seconds: 12,
        rep_bps: 5677,
        rep_source: "prior",
      },
    ],
    total_usdc: 0.25,
    total_eta: 12,
    floor_bps: 5500,
    ...over,
  };
}

/** Everything the banner rendered, as a screen reader would hear it. */
function bannerText(): string {
  return screen.getByRole("status").textContent ?? "";
}

describe("DegradedBanner — when it renders at all", () => {
  it("renders only when a reputation read actually failed", () => {
    render(
      <DegradedBanner plan={planFixture({ reputation_degraded: true })} />,
    );
    expect(bannerText()).not.toBe("");
  });

  it("renders nothing when every read succeeded", () => {
    const { container } = render(
      <DegradedBanner plan={planFixture({ reputation_degraded: false })} />,
    );
    expect(container.innerHTML).toBe("");
  });

  // Older backends omit the field. Not knowing whether the reads held is not
  // grounds for telling a buyer their protection lapsed.
  it("renders nothing when the flag is absent", () => {
    const { container } = render(<DegradedBanner plan={planFixture()} />);
    expect(container.innerHTML).toBe("");
  });

  it("renders nothing when the flag is explicitly undefined", () => {
    const { container } = render(
      <DegradedBanner plan={planFixture({ reputation_degraded: undefined })} />,
    );
    expect(container.innerHTML).toBe("");
  });

  // The field-confusion guard. A step re-admitted by the starvation backstop is
  // a decision made ON evidence; this banner is about the absence of evidence.
  it("ignores a step flagged by the starvation backstop", () => {
    const plan = planFixture();
    plan.steps[0].degraded = true;
    plan.notices = [
      {
        kind: "degraded",
        agent_id: "agt_summariser",
        reason: "re-admitted below routing floor (4200 < 5500 bps)",
      },
    ];

    const { container } = render(<DegradedBanner plan={plan} />);
    expect(container.innerHTML).toBe("");
  });
});

describe("DegradedBanner — what it says", () => {
  function renderBanner() {
    render(
      <DegradedBanner plan={planFixture({ reputation_degraded: true })} />,
    );
    return bannerText();
  }

  it("says the scores are estimates rather than a reading of the chain", () => {
    const text = renderBanner();
    expect(text).toContain(
      "At least one reputation read behind this plan failed",
    );
    expect(text).toContain("the estimate every agent starts with");
    expect(text).toContain("not a reading of that agent's on-chain history");
  });

  it("says the floor stopped deciding on evidence for this plan", () => {
    const text = renderBanner();
    expect(text).toContain("The network floor still ran");
    expect(text).toContain("It did not filter on evidence here");
    expect(text).toContain("can be routed while the read is failing");
  });

  it("says the buyer is about to pay against those estimates", () => {
    expect(renderBanner()).toContain(
      "You are about to authorize payment against estimated scores",
    );
  });

  // The naming hazard, pinned. Three meanings of one word on one screen is how
  // a buyer stops trusting any of them — and the attribute check catches a
  // stray test id or aria-label as well as visible prose.
  it("never uses the word the rest of this card already spent", () => {
    render(
      <DegradedBanner plan={planFixture({ reputation_degraded: true })} />,
    );
    expect(screen.getByRole("status").outerHTML).not.toMatch(/degraded/i);
  });
});

describe("DegradedBanner — claims it must not make", () => {
  function renderBanner() {
    render(
      <DegradedBanner plan={planFixture({ reputation_degraded: true })} />,
    );
    return bannerText();
  }

  // Nobody can say when an RPC outage ends, so nothing here may imply a clock.
  it("promises no recovery and tells nobody to wait", () => {
    expect(renderBanner()).not.toMatch(
      /soon|shortly|temporar|try again|check back|come back|momentarily|restored|will recover|once .{0,20}recover/i,
    );
  });

  // The agents may be excellent. We could not check — which is a fact about our
  // read, not about them or their operators.
  it("blames neither the agents nor their operators", () => {
    const text = renderBanner();
    expect(text).not.toMatch(
      /untrustworthy|unreliable|low[- ]quality|risky|suspicious|bad actor|fault of|blame/i,
    );
    expect(text).toContain("not a finding about the agents in this plan");
    expect(text).toContain("The failure is on our side of the read");
  });

  // It states what is true and hands the decision back. Talking a buyer out of
  // a payment we are unable to evaluate is not ours to do.
  it("states the position without steering the buyer off it", () => {
    const text = renderBanner();
    expect(text).not.toMatch(
      /do not (proceed|authorize|continue)|don't (proceed|authorize)|avoid |we recommend|you should not|cancel/i,
    );
    expect(text).toContain("yours to decide");
  });
});

describe("DegradedBanner — how it is announced and structured", () => {
  it("announces politely rather than interrupting the plan", () => {
    render(
      <DegradedBanner plan={planFixture({ reputation_degraded: true })} />,
    );
    // Assertive would cut a screen reader off mid-plan on every render. The
    // banner sits in document order above the Authorize control instead, so
    // it cannot be walked past.
    expect(screen.getByRole("status")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  // The card's own "Execution plan" is the h2 this sits under.
  it("heads the banner at h3, under the card heading", () => {
    render(
      <DegradedBanner plan={planFixture({ reputation_degraded: true })} />,
    );
    const heading = screen.getByRole("heading", { level: 3 });
    expect(heading.textContent).toBe("Reputation could not be read");
  });

  // Meaning is never carried by the magenta alone: the glyph is decorative and
  // the words beside it do the work.
  it("pairs the warning glyph with a word, and hides the glyph from readers", () => {
    render(
      <DegradedBanner plan={planFixture({ reputation_degraded: true })} />,
    );
    const status = screen.getByRole("status");
    const glyph = status.querySelector('[aria-hidden="true"]');
    expect(glyph?.textContent).toBe("⚠");
    expect(bannerText()).toContain("unverified");
  });
});
