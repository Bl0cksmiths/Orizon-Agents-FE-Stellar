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
      "https://orizons.xyz/demo",
      "https://orizons.xyz/evidence",
      "https://orizons.xyz/guide/list-your-agent",
    ]);
    expect(entries[4].lastModified).toEqual(new Date("2026-09-29T00:00:00Z"));
  });

  it("lists no guide pages when there are none", () => {
    vi.stubEnv("GUIDE_CONTENT_DIR", path.resolve(__dirname, "../no-such-dir"));
    expect(sitemap().map((e) => e.url)).toEqual([
      "https://orizons.xyz",
      "https://orizons.xyz/demo",
      "https://orizons.xyz/evidence",
    ]);
  });

  it("lists the demo undated until it is published, then dated by its video", () => {
    const fixtures = path.resolve(__dirname, "../test/fixtures/demo");
    vi.stubEnv("DEMO_CONTENT_DIR", path.join(fixtures, "unpublished"));
    const before = sitemap().find((e) => e.url === "https://orizons.xyz/demo");
    expect(before).toBeDefined();
    expect(before!.lastModified).toBeUndefined();

    vi.stubEnv("DEMO_CONTENT_DIR", path.join(fixtures, "published"));
    vi.stubEnv("DEMO_PUBLIC_DIR", path.join(fixtures, "public"));
    const after = sitemap().find((e) => e.url === "https://orizons.xyz/demo");
    expect(after!.lastModified).toEqual(new Date("2026-10-02T00:00:00Z"));
  });
});

describe("sitemap: evidence", () => {
  it("lists /evidence dated by its snapshot", () => {
    vi.stubEnv(
      "EVIDENCE_CONTENT_DIR",
      path.resolve(__dirname, "../test/fixtures/evidence"),
    );
    const entry = sitemap().find(
      (e) => e.url === "https://orizons.xyz/evidence",
    );
    expect(entry?.lastModified).toEqual(new Date("2026-09-28T00:00:00Z"));
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
