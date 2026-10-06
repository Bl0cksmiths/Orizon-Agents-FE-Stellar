import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sitemapEntries } from "@/lib/seo/sitemap";
import { renderSitemap } from "@/lib/seo/sitemap-xml";
import { GET, dynamic } from "./route";

const fixtures = path.resolve(__dirname, "../../test/fixtures");

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

describe("GET /sitemap.xml", () => {
  it("serves the sitemap's entries as XML", async () => {
    const res = GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/xml");
    expect(await res.text()).toBe(renderSitemap(sitemapEntries()));
  });

  it("lists the demo's videos", async () => {
    const xml = await GET().text();
    expect(xml).toContain(
      'xmlns:video="http://www.google.com/schemas/sitemap-video/1.1"',
    );
    expect(xml.match(/<video:video>/g)).toHaveLength(2);
  });

  it("is built once, at build time", () => {
    expect(dynamic).toBe("force-static");
  });
});
