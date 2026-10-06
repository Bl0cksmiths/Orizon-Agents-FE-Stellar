// @vitest-environment jsdom
/**
 * The marks a trace line carries under orchestrator v2: which planning stage
 * it reports, and the tier and model of the step it reports. Plain DOM checks.
 */

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";

import type { TraceLine } from "@/lib/types";
import { StageMark, StepMarks } from "./trace-line-marks";

afterEach(cleanup);

const line = (msg: string, extra: Partial<TraceLine> = {}): TraceLine => ({
  t: "00.100",
  level: "exec",
  msg,
  ...extra,
});

describe("StageMark", () => {
  it("marks each planning stage in a word", () => {
    for (const [msg, word] of [
      ["Request checked by jev (tier: moderate)", "check"],
      ["Prompt improved by Claude Sonnet 5.5", "brief"],
      ["Planned by Claude Opus 5.5 (effort medium)", "plan"],
    ]) {
      const { container, unmount } = render(<StageMark line={line(msg)} />);
      expect(container.textContent).toContain(word);
      expect(container.textContent).toMatch(/planning stage/i);
      unmount();
    }
  });

  it("marks nothing on a step line", () => {
    const { container } = render(
      <StageMark line={line("code.gen → calculator app generated")} />,
    );
    expect(container.innerHTML).toBe("");
  });
});

describe("StepMarks", () => {
  it("badges the tier and names the model the line is tagged with", () => {
    const { container } = render(
      <StepMarks
        line={line("code.gen → done", {
          tier: "complex",
          model: "claude-opus-5-5",
        })}
      />,
    );
    expect(container.textContent).toMatch(/complex tier/i);
    expect(container.textContent).toContain("Claude Opus 5.5");
  });

  // The line's own words already name it: saying it twice is noise.
  it("does not repeat a model the line's words already name", () => {
    const { container } = render(
      <StepMarks
        line={line("seo.brief → outline drafted on Claude Haiku 4.5", {
          tier: "low",
          model: "claude-haiku-4-5",
        })}
      />,
    );
    expect(container.textContent).toMatch(/low tier/i);
    expect(container.textContent).not.toContain("Claude Haiku 4.5");
  });

  it("marks nothing for a tier it cannot name and no model", () => {
    const { container } = render(
      <StepMarks line={line("code.gen → done", { tier: "extreme" })} />,
    );
    expect(container.innerHTML).toBe("");
  });

  it("marks nothing on a line from a backend predating the tags", () => {
    const { container } = render(<StepMarks line={line("code.gen → done")} />);
    expect(container.innerHTML).toBe("");
  });
});
