import { describe, expect, it } from "vitest";
import { TIER_COPY, modelLabel, readTier, stepModel } from "./plan-tier";

describe("readTier", () => {
  it("reads the three tiers", () => {
    expect(readTier("low")).toBe("low");
    expect(readTier("moderate")).toBe("moderate");
    expect(readTier("complex")).toBe("complex");
  });

  it("reads a tier sent in another case or with spaces around it", () => {
    expect(readTier(" Complex ")).toBe("complex");
  });

  // A badge for a tier this build cannot name would be a guess.
  it("is null for anything else, including nothing", () => {
    for (const v of [undefined, null, "", "extreme", "LOWEST", 1, {}]) {
      expect(readTier(v), JSON.stringify(v)).toBeNull();
    }
  });
});

describe("TIER_COPY", () => {
  it("names each tier in a word, and never in magenta", () => {
    expect(TIER_COPY.low.label).toBe("low");
    expect(TIER_COPY.moderate.label).toBe("moderate");
    expect(TIER_COPY.complex.label).toBe("complex");
    for (const t of ["low", "moderate", "complex"] as const) {
      expect(TIER_COPY[t].tone).not.toBe("magenta");
    }
  });
});

describe("modelLabel", () => {
  it("names the Claude models by their display names", () => {
    expect(modelLabel("claude-opus-5-5")).toBe("Claude Opus 5.5");
    expect(modelLabel("claude-sonnet-5-5")).toBe("Claude Sonnet 5.5");
    expect(modelLabel("claude-haiku-4-5")).toBe("Claude Haiku 4.5");
  });

  it("names a Claude id this build has never seen by the same pattern", () => {
    expect(modelLabel("claude-opus-6-1")).toBe("Claude Opus 6.1");
    expect(modelLabel("claude-sonnet-6")).toBe("Claude Sonnet 6");
  });

  // The backend pins the version; buyers read the name.
  it("names the jev guard model plainly", () => {
    expect(modelLabel("jev-1.13.0")).toBe("jev");
    expect(modelLabel("jev")).toBe("jev");
  });

  it("keeps a display name the backend already wrote", () => {
    expect(modelLabel("Claude Opus 5.5")).toBe("Claude Opus 5.5");
    expect(modelLabel("gpt-4o-mini")).toBe("gpt-4o-mini");
  });

  it("is null when there is nothing to name", () => {
    for (const v of [undefined, null, "", "   "]) {
      expect(modelLabel(v), JSON.stringify(v)).toBeNull();
    }
  });
});

describe("stepModel", () => {
  const models = {
    tiers: {
      low: "claude-haiku-4-5",
      moderate: "claude-sonnet-5-5",
      complex: "claude-opus-5-5",
    },
  };

  it("is the step's own model when the backend names one", () => {
    expect(
      stepModel({ model: "claude-haiku-4-5", tier: "complex" }, models),
    ).toEqual({ name: "Claude Haiku 4.5", fromTier: false });
  });

  it("is its tier's built-in model otherwise, said as such", () => {
    expect(stepModel({ tier: "moderate" }, models)).toEqual({
      name: "Claude Sonnet 5.5",
      fromTier: true,
    });
  });

  it("is null with no tier, no tier map, or a tier it cannot name", () => {
    expect(stepModel({ tier: null }, models)).toBeNull();
    expect(stepModel({ tier: "low" }, null)).toBeNull();
    expect(stepModel({ tier: "low" }, {})).toBeNull();
    expect(stepModel({ tier: "extreme" }, models)).toBeNull();
  });
});
