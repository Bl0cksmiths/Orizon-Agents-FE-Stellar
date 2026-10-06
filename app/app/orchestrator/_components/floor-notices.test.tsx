// @vitest-environment jsdom
/**
 * The floor summary and the exclusions panel count the same notice array, one
 * above the steps and one below them. These pin that they count it with one
 * rule: a buyer who reads "the floor acted on no agents" above a panel saying
 * "1 change" has been told two contradictory things about the same plan.
 *
 * Payloads go through `screenDecomposeResponse`, the guard the real decompose
 * call uses, so an unknown `reason_code` or `kind` arrives exactly as it would
 * from a newer backend — as data, with no cast.
 */

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";

import { screenDecomposeResponse } from "@/lib/guards";
import type { DecomposeResponse, PlanFloorNotice } from "@/lib/types";
import { ExclusionsPanel } from "./exclusions-panel";
import { FloorSummary } from "./floor-summary";
import { isFloorAction, isRoutingPolicy, isUnreachable } from "./floor-notices";

afterEach(cleanup);

/** A wire notice, before the guard has seen it. */
const wire = (agentId: string, over: Record<string, unknown> = {}) => ({
  kind: "excluded",
  agent_id: agentId,
  reason: "below routing floor (4200 < 5500 bps)",
  reason_code: "below_floor",
  lower_bound_bps: 4200,
  floor_bps: 5500,
  ...over,
});

/** A plan as the card receives it: screened by the real guard. */
function screened(notices: Record<string, unknown>[]): DecomposeResponse {
  const plan = screenDecomposeResponse({
    plan_id: "plan_count",
    intent: "count the floor's actions",
    steps: [],
    total_usdc: 0.1,
    total_eta: 1,
    floor_bps: 5500,
    notices,
  });
  if (plan === null) throw new Error("the guard rejected the fixture plan");
  return plan;
}

const UNBOUND = { reason_code: "unbound_endpoint", lower_bound_bps: null };
/** A bound agent whose endpoint failed its latest health check (D-084). Its
 *  bound is null on purpose: no reputation verdict was taken. */
const UNREACHABLE = {
  reason_code: "unreachable_endpoint",
  lower_bound_bps: null,
  reason: "endpoint failed its latest health check",
};

describe("isFloorAction — one rule for both counts", () => {
  it.each([
    ["below_floor", true],
    ["floor_relaxed", true],
    ["a reason code this build does not know", true],
    ["a legacy notice with no reason code", true],
    ["unbound_endpoint", false],
    ["unreachable_endpoint", false],
  ] as const)("%s → %s", (name, expected) => {
    const over =
      name === "a reason code this build does not know"
        ? { reason_code: "quarantined" }
        : name === "a legacy notice with no reason code"
          ? { reason_code: undefined }
          : { reason_code: name };
    const [n] = screened([wire("a", over)]).notices ?? [];
    expect(isFloorAction(n)).toBe(expected);
  });
});

/** "the floor acted on N agents" → N. */
function summaryCount(plan: DecomposeResponse): number {
  const { container } = render(<FloorSummary plan={plan} />);
  const m = (container.textContent ?? "").match(
    /the floor acted on (no|\d+) agents?/,
  );
  if (m === null) throw new Error("the summary states no count");
  cleanup();
  return m[1] === "no" ? 0 : Number(m[1]);
}

/** "Reputation floor · N changes" → N. */
function panelCount(plan: DecomposeResponse): number {
  const { container } = render(<ExclusionsPanel plan={plan} />);
  const m = (container.querySelector("summary")?.textContent ?? "").match(
    /(no|\d+) changes?/,
  );
  if (m === null) throw new Error("the panel states no count");
  cleanup();
  return m[1] === "no" ? 0 : Number(m[1]);
}

describe("the floor summary and the exclusions panel agree", () => {
  const mixes: [string, Record<string, unknown>[], number][] = [
    ["an unknown reason code", [wire("a", { reason_code: "quarantined" })], 1],
    [
      "an unknown kind",
      [wire("a", { kind: "delisted", reason_code: undefined })],
      1,
    ],
    ["an unbound agent alone", [wire("a", UNBOUND)], 0],
    ["an unreachable agent alone", [wire("a", UNREACHABLE)], 0],
    [
      "every shape at once",
      [
        wire("a"),
        wire("b", { kind: "degraded", reason_code: "floor_relaxed" }),
        wire("c", { reason_code: "quarantined" }),
        wire("d", { reason_code: undefined }),
        wire("e", { kind: "delisted", reason_code: undefined }),
        wire("f", UNBOUND),
        wire("g", UNBOUND),
        wire("h", UNREACHABLE),
      ],
      5,
    ],
  ];

  it.each(mixes)("on %s", (_name, notices, expected) => {
    const plan = screened(notices);
    expect(summaryCount(plan)).toBe(expected);
    expect(panelCount(plan)).toBe(expected);
  });
});

