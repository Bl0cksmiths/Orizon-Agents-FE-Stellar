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
  it("says each tier in words a buyer reads, not only a colour", () => {
    expect(TIER_COPY.low.label).toBe("low");
    expect(TIER_COPY.moderate.label).toBe("moderate");
    expect(TIER_COPY.complex.label).toBe("complex");
    for (const t of ["low", "moderate", "complex"] as const) {
      expect(TIER_COPY[t].spoken).toMatch(/tier/i);
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

  it("names the jev guard model with its version", () => {
    expect(modelLabel("jev-1.13.0")).toBe("jev 1.13.0");
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
  // The backend names the model per step; nothing here maps a tier to a
  // model, because a step routed to an external agent runs on its operator's
  // own stack and a tier-derived "Claude" there would be a false claim.
  it("is the step's own model, labelled", () => {
    expect(stepModel({ model: "claude-haiku-4-5", tier: "low" })).toBe(
      "Claude Haiku 4.5",
    );
  });

  it("is null when the step names none, whatever its tier", () => {
    expect(stepModel({ tier: "complex" })).toBeNull();
    expect(stepModel({ model: null, tier: "low" })).toBeNull();
  });
});
