import { describe, expect, it } from "vitest";

import { planInputs } from "./plan-inputs";
import type { PlanStep } from "./types";

const step = (inputs_from?: unknown): PlanStep => ({
  agent_id: "agt_x",
  rationale: "r",
  est_eta_seconds: 1,
  price_stroops: 1,
  ...(inputs_from === undefined
    ? {}
    : { inputs_from: inputs_from as number[] | null }),
});

describe("planInputs", () => {
  it("is null for a backend that names no sources at all", () => {
    expect(planInputs([step(), step(), step()])).toBeNull();
  });

  it("reads each step's earlier sources, 1-based, sorted and unique", () => {
    expect(planInputs([step(null), step([1]), step([2, 1, 1])])).toEqual([
      [],
      [1],
      [1, 2],
    ]);
  });

  it("treats a step with no list as using nothing, once any step names one", () => {
    expect(planInputs([step(), step([1]), step()])).toEqual([[], [1], []]);
  });

  it("drops a source that is not an earlier step", () => {
    // Itself, a later step, zero, a fraction, a string: none is a handoff.
    expect(
      planInputs([step([1]), step([2, 3, 0, 1.5, "1", 1]), step([])]),
    ).toEqual([[], [1], []]);
  });

  it("ignores a list that is not a list", () => {
    expect(planInputs([step("1"), step({ 0: 1 })])).toBeNull();
  });
});
