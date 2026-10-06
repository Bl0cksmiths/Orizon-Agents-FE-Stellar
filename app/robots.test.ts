import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sitemapEntries } from "@/lib/seo/sitemap";
import robots from "./robots";

const fixtures = path.resolve(__dirname, "../test/fixtures");

beforeEach(() => {
  vi.stubEnv("GUIDE_CONTENT_DIR", path.join(fixtures, "guides"));
  vi.stubEnv("DEMO_CONTENT_DIR", path.join(fixtures, "demo/published"));
  vi.stubEnv("DEMO_PUBLIC_DIR", path.join(fixtures, "demo/public"));
  vi.stubEnv("EVIDENCE_CONTENT_DIR", path.join(fixtures, "evidence"));
  vi.stubEnv("LITEPAPER_DIR", path.join(fixtures, "litepaper"));
});

afterEach(() => {
  vi.unstubAllEnvs();
});

function onlyRule() {
  const { rules } = robots();
  const list = Array.isArray(rules) ? rules : [rules];
  expect(list).toHaveLength(1);
  return list[0];
}

describe("robots", () => {
  it("lets every crawler in, and keeps them out of the API alone", () => {
    expect(onlyRule()).toEqual({
      userAgent: "*",
      allow: "/",
      disallow: "/api/",
    });
  });

  it("leaves the console crawlable, so crawlers can read its noindex", () => {
    const disallow = [onlyRule().disallow ?? []].flat();
    for (const path of ["/app", "/app/agents"]) {
      expect(disallow.some((d) => path.startsWith(d))).toBe(false);
    }
  });

  it("blocks no page the sitemap lists", () => {
    const disallow = [onlyRule().disallow ?? []].flat();
    for (const { loc } of sitemapEntries()) {
      const { pathname } = new URL(loc);
      expect(disallow.some((d) => pathname.startsWith(d))).toBe(false);
    }
  });

  it("names the sitemap by its absolute URL", () => {
    expect(robots().sitemap).toBe("https://orizons.xyz/sitemap.xml");
    expect(robots().host).toBeUndefined();
  });
});
