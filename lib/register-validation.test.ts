/**
 * Tests for the register-form validators in lib/register-validation.ts.
 *
 * Every validator is exercised on a valid value and on each distinct invalid
 * reason, mirroring the backend `RegisterAgentReq` rules the module encodes.
 */

import { describe, expect, it } from "vitest";
import {
  AGENT_ID_RE,
  isRegisterFormValid,
  normalizeSkills,
  priceEntryHint,
  priceFieldLabel,
  usdcToStroops,
  validateAgentId,
  validateName,
  validatePriceUsdc,
  validateSkill,
  validateSkills,
} from "./register-validation";

describe("validateAgentId", () => {
  it("accepts a well-formed id", () => {
    expect(validateAgentId("copywrite_v3")).toBeNull();
    expect(validateAgentId("A1_")).toBeNull();
    expect(validateAgentId("a".repeat(32))).toBeNull();
  });

  it("rejects an empty id as required", () => {
    expect(validateAgentId("")).toBe("Agent ID is required");
  });

  it("rejects the reserved agt_ prefix", () => {
    expect(validateAgentId("agt_01")).toBe(
      "agt_ ids are reserved for the seeded catalog",
    );
  });

  it("shows the reserved message before the charset one for agt_x!", () => {
    // Reserved is checked first, so a value that is both reserved *and*
    // malformed surfaces the more actionable reserved error.
    expect(validateAgentId("agt_x!")).toBe(
      "agt_ ids are reserved for the seeded catalog",
    );
  });

  it("rejects charset violations", () => {
    const charset = "Letters, digits and underscore only, 1-32 characters";
    expect(validateAgentId("bad-id")).toBe(charset);
    expect(validateAgentId("bad.id")).toBe(charset);
    expect(validateAgentId("café")).toBe(charset);
    expect(validateAgentId("a".repeat(33))).toBe(charset);
  });
});

describe("validateName", () => {
  it("accepts a name at the boundaries", () => {
    expect(validateName("Copywriter")).toBeNull();
    expect(validateName("a")).toBeNull();
    expect(validateName("a".repeat(100))).toBeNull();
  });

  it("rejects an empty or whitespace-only name as required", () => {
    expect(validateName("")).toBe("Display name is required");
    expect(validateName("   ")).toBe("Display name is required");
  });

  it("rejects a name over 100 characters", () => {
    expect(validateName("a".repeat(101))).toBe("100 characters maximum");
  });
});

describe("validateSkill", () => {
  it("accepts a well-formed skill token", () => {
    expect(validateSkill("seo")).toBeNull();
  });

  it("rejects an empty token", () => {
    expect(validateSkill("")).toBe("Empty skill");
  });

  it("rejects a token with a charset violation", () => {
    expect(validateSkill("bad-skill")).toBe(
      "Letters, digits and underscore only, 1-32 characters",
    );
  });
});

describe("normalizeSkills", () => {
  it("trims, lowercases and drops empties", () => {
    expect(normalizeSkills([" SEO ", "Content", "", "   "])).toEqual([
      "seo",
      "content",
    ]);
  });

  it("drops tokens failing the charset", () => {
    expect(normalizeSkills(["ok", "bad-skill", "también"])).toEqual(["ok"]);
  });

  it("dedupes while keeping first-seen order", () => {
    expect(normalizeSkills(["seo", "content", "SEO", "content"])).toEqual([
      "seo",
      "content",
    ]);
  });

  it("caps the list at 16", () => {
    const many = Array.from({ length: 17 }, (_, i) => `skill_${i}`);
    const out = normalizeSkills(many);
    expect(out).toHaveLength(16);
    expect(out[0]).toBe("skill_0");
    expect(out[15]).toBe("skill_15");
    expect(out).not.toContain("skill_16");
  });

  it("returns an empty list for no usable tokens", () => {
    expect(normalizeSkills([])).toEqual([]);
    expect(normalizeSkills(["", "  ", "no-good"])).toEqual([]);
  });
});

