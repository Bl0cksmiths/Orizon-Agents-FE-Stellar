import { describe, expect, it } from "vitest";
import {
  STAGE_COPY,
  traceLineModel,
  traceLineTier,
  traceStage,
} from "./trace-stage";
import type { TraceLine } from "./types";

const line = (msg: string, extra: Partial<TraceLine> = {}): TraceLine => ({
  t: "00.100",
  level: "exec",
  msg,
  ...extra,
});

describe("traceStage", () => {
  it("reads the stage the backend tags a line with", () => {
    expect(traceStage(line("anything", { stage: "guard" }))).toBe("guard");
    expect(traceStage(line("anything", { stage: "improve" }))).toBe("improve");
    expect(traceStage(line("anything", { stage: "plan" }))).toBe("plan");
  });

  it("recognises the three stage lines by their documented wording", () => {
    expect(traceStage(line("Request checked by jev (tier: moderate)"))).toBe(
      "guard",
    );
    expect(traceStage(line("Prompt improved by Claude Sonnet 5.5"))).toBe(
      "improve",
    );
    expect(traceStage(line("Planned by Claude Opus 5.5 (effort medium)"))).toBe(
      "plan",
    );
  });

  it("recognises the backend's other stage wordings", () => {
    expect(
      traceStage(
        line(
          "Request check paused: today's AI budget is spent; curated demo served",
        ),
      ),
    ).toBe("guard");
    expect(traceStage(line("Prompt improvement unavailable"))).toBe("improve");
    expect(traceStage(line("Using your edited reading of the request"))).toBe(
      "improve",
    );
    expect(traceStage(line("Edited request re-checked by jev"))).toBe(
      "recheck",
    );
    expect(
      traceStage(line("Improved prompt drifted; planning from your own words")),
    ).toBe("recheck");
    expect(traceStage(line("x", { stage: "recheck" }))).toBe("recheck");
  });

  it("is null for a step line and for a tag it does not know", () => {
    expect(traceStage(line("code.gen → calculator app generated"))).toBeNull();
    expect(
      traceStage(line("planned the release", { stage: "deploy" })),
    ).toBeNull();
    // Mid-sentence is not a stage line: only a line that opens with it.
    expect(traceStage(line("step 2 was planned by hand"))).toBeNull();
  });

  it("has a short word for each stage", () => {
    expect(STAGE_COPY.guard.label).toBe("check");
    expect(STAGE_COPY.improve.label).toBe("brief");
    expect(STAGE_COPY.plan.label).toBe("plan");
    expect(STAGE_COPY.recheck.label).toBe("recheck");
  });
});

describe("traceLineModel / traceLineTier", () => {
  it("labels the model and reads the tier when the line carries them", () => {
    const l = line("code.gen → done", {
      model: "claude-opus-5-5",
      tier: "complex",
    });
    expect(traceLineModel(l)).toBe("Claude Opus 5.5");
    expect(traceLineTier(l)).toBe("complex");
  });

  it("is null for a line from a backend predating them", () => {
    const l = line("code.gen → done");
    expect(traceLineModel(l)).toBeNull();
    expect(traceLineTier(l)).toBeNull();
  });
});
