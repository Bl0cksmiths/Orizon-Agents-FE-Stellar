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
import { isFloorAction } from "./floor-notices";

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

describe("isFloorAction — one rule for both counts", () => {
  it.each([
    ["below_floor", true],
    ["floor_relaxed", true],
    ["a reason code this build does not know", true],
    ["a legacy notice with no reason code", true],
    ["unbound_endpoint", false],
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

// Keeps the fixture honest: a notice the guard would drop is not one either
// component ever sees, so a mix that silently shrank would test nothing.
it("screens every fixture notice through intact", () => {
  const all: PlanFloorNotice[] =
    screened([wire("a", { reason_code: "quarantined" }), wire("b", UNBOUND)])
      .notices ?? [];
  expect(all).toHaveLength(2);
});