describe("validateSkills", () => {
  it("accepts an empty list (backend default is empty)", () => {
    expect(validateSkills([])).toBeNull();
  });

  it("accepts a valid list", () => {
    expect(validateSkills(["seo", "content", "code_gen"])).toBeNull();
  });

  it("rejects more than 16 skills", () => {
    const seventeen = Array.from({ length: 17 }, (_, i) => `skill_${i}`);
    expect(validateSkills(seventeen)).toBe("16 skills maximum");
  });

  it("rejects a list with a malformed token", () => {
    expect(validateSkills(["seo", "bad-skill"])).toBe(
      "Each skill: letters, digits and underscore, 1-32 chars",
    );
  });
});

describe("validatePriceUsdc", () => {
  it("accepts a valid number and a string from an input", () => {
    expect(validatePriceUsdc(0.054)).toBeNull();
    expect(validatePriceUsdc("0.054")).toBeNull();
    expect(validatePriceUsdc(10000)).toBeNull();
  });

  it("rejects a non-numeric string or NaN", () => {
    expect(validatePriceUsdc("abc")).toBe("Enter a valid price");
    expect(validatePriceUsdc(NaN)).toBe("Enter a valid price");
    expect(validatePriceUsdc(Infinity)).toBe("Enter a valid price");
  });

  it("rejects zero and negative prices", () => {
    expect(validatePriceUsdc(0)).toBe("Price must be greater than 0");
    expect(validatePriceUsdc(-1)).toBe("Price must be greater than 0");
  });

  it("rejects a price above the ceiling", () => {
    expect(validatePriceUsdc(10001)).toBe("10000 maximum");
  });
});

// F-022: the price is entered in the network's asset, which on testnet is
// native XLM, whatever the wire field `price_usdc` is called.
describe("priceFieldLabel / priceEntryHint", () => {
  it("names XLM on testnet", () => {
    expect(priceFieldLabel("native")).toBe("price per step (XLM)");
    expect(priceEntryHint("native")).toBe(
      "entered in XLM, converted once at submit",
    );
  });

  it("names no unit while the asset is unknown", () => {
    for (const asset of [null, undefined]) {
      expect(priceFieldLabel(asset)).toBe("price per step");
      expect(priceEntryHint(asset)).toBe("converted to stroops once at submit");
    }
  });

  it("never says USDC off a field name", () => {
    for (const asset of ["native", null, undefined]) {
      expect(priceFieldLabel(asset)).not.toMatch(/USDC/);
      expect(priceEntryHint(asset)).not.toMatch(/USDC/);
    }
    expect(validatePriceUsdc(10001)).not.toMatch(/USDC/);
  });
});

describe("usdcToStroops", () => {
  it("scales USDC to stroops", () => {
    expect(usdcToStroops(0.054)).toBe(540000);
    expect(usdcToStroops(1)).toBe(10000000);
  });

  it("rounds to the nearest stroop", () => {
    expect(usdcToStroops(0.0000001)).toBe(1);
    expect(usdcToStroops(0.00000004)).toBe(0);
  });
});

describe("isRegisterFormValid", () => {
  const valid = {
    owner: "GBVN3FUM3TPMZXNSBMEGBLYBM2QFGXN7QCZL4TWZ5PJ7V36E",
    agent_id: "copywrite_v3",
    name: "Copywriter",
    skills: ["seo", "content"],
    price_usdc: "0.054",
  };

  it("is true when owner is set and every field is valid", () => {
    expect(isRegisterFormValid(valid)).toBe(true);
  });

  it("is false when the owner wallet is missing", () => {
    expect(isRegisterFormValid({ ...valid, owner: "" })).toBe(false);
    expect(isRegisterFormValid({ ...valid, owner: "   " })).toBe(false);
  });

  it("is false when any single field is invalid", () => {
    expect(isRegisterFormValid({ ...valid, agent_id: "agt_01" })).toBe(false);
    expect(isRegisterFormValid({ ...valid, name: "" })).toBe(false);
    expect(isRegisterFormValid({ ...valid, skills: ["bad-skill"] })).toBe(
      false,
    );
    expect(isRegisterFormValid({ ...valid, price_usdc: 0 })).toBe(false);
  });
});

describe("AGENT_ID_RE", () => {
  it("matches the backend charset and length bounds", () => {
    expect(AGENT_ID_RE.test("Agent_01")).toBe(true);
    expect(AGENT_ID_RE.test("")).toBe(false);
    expect(AGENT_ID_RE.test("a".repeat(33))).toBe(false);
  });
});
