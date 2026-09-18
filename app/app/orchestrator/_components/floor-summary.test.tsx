// @vitest-environment jsdom
/**
 * Unit tests for FloorSummary.
 *
 * This line is the last thing a buyer reads before authorizing payment, so
 * the tests are written against the claims it makes rather than its markup:
 * a refactor is free, a changed claim is not.
 *
 * Four of these guard a claim that is cheap to get wrong by accident:
 *
 *   - The floor is whatever the backend applied. A hardcoded 5500 would pass
 *     a single-fixture suite, so a second floor is asserted to move with it,
 *     and a floor of 0 is asserted to still render — `if (!floor_bps)` is the
 *     obvious tightening and it is a bug.
 *   - No floor in the payload means no card. Narrating a threshold nobody
 *     applied is worse than saying nothing.
 *   - No count may read as a fraction. The response does not contain the size
 *     of the eligible set, so "N of M cleared the floor" would be invented;
 *     the regex below fails the moment anyone writes one.
 *   - Nothing may say an agent is being routed, or that a passed-over agent
 *     failed anything. Both are wordings this codebase has shipped wrongly
 *     before.
 *
 * Assertions are plain DOM checks — this repo does not install jest-dom.
 */

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import type { DecomposeResponse, PlanFloorNotice, PlanStep } from "@/lib/types";
import { FloorSummary } from "./floor-summary";

afterEach(cleanup);

/** 2.75 on the 0–5 scale the card prints — the backend's own default. */
const FLOOR_BPS = 5500;

function step(over: Partial<PlanStep> = {}): PlanStep {
  return {
    agent_id: "agt_summarise",
    agent_name: "Summarise",
    rationale: "condense the filing",
    est_price_usdc: 0.12,
    est_eta_seconds: 4.5,
    ...over,
  };
}

function notice(over: Partial<PlanFloorNotice> = {}): PlanFloorNotice {
  return {
    kind: "excluded",
    agent_id: "agt_cheap",
    agent_name: "Cheap",
    reason: "below routing floor (4200 < 5500 bps)",
    reason_code: "below_floor",
    lower_bound_bps: 4200,
    floor_bps: FLOOR_BPS,
    ...over,
  };
}

function plan(over: Partial<DecomposeResponse> = {}): DecomposeResponse {
  return {
    plan_id: "plan_7f3a",
    intent: "summarise the filing and price it",
    steps: [step(), step({ agent_id: "agt_price", agent_name: "Price" })],
    total_usdc: 0.42,
    total_eta: 12.5,
    floor_bps: FLOOR_BPS,
    ...over,
  };
}

/** Everything the card says, as one string. */
function text(over: Partial<DecomposeResponse> = {}): string {
  const { container } = render(<FloorSummary plan={plan(over)} />);
  return container.textContent ?? "";
}

/** The plan-level disclosure that the backstop fired. */
const RELAXED = /built under a relaxed floor/i;

