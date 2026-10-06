import { describe, expect, it } from "vitest";
import {
  SPEC_LIMITS,
  draftToSpec,
  specChanged,
  specToDraft,
  type SpecDraft,
} from "./plan-spec";
import type { PlanSpec } from "./types";

const spec: PlanSpec = {
  goal: "A playable tetris game",
  deliverable: "One HTML file",
  constraints: ["No external libraries", "Works on a phone"],
  done_criteria: ["Pieces rotate", "Full lines clear"],
  summary: "Build a tetris game as one HTML file.",
};

describe("specToDraft", () => {
  it("puts each list one item per line", () => {
    expect(specToDraft(spec)).toEqual({
      summary: spec.summary,
      goal: spec.goal,
      deliverable: spec.deliverable,
      constraints: "No external libraries\nWorks on a phone",
      done_criteria: "Pieces rotate\nFull lines clear",
    });
  });
});

describe("draftToSpec", () => {
  const draft = (over: Partial<SpecDraft> = {}): SpecDraft => ({
    ...specToDraft(spec),
    ...over,
  });

  it("round-trips an untouched brief", () => {
    expect(draftToSpec(draft())).toEqual({ ok: true, spec });
  });

  it("trims every field and drops blank lines from the lists", () => {
    const r = draftToSpec(
      draft({
        goal: "  A game  ",
        constraints: "\n  one \n\n two\n   \n",
        done_criteria: "",
      }),
    );
    expect(r).toEqual({
      ok: true,
      spec: {
        ...spec,
        goal: "A game",
        constraints: ["one", "two"],
        done_criteria: [],
      },
    });
  });

  it("strips the bullet a buyer types at the start of a line", () => {
    const r = draftToSpec(
      draft({ constraints: "- one\n• two\n* three\n1. four" }),
    );
    expect(r.ok && r.spec.constraints).toEqual(["one", "two", "three", "four"]);
  });

  it("uses the goal as the summary when the summary is cleared", () => {
    const r = draftToSpec(draft({ summary: "  " }));
    expect(r.ok && r.spec.summary).toBe(spec.goal);
  });

  it("asks for a goal and a deliverable", () => {
    const r = draftToSpec(draft({ goal: " ", deliverable: "" }));
    expect(r.ok).toBe(false);
    expect(!r.ok && r.errors.goal).toMatch(/goal/i);
    expect(!r.ok && r.errors.deliverable).toMatch(/deliver/i);
  });

  it("refuses a field over its length, saying the limit", () => {
    const r = draftToSpec(draft({ goal: "x".repeat(SPEC_LIMITS.goal + 1) }));
    expect(!r.ok && r.errors.goal).toContain(String(SPEC_LIMITS.goal));
  });

  it("refuses a list with too many items, or an item that is too long", () => {
    const many = Array.from(
      { length: SPEC_LIMITS.items + 1 },
      (_, i) => `c${i}`,
    ).join("\n");
    const r = draftToSpec(draft({ constraints: many }));
    expect(!r.ok && r.errors.constraints).toContain(String(SPEC_LIMITS.items));
    const long = draftToSpec(
      draft({ done_criteria: "x".repeat(SPEC_LIMITS.item + 1) }),
    );
    expect(!long.ok && long.errors.done_criteria).toContain(
      String(SPEC_LIMITS.item),
    );
  });
});

describe("specChanged", () => {
  it("is false for the same brief, true for any edit", () => {
    expect(specChanged(spec, { ...spec })).toBe(false);
    expect(specChanged(spec, { ...spec, goal: "Another" })).toBe(true);
    expect(
      specChanged(spec, { ...spec, constraints: [...spec.constraints, "x"] }),
    ).toBe(true);
    expect(
      specChanged(spec, {
        ...spec,
        done_criteria: [...spec.done_criteria].reverse(),
      }),
    ).toBe(true);
  });
});
