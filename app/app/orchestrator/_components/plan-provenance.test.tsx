// @vitest-environment jsdom
/**
 * The plan card's "how this plan was made" line (orchestrator v2): the
 * request's tier and the model behind each planning stage. Plain DOM checks.
 */

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import type { DecomposeResponse } from "@/lib/types";
import { PlanProvenance } from "./plan-provenance";

afterEach(cleanup);

const base: DecomposeResponse = {
  plan_id: "pln_1",
  intent: "tetris",
  steps: [],
  total_usdc: 0,
  total_eta: 0,
};

describe("PlanProvenance", () => {
  it("names each stage's model and the request's tier", () => {
    render(
      <PlanProvenance
        plan={{
          ...base,
          tier: "moderate",
          guard: { verdict: "allow", tier: "moderate", reasons: [] },
          models: {
            guard: "jev-1.13.0",
            improver: "claude-sonnet-5-5",
            planner: "claude-opus-5-5",
          },
          understood_as: {
            goal: "g",
            deliverable: "d",
            constraints: [],
            done_criteria: [],
            summary: "s",
          },
        }}
      />,
    );
    const list = screen.getByRole("list", { name: /how this plan was made/i });
    const text = list.textContent ?? "";
    expect(text).toMatch(/checked by jev 1\.13\.0/i);
    expect(text).toMatch(/brief by Claude Sonnet 5\.5/);
    expect(text).toMatch(/planned by Claude Opus 5\.5/);
    expect(text).toMatch(/moderate tier/i);
    expect(text).not.toMatch(/as written/i);
  });

  it("falls back to the check's tier when the plan carries none", () => {
    render(
      <PlanProvenance
        plan={{ ...base, guard: { verdict: "allow", tier: "complex" } }}
      />,
    );
    expect(document.body.textContent).toMatch(/complex tier/i);
  });

  it("says when the plan was made from the request as written", () => {
    render(
      <PlanProvenance
        plan={{
          ...base,
          understood_as: null,
          models: { planner: "claude-opus-5-5" },
        }}
      />,
    );
    expect(document.body.textContent).toMatch(/your request as written/i);
  });

  it("renders nothing for a plan from a backend predating it", () => {
    const { container } = render(<PlanProvenance plan={base} />);
    expect(container.innerHTML).toBe("");
  });
});
