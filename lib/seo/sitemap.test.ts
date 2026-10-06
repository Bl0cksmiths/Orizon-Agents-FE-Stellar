/**
 * The sitemap lists every public, indexable page at the exact URL its
 * canonical names, each dated by its own content and never by the build.
 */

import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PublishedDemo } from "@/lib/demo/load";
import { demoLastmod, demoVideos, newestDay, sitemapEntries } from "./sitemap";

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

/**
 * Every page route in app/, as its path: route groups dropped, the console
 * (app/app/**) left out. Dynamic segments stay as written, e.g. /guide/[slug].
 */
function pageRoutes(dir = path.join(root, "app"), segments: string[] = []) {
  const routes: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isFile() && /^page\.(tsx|ts|jsx|js|mdx)$/.test(entry.name)) {
      routes.push(`/${segments.join("/")}`);
    }
    if (!entry.isDirectory() || entry.name.startsWith("_")) continue;
    const next = /^\(.*\)$/.test(entry.name)
      ? segments
      : [...segments, entry.name];
    if (next[0] === "app" || next[0] === "api") continue;
    routes.push(...pageRoutes(path.join(dir, entry.name), next));
  }
  return routes;
}
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
      "https://orizons.xyz/litepaper/orizon-agents-litepaper.pdf",
    ]);
  });

  it("lists neither the guide index nor any guide when there are none", () => {
    vi.stubEnv("GUIDE_CONTENT_DIR", path.join(root, "no-such-dir"));
    expect(locs()).toEqual([
      "https://orizons.xyz",
      "https://orizons.xyz/demo",
      "https://orizons.xyz/evidence",
      "https://orizons.xyz/litepaper",
      "https://orizons.xyz/litepaper/orizon-agents-litepaper.pdf",
    ]);
  });

  it("lists every page in app/ outside the console, and only those", () => {
    const pages = pageRoutes().flatMap((route) =>
      route === "/guide/[slug]"
        ? ["/guide/list-your-agent"]
        : [route === "/" ? "" : route],
    );
    expect(pages.some((p) => p.includes("["))).toBe(false);
    const html = locs().filter((loc) => !loc.endsWith(".pdf"));
    expect([...html].sort()).toEqual(
      pages.map((p) => `https://orizons.xyz${p}`).sort(),
    );
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

  it("dates the litepaper's PDF by the same cover", () => {
    expect(
      lastmod("https://orizons.xyz/litepaper/orizon-agents-litepaper.pdf"),
    ).toBe("2026-09-27");
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

describe("sitemapEntries: the demo's videos", () => {
  const demoEntry = () =>
    sitemapEntries().find((e) => e.loc === "https://orizons.xyz/demo");

  it("lists no video while the demo is unpublished", () => {
    expect(demoEntry()?.videos).toBeUndefined();
  });

  it("lists each published part on /demo, in the order they are watched", () => {
    vi.stubEnv("DEMO_CONTENT_DIR", path.join(fixtures, "demo/published"));
    vi.stubEnv("DEMO_PUBLIC_DIR", path.join(fixtures, "demo/public"));
    expect(demoEntry()?.videos).toEqual([
      {
        title: "Fixture: an operator registers an agent",
        description:
          "Part 1: The operator's side of the Orizon Agents demo on Stellar testnet. What Orizon is; An operator registers and binds an agent; External operators on the ecosystem page.",
        thumbnailLoc: "https://i.ytimg.com/vi/fixtureOpr1/hqdefault.jpg",
        playerLoc:
          "https://www.youtube-nocookie.com/embed/fixtureOpr1?autoplay=1&rel=0&cc_load_policy=1",
        durationSeconds: 150,
        publicationDate: "2026-10-02",
      },
      {
        title: "Fixture: a buyer pays for a workflow",
        description:
          "Part 2: The buyer's side of the Orizon Agents demo on Stellar testnet. A buyer connects a wallet; A buyer's plan excludes a sub-floor agent; A dispute is credited and the score falls.",
        thumbnailLoc: "https://i.ytimg.com/vi/fixtureBuy2/hqdefault.jpg",
        playerLoc:
          "https://www.youtube-nocookie.com/embed/fixtureBuy2?autoplay=1&rel=0&cc_load_policy=1",
        durationSeconds: 102,
        publicationDate: "2026-07-24",
      },
    ]);
  });

  it("puts videos on no other page", () => {
    vi.stubEnv("DEMO_CONTENT_DIR", path.join(fixtures, "demo/published"));
    vi.stubEnv("DEMO_PUBLIC_DIR", path.join(fixtures, "demo/public"));
    const withVideos = sitemapEntries().filter((e) => e.videos);
    expect(withVideos.map((e) => e.loc)).toEqual(["https://orizons.xyz/demo"]);
  });

  it("keeps a description within the 2,048 characters a video sitemap allows", () => {
    const long = {
      status: "published",
      parts: [
        {
          role: "operator",
          id: "x",
          title: "t",
          duration_seconds: 1,
          published_at: "2026-10-02",
          chapters: Array.from({ length: 200 }, (_, i) => ({
            title: `Chapter ${i} with a fairly long title to fill the space`,
          })),
        },
      ],
    } as unknown as PublishedDemo;
    const [video] = demoVideos(long);
    expect(video.description.length).toBe(2048);
    expect(video.description.endsWith("…")).toBe(true);
  });
});