describe("FloorSummary — the applied floor", () => {
  it("prints the floor on the 0–5 scale, not in basis points", () => {
    const shown = text();
    expect(shown).toContain("2.75");
    expect(shown).not.toContain("5500");
  });

  it("follows the floor the backend sent rather than a baked-in default", () => {
    const shown = text({ floor_bps: 6000 });
    expect(shown).toContain("3.00");
    expect(shown).not.toContain("2.75");
  });

  it("still renders a floor of zero — a real, configurable floor", () => {
    expect(text({ floor_bps: 0 })).toContain("0.00");
  });

  it("renders nothing when the response carries no floor", () => {
    const { container } = render(
      <FloorSummary plan={plan({ floor_bps: undefined })} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("heads the section at h3, under the card's h2", () => {
    render(<FloorSummary plan={plan()} />);
    expect(screen.getByRole("heading", { level: 3 }).textContent).toMatch(
      /routing floor/i,
    );
  });

  it("names the lower bound as the number compared, without naming the statistic", () => {
    const shown = text();
    expect(shown).toContain("lower bound");
    expect(shown).toContain("never its headline score");
  });
});

describe("FloorSummary — what it counts", () => {
  it("states the steps planned and the agents the floor acted on", () => {
    expect(text({ notices: [notice()] })).toContain(
      "2 steps planned · the floor acted on 1 agent",
    );
  });

  it("says the floor acted on no agents rather than printing a bare zero", () => {
    const shown = text({ notices: [] });
    expect(shown).toContain("the floor acted on no agents");
    expect(shown).not.toContain("0 agents");
  });

  it("counts agents, not notice rows, when one agent draws two notices", () => {
    const shown = text({
      notices: [
        notice({ agent_id: "agt_cheap" }),
        notice({
          kind: "substituted",
          agent_id: "agt_cheap",
          replacement_id: "agt_price",
          reason: "replaced by a higher-scoring agent",
        }),
      ],
    });
    expect(shown).toContain("the floor acted on 1 agent");
  });

  // Per reason code, because the notices array carries more than the floor's
  // actions: an unbound agent was never a candidate, so it is no part of what
  // the floor did. A legacy notice without a code predates unbound reporting
  // and was always a floor action.
  it.each([
    ["a below_floor notice", 1, "below_floor"],
    ["a floor_relaxed notice", 1, "floor_relaxed"],
    ["an unbound_endpoint notice", 0, "unbound_endpoint"],
    ["a legacy notice with no reason_code", 1, undefined],
  ] as const)("counts %s as %i floor action(s)", (_name, acted, code) => {
    const n = notice({ reason_code: code });
    if (code === undefined) delete n.reason_code;
    expect(text({ notices: [n] })).toContain(
      acted === 0
        ? "the floor acted on no agents"
        : "the floor acted on 1 agent",
    );
  });

  it("singularises a one-step plan", () => {
    expect(text({ steps: [step()] })).toContain("1 step planned");
  });

  it("never states a count as a fraction of a denominator it does not have", () => {
    // `steps.length` is how many agents were SELECTED and `notices.length` is
    // how many the floor acted on; neither is the size of the eligible set,
    // which the response never sends. Any "N of M" here is invented.
    const fraction = /\b\d+(?:\.\d+)?\s*(?:\/|out of|of)\s*\d/i;
    expect(text({ notices: [notice()] })).not.toMatch(fraction);
    expect(text({ notices: [] })).not.toMatch(fraction);
  });

  /**
   * The eligibility-versus-selection sentence moved to the exclusions panel,
   * which says it beside the agents it applies to. What must remain true HERE
   * is the structural half of the same claim: the two counts are reported as
   * two independent figures and never joined into a ratio. A fraction would
   * assert a denominator — how many agents cleared the floor — that this
   * response does not carry, and a buyer reading "2 of 6" would believe a
   * number nobody computed.
   */
  it("never joins the two counts into a ratio", () => {
    const shown = text({ notices: [notice(), notice({ agent_id: "b" })] });
    expect(shown).toMatch(/steps planned/);
    expect(shown).toMatch(/the floor acted on/);
    expect(shown).not.toMatch(/\b\d+(?:\.\d+)?\s*(?:\/|out of|of)\s*\d/i);
  });
});

describe("FloorSummary — the relaxed floor", () => {
  it("discloses a relaxed floor when a notice arrives with kind degraded", () => {
    const shown = text({
      notices: [
        notice({
          kind: "degraded",
          reason_code: "floor_relaxed",
          reason: "re-admitted below the floor by the starvation backstop",
        }),
      ],
    });
    expect(shown).toMatch(RELAXED);
    expect(shown).toContain("less protection");
  });

  it("discloses it from kind alone, as an older backend sends it", () => {
    // `reason_code` is optional on the wire; `kind` has always been sent.
    const { reason_code: _drop, ...older } = notice({ kind: "degraded" });
    expect(text({ notices: [older] })).toMatch(RELAXED);
  });

  it("discloses it from reason_code alone — kind and reason_code are orthogonal", () => {
    const shown = text({
      notices: [notice({ kind: "excluded", reason_code: "floor_relaxed" })],
    });
    expect(shown).toMatch(RELAXED);
  });

  it("stays silent about relaxation when the floor held", () => {
    expect(text({ notices: [] })).not.toMatch(RELAXED);
    expect(text()).not.toMatch(RELAXED);
    expect(
      text({
        notices: [
          notice(),
          notice({
            kind: "substituted",
            agent_id: "agt_slow",
            replacement_id: "agt_price",
            reason: "replaced by a higher-scoring agent",
          }),
        ],
      }),
    ).not.toMatch(RELAXED);
  });
});

describe("FloorSummary — wording that has been wrong before", () => {
  const states: Array<[string, Partial<DecomposeResponse>]> = [
    ["a clean plan", {}],
    ["no notices at all", { notices: [] }],
    ["an exclusion", { notices: [notice()] }],
    [
      "a substitution",
      {
        notices: [
          notice({
            kind: "substituted",
            replacement_id: "agt_price",
            reason: "replaced by a higher-scoring agent",
          }),
        ],
      },
    ],
    [
      "a relaxed floor",
      {
        notices: [
          notice({ kind: "degraded", reason_code: "floor_relaxed" }),
          notice(),
        ],
      },
    ],
    ["a single step", { steps: [step()] }],
  ];

  it.each(states)("never says an agent is being routed — %s", (_name, over) => {
    expect(text(over)).not.toMatch(/being routed|will be routed/i);
  });

  it.each(states)("never names the statistic — %s", (_name, over) => {
    expect(text(over)).not.toMatch(/wilson/i);
  });

  it.each(states)(
    "never suggests a passed-over agent failed work — %s",
    (_name, over) => {
      // An agent under the floor is passed over while the plan is built. It
      // is never sent work, so it cannot have failed any — and the honest
      // wording is "passed over", not a denial of a failure nobody claimed.
      expect(text(over)).not.toMatch(/fail/i);
    },
  );

  /**
   * "Passed over or replaced, before any work was assigned" moved to the
   * exclusions panel's intro, where it sits next to the agents it describes.
   * The invariant that has to hold in this component is the narrower one it
   * was protecting: nothing here may suggest an agent the floor acted on
   * delivered badly. The floor runs while the plan is built, so no agent it
   * touched was ever asked to do anything — saying otherwise would put a
   * performance accusation on a screen the agent's operator never sees.
   */
  it("never attributes a floor action to work an agent did", () => {
    const shown = text({ notices: [notice()] });
    expect(shown).not.toMatch(/fail/i);
    expect(shown).not.toMatch(/deliver|poor|bad work|underperform/i);
  });
});
