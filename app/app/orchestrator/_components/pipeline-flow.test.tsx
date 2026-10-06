// @vitest-environment jsdom
/**
 * A multi-agent plan read as a pipeline: the order the agents run in, and
 * what each step hands to the next. Plain DOM checks.
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";

import type { PlanStep } from "@/lib/types";
import { HandoffNote, PipelineOverview } from "./pipeline-flow";

afterEach(cleanup);

const step = (name: string): PlanStep => ({
  agent_id: `agt_${name}`,
  agent_name: name,
  rationale: `${name} does its part`,
  est_price_usdc: 0.01,
  est_eta_seconds: 1,
});

const STEPS = ["research.pro", "seo.brief", "copywrite.v3", "code.gen"].map(
  step,
);

describe("PipelineOverview", () => {
  it("shows the agents in the order they run", () => {
    const { container } = render(<PipelineOverview steps={STEPS} />);
    const chips = Array.from(
      container.querySelectorAll("[data-pipeline-agent]"),
    );
    expect(chips.map((c) => c.textContent)).toEqual([
      "research.pro",
      "seo.brief",
      "copywrite.v3",
      "code.gen",
    ]);
  });

  it("says the order in one sentence to a screen reader, without the arrows", () => {
    const { container } = render(<PipelineOverview steps={STEPS} />);
    const spoken = container.querySelector(".sr-only")?.textContent;
    expect(spoken).toBe(
      "4 agents run in order: research.pro, then seo.brief, then copywrite.v3, then code.gen. Each hands its output to the next.",
    );
    // The visual chain is decoration once the sentence has said it.
    expect(
      container
        .querySelector("[data-pipeline-chain]")
        ?.getAttribute("aria-hidden"),
    ).toBe("true");
  });

  it("draws nothing for a single step: there is no pipeline to show", () => {
    const { container } = render(<PipelineOverview steps={[STEPS[0]]} />);
    expect(container.innerHTML).toBe("");
  });

  it("names an agent by its id when it has no name", () => {
    const { container } = render(
      <PipelineOverview
        steps={[STEPS[0], { ...STEPS[1], agent_name: undefined }]}
      />,
    );
    expect(container.textContent).toContain("agt_seo.brief");
  });
});

describe("HandoffNote", () => {
  it("says which step receives this one's output", () => {
    const { container } = render(<HandoffNote to={STEPS[2]} index={2} />);
    expect(container.textContent).toBe(
      "↓ hands its output to step 03 · copywrite.v3",
    );
    expect(container.querySelector("[aria-hidden]")?.textContent).toBe("↓");
  });
});
