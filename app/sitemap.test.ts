/**
 * The sitemap lists every public guide, and robots.txt lets crawlers reach
 * them: the guide is meant to be found without an invitation.
 */

import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import robots from "./robots";
import sitemap from "./sitemap";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("sitemap", () => {
  it("lists the guide index and each guide, dated by its frontmatter", () => {
    vi.stubEnv(
      "GUIDE_CONTENT_DIR",
      path.resolve(__dirname, "../test/fixtures/guides"),
    );
    const entries = sitemap();
    expect(entries.map((e) => e.url)).toEqual([
      "https://orizons.xyz",
      "https://orizons.xyz/guide",
      "https://orizons.xyz/guide/list-your-agent",
    ]);
    expect(entries[2].lastModified).toEqual(new Date("2026-09-29T00:00:00Z"));
  });

  it("lists no guide pages when there are none", () => {
    vi.stubEnv("GUIDE_CONTENT_DIR", path.resolve(__dirname, "../no-such-dir"));
    expect(sitemap().map((e) => e.url)).toEqual(["https://orizons.xyz"]);
  });
});

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
