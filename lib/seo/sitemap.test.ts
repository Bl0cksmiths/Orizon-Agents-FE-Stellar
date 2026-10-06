/**
 * The sitemap lists every public, indexable page at the exact URL its
 * canonical names, each dated by its own content and never by the build.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PublishedDemo } from "@/lib/demo/load";
import { demoLastmod, newestDay, sitemapEntries } from "./sitemap";

const root = path.resolve(__dirname, "../..");
const fixtures = path.join(root, "test/fixtures");

// Every case reads the fixtures, so none changes when the real content does.
beforeEach(() => {
  vi.stubEnv("GUIDE_CONTENT_DIR", path.join(fixtures, "guides"));
  vi.stubEnv("DEMO_CONTENT_DIR", path.join(fixtures, "demo/unpublished"));
  vi.stubEnv("EVIDENCE_CONTENT_DIR", path.join(fixtures, "evidence"));
  vi.stubEnv("LITEPAPER_DIR", path.join(fixtures, "litepaper"));
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

const locs = () => sitemapEntries().map((e) => e.loc);
const lastmod = (loc: string) =>
  sitemapEntries().find((e) => e.loc === loc)?.lastmod;

describe("sitemapEntries: the URL set", () => {
  it("lists every public page, in the site's order", () => {
    expect(locs()).toEqual([
      "https://orizons.xyz",
      "https://orizons.xyz/guide",
      "https://orizons.xyz/guide/list-your-agent",
      "https://orizons.xyz/demo",
      "https://orizons.xyz/evidence",
      "https://orizons.xyz/litepaper",
    ]);
  });

  it("lists neither the guide index nor any guide when there are none", () => {
    vi.stubEnv("GUIDE_CONTENT_DIR", path.join(root, "no-such-dir"));
    expect(locs()).toEqual([
      "https://orizons.xyz",
      "https://orizons.xyz/demo",
      "https://orizons.xyz/evidence",
      "https://orizons.xyz/litepaper",
    ]);
  });

  it("lists nothing under the console or the API", () => {
    for (const loc of locs()) {
      expect(new URL(loc).pathname).not.toMatch(/^\/(app|api)(\/|$)/);
    }
  });

  it("lists absolute https URLs on orizons.xyz with no query, fragment or trailing slash", () => {
    for (const loc of locs()) {
      const url = new URL(loc);
      expect(url.origin).toBe("https://orizons.xyz");
      expect(url.search).toBe("");
      expect(url.hash).toBe("");
      expect(loc.endsWith("/")).toBe(false);
    }
  });

  it("fails the build when the litepaper is missing", () => {
    vi.stubEnv("LITEPAPER_DIR", path.join(root, "no-such-dir"));
    expect(() => sitemapEntries()).toThrow(/the litepaper cannot be published/);
  });
});

describe("newestDay", () => {
  it("picks the newest day, whatever the order", () => {
    expect(newestDay(["2026-09-29", "2026-10-02", "2025-12-31"])).toBe(
      "2026-10-02",
    );
  });

  it("has none to pick from nothing", () => {
    expect(newestDay([])).toBeUndefined();
  });
});

describe("demoLastmod", () => {
  const demo = (days: string[], generatedAt: number) =>
    ({
      status: "published",
      parts: days.map((published_at) => ({ published_at })),
      evidence: { generated_at: generatedAt },
    }) as unknown as PublishedDemo;

  it("is the newest part's day when the evidence table is older", () => {
    // 2026-10-01T12:05:00Z
    expect(demoLastmod(demo(["2026-07-24", "2026-10-02"], 1790856300))).toBe(
      "2026-10-02",
    );
  });

  it("is the evidence table's UTC day when it was regenerated after the videos", () => {
    // 2026-10-05T23:59:59Z, still the 5th in UTC
    expect(demoLastmod(demo(["2026-07-24", "2026-10-02"], 1791244799))).toBe(
      "2026-10-05",
    );
  });
});

describe("sitemapEntries: lastmod", () => {
  it("dates the home page by content/site.json", () => {
    const site = JSON.parse(
      readFileSync(path.join(root, "content/site.json"), "utf8"),
    ) as { home: { updated: string } };
    expect(lastmod("https://orizons.xyz")).toBe(site.home.updated);
  });

  it("dates the guide index by its newest guide", () => {
    expect(lastmod("https://orizons.xyz/guide")).toBe("2026-09-29");
  });

  it("dates each guide by its frontmatter", () => {
    expect(lastmod("https://orizons.xyz/guide/list-your-agent")).toBe(
      "2026-09-29",
    );
  });

  it("leaves the demo undated until it is published, then dates it by its newest part", () => {
    expect(lastmod("https://orizons.xyz/demo")).toBeUndefined();
    vi.stubEnv("DEMO_CONTENT_DIR", path.join(fixtures, "demo/published"));
    vi.stubEnv("DEMO_PUBLIC_DIR", path.join(fixtures, "demo/public"));
    expect(lastmod("https://orizons.xyz/demo")).toBe("2026-10-02");
  });

  it("dates /evidence by its snapshot", () => {
    expect(lastmod("https://orizons.xyz/evidence")).toBe("2026-09-28");
  });

  it("dates /litepaper by the litepaper's cover", () => {
    expect(lastmod("https://orizons.xyz/litepaper")).toBe("2026-09-27");
  });

  it("writes every date as a W3C day, never a time", () => {
    vi.stubEnv("DEMO_CONTENT_DIR", path.join(fixtures, "demo/published"));
    vi.stubEnv("DEMO_PUBLIC_DIR", path.join(fixtures, "demo/public"));
    for (const entry of sitemapEntries()) {
      if (entry.lastmod !== undefined) {
        expect(entry.lastmod).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }
    }
  });

  it("never dates a page by the build: the same content gives the same sitemap on any day", () => {
    vi.stubEnv("DEMO_CONTENT_DIR", path.join(fixtures, "demo/published"));
    vi.stubEnv("DEMO_PUBLIC_DIR", path.join(fixtures, "demo/public"));
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2030-01-01T12:00:00Z"));
    const later = sitemapEntries();
    vi.setSystemTime(new Date("2026-10-07T00:00:00Z"));
    expect(sitemapEntries()).toEqual(later);
    for (const entry of later) {
      expect(entry.lastmod ?? "").not.toMatch(/^2030-/);
    }
  });
});