describe("notices the guard dropped as unusable", () => {
  /** No `reason` and a string bound: the guard drops it, and counts it. */
  const broken = (agentId: string) => ({
    kind: "excluded",
    agent_id: agentId,
    lower_bound_bps: "low",
  });

  it("are said in both sections, never silently missing", () => {
    const plan = screened([wire("a"), broken("b")]);
    expect(plan.notices).toHaveLength(1);

    const { container: summary } = render(<FloorSummary plan={plan} />);
    expect(summary.textContent).toContain("1 floor notice could not be shown");
    cleanup();

    const { container: panel } = render(<ExclusionsPanel plan={plan} />);
    expect(panel.querySelector("summary")?.textContent).toContain(
      "1 floor notice could not be shown",
    );
    expect(panel.textContent).toContain("arrived incomplete");
  });

  // Every notice malformed is still "the backend reported something here",
  // not "the floor did nothing": the panel stays on the card to say so.
  it("keep the panel on the card when every notice was dropped", () => {
    const plan = screened([broken("a"), broken("b")]);
    expect(plan.notices).toHaveLength(0);
    const { container } = render(<ExclusionsPanel plan={plan} />);
    expect(container.querySelector("summary")?.textContent).toContain(
      "2 floor notices could not be shown",
    );
  });

  it("say nothing when none were dropped", () => {
    const plan = screened([wire("a")]);
    const { container } = render(
      <>
        <FloorSummary plan={plan} />
        <ExclusionsPanel plan={plan} />
      </>,
    );
    expect(container.textContent).not.toMatch(/could not be shown/);
  });
});

// Keeps the fixture honest: a notice the guard would drop is not one either
// component ever sees, so a mix that silently shrank would test nothing.
it("screens every fixture notice through intact", () => {
  const all: PlanFloorNotice[] =
    screened([wire("a", { reason_code: "quarantined" }), wire("b", UNBOUND)])
      .notices ?? [];
  expect(all).toHaveLength(2);
});

describe("isUnreachable — an endpoint that failed its health check", () => {
  it.each([
    ["unreachable_endpoint", true],
    ["unbound_endpoint", false],
    ["below_floor", false],
  ] as const)("%s → %s", (code, expected) => {
    const [n] = screened([wire("a", { reason_code: code })]).notices ?? [];
    expect(isUnreachable(n)).toBe(expected);
  });

  it("is said apart in the summary, never as the floor acting", () => {
    const plan = screened([wire("a"), wire("b", UNREACHABLE)]);
    const { container } = render(<FloorSummary plan={plan} />);
    const text = container.textContent ?? "";
    expect(text).toContain("the floor acted on 1 agent");
    expect(text).toContain(
      "1 agent whose endpoint failed its latest health check was left out",
    );
  });

  it("wears its own mark in the panel, with no numbers row", () => {
    const plan = screened([wire("a", UNREACHABLE)]);
    const { container } = render(<ExclusionsPanel plan={plan} />);
    const text = container.textContent ?? "";
    expect(text).toContain("unreachable");
    expect(text).toContain("1 with an unreachable endpoint");
    expect(text).not.toContain("none on record");
    expect(text).not.toContain("lower bound");
    expect(text).not.toContain("No reputation entry exists");
    expect(text).not.toContain("The reputation floor acted on");
  });
});

describe("routing policy — agents left out by how plans are built", () => {
  /** An operator's own agent, left out while plans use only the platform's. */
  const EXTERNAL = {
    reason_code: "external_not_routed",
    lower_bound_bps: null,
    reason: "external agents are not routed",
  };
  /** A built-in agent whose worker would only simulate its step. */
  const SIMULATED = {
    reason_code: "simulated_worker",
    lower_bound_bps: null,
    reason: "worker is simulated",
  };

  it.each([
    ["external_not_routed", true],
    ["simulated_worker", true],
    ["below_floor", false],
    ["unreachable_endpoint", false],
  ] as const)("isRoutingPolicy: %s → %s", (code, expected) => {
    const [n] = screened([wire("a", { reason_code: code })]).notices ?? [];
    expect(isRoutingPolicy(n)).toBe(expected);
    if (expected) expect(isFloorAction(n)).toBe(false);
  });

  it("is said apart in the summary, in plain words, never as the floor acting", () => {
    const plan = screened([
      wire("a"),
      wire("ext1", EXTERNAL),
      wire("ext2", EXTERNAL),
      wire("sim", SIMULATED),
    ]);
    const { container } = render(<FloorSummary plan={plan} />);
    const text = container.textContent ?? "";
    expect(text).toContain("the floor acted on 1 agent");
    expect(text).toContain(
      "2 operator agents were left out: plans use only the platform's own agents for now",
    );
    expect(text).toContain(
      "1 agent whose worker is not live yet was left out, so nothing simulated is charged",
    );
  });

  it("explains each in the panel, with no reputation numbers", () => {
    const plan = screened([wire("ext", EXTERNAL), wire("sim", SIMULATED)]);
    const { container } = render(<ExclusionsPanel plan={plan} />);
    const text = container.textContent ?? "";
    expect(text).toContain("in-platform only");
    expect(text).toContain(
      "Plans currently use only the platform's own agents, so this operator's agent was not considered. That says nothing about its reputation or its endpoint.",
    );
    expect(text).toContain("not live yet");
    expect(text).toContain(
      "Its worker is not live yet and would only simulate the step, so it was left out: you are never charged for simulated output.",
    );
    expect(text).toContain("1 operator agent · 1 not live yet");
    expect(text).not.toContain("lower bound");
    expect(text).not.toContain("No reputation entry exists");
    expect(text).not.toContain("The reputation floor acted on");
  });
});
