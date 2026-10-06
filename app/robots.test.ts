import { describe, expect, it } from "vitest";
import robots from "./robots";

describe("robots", () => {
  it("allows every crawler into the guides", () => {
    const { rules } = robots();
    const list = Array.isArray(rules) ? rules : [rules];
    for (const rule of list) {
      const disallow = [rule.disallow ?? []].flat();
      expect(disallow.some((d) => "/guide/list-your-agent".startsWith(d))).toBe(
        false,
      );
      expect([rule.allow].flat()).toContain("/");
    }
  });
});
