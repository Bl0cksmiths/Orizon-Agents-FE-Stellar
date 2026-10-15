/**
 * lib/seo/crawl-check.mjs: what it reads out of a sitemap, a robots.txt
 * and a page, and what it calls a problem, against a fake site.
 */

import { describe, expect, it } from "vitest";
import {
  checkSite,
  pageProblems,
  parseRobots,
  parseSitemapLocs,
} from "./crawl-check.mjs";

const SITE = "https://orizons.xyz";

const page = (canonical: string | null, robots: string | null = null) =>
  `<!DOCTYPE html><html><head>${
    robots === null ? "" : `<meta name="robots" content="${robots}"/>`
  }${canonical === null ? "" : `<link rel="canonical" href="${canonical}"/>`}</head><body></body></html>`;

const HTML = { "content-type": "text/html; charset=utf-8" };

describe("parseSitemapLocs", () => {
  it("reads every loc, unescaped", () => {
    expect(
      parseSitemapLocs(
        `<urlset><url><loc>https://a.test/x?b=1&amp;c=2</loc></url>\n<url>\n  <loc>https://a.test</loc>\n</url></urlset>`,
      ),
    ).toEqual(["https://a.test/x?b=1&c=2", "https://a.test"]);
  });

  it("trims the blanks around a loc, and skips one never closed", () => {
    expect(
      parseSitemapLocs(
        "<loc>\n\t https://a.test/y \r\n</loc><loc> </loc><loc>https://a.test/z",
      ),
    ).toEqual(["https://a.test/y", ""]);
  });

  it("reads a loc of thousands of blanks in linear time", () => {
    const started = performance.now();
    const blanks = " ".repeat(100_000);
    expect(parseSitemapLocs(`<loc>${blanks}x${blanks}`)).toEqual([]);
    expect(parseSitemapLocs(`<loc>${blanks}x${blanks}</loc>`)).toEqual(["x"]);
    expect(performance.now() - started).toBeLessThan(500);
  });
});

describe("parseRobots", () => {
  it("reads its groups and sitemaps, whatever the case of the field names", () => {
    expect(
      parseRobots(
        "User-Agent: *\nAllow: /\nDisallow: /api/\n\nsitemap: https://a.test/sitemap.xml\n",
      ),
    ).toEqual({
      groups: [{ agents: ["*"], allow: ["/"], disallow: ["/api/"] }],
      sitemaps: ["https://a.test/sitemap.xml"],
    });
  });

  it("groups consecutive agents, and ignores comments, rules outside a group and empty rules", () => {
    expect(
      parseRobots(
        [
          "Disallow: /early",
          "# a comment line",
          "User-agent: a",
          "User-agent: b # trailing comment",
          "Disallow:",
          "Disallow: /x",
          "Crawl-delay: 5",
          "User-agent: c",
          "Allow: /y",
          "not a field",
          "User-agent: d",
        ].join("\r\n"),
      ),
    ).toEqual({
      groups: [
        { agents: ["a", "b"], allow: [], disallow: ["/x"] },
        { agents: ["c"], allow: ["/y"], disallow: [] },
        { agents: ["d"], allow: [], disallow: [] },
      ],
      sitemaps: [],
    });
  });

  it("reads a value after any blanks, and skips one broken across lines", () => {
    const lineSeparator = String.fromCharCode(0x2028);
    expect(
      parseRobots(
        [
          "User-agent:\t \t*",
          `Disallow:${lineSeparator} /a`,
          `Disallow: /b${lineSeparator}c`,
          "Allow  :",
        ].join("\n"),
      ),
    ).toEqual({
      groups: [{ agents: ["*"], allow: [], disallow: ["/a"] }],
      sitemaps: [],
    });
  });

  it("reads a line of thousands of blanks in linear time", () => {
    const lineSeparator = String.fromCharCode(0x2028);
    const started = performance.now();
    const blanks = " ".repeat(100_000);
    expect(
      parseRobots(`User-agent: *\nDisallow:${blanks}x${lineSeparator}y`),
    ).toEqual({
      groups: [{ agents: ["*"], allow: [], disallow: [] }],
      sitemaps: [],
    });
    expect(performance.now() - started).toBeLessThan(500);
  });
});

describe("pageProblems", () => {
  const loc = `${SITE}/guide`;

  it("passes a page that answers 200, indexable, canonical to its loc", () => {
    expect(
      pageProblems(loc, { status: 200, headers: HTML, body: page(loc) }),
    ).toEqual([]);
  });

  it("passes a PDF that answers 200 with no noindex", () => {
    expect(
      pageProblems(`${SITE}/a.pdf`, {
        status: 200,
        headers: { "content-type": "application/pdf" },
        body: "%PDF-1.7",
      }),
    ).toEqual([]);
  });

  it.each([
    ["a redirect", { status: 308, headers: HTML, body: "" }, /answered 308/],
    [
      "a noindex meta",
      { status: 200, headers: HTML, body: page(loc, "noindex, nofollow") },
      /noindex/,
    ],
    [
      "a noindex header",
      {
        status: 200,
        headers: { ...HTML, "x-robots-tag": "noindex" },
        body: page(loc),
      },
      /X-Robots-Tag/,
    ],
    [
      "no canonical",
      { status: 200, headers: HTML, body: page(null) },
      /no canonical/,
    ],
    [
      "another canonical",
      { status: 200, headers: HTML, body: page(`${loc}/`) },
      /canonical is https:\/\/orizons\.xyz\/guide\/, not its loc/,
    ],
  ])("fails %s", (_, response, problem) => {
    const problems = pageProblems(loc, response);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(problem);
  });

  it("reads attributes with blanks around '=', a namespaced name and any case", () => {
    const body = `<head><meta NAME = "robots" xml:lang="en" content=\n"noindex"/><link REL="canonical" data-x-y="1" href="${loc}"/></head>`;
    expect(pageProblems(loc, { status: 200, headers: HTML, body })).toEqual([
      "its robots meta says noindex",
    ]);
  });

  it("reads a tag with a long unquoted name in linear time", () => {
    const started = performance.now();
    const body = `<head><meta ${"a".repeat(100_000)} ${"b:".repeat(50_000)}= x/><link rel="canonical" href="${loc}"/></head>`;
    expect(pageProblems(loc, { status: 200, headers: HTML, body })).toEqual([]);
    expect(performance.now() - started).toBeLessThan(500);
  });
});

describe("checkSite", () => {
  const ROBOTS = `User-Agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: ${SITE}/sitemap.xml\n`;
  const sitemap = (...locs: string[]) =>
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${locs
      .map((l) => `<url><loc>${l}</loc></url>`)
      .join("\n")}\n</urlset>\n`;

  /** A fake site at http://localhost:1 serving `files` by path. */
  function site(
    files: Record<
      string,
      { status?: number; headers?: Record<string, string>; body: string }
    >,
  ) {
    const asked: string[] = [];
    const fetchImpl = async (url: string) => {
      const { pathname } = new URL(url);
      asked.push(pathname);
      const file = files[pathname];
      return new Response(file?.body ?? "not found", {
        status: file ? (file.status ?? 200) : 404,
        headers: file?.headers ?? HTML,
      });
    };
    return { fetchImpl, asked };
  }

  const robots = { headers: { "content-type": "text/plain" }, body: ROBOTS };
  const xml = (body: string) => ({
    headers: { "content-type": "application/xml" },
    body,
  });

  it("passes a site whose every listed page is indexable and canonical", async () => {
    const { fetchImpl, asked } = site({
      "/robots.txt": robots,
      "/sitemap.xml": xml(sitemap(SITE, `${SITE}/guide`)),
      "/": { body: page(SITE) },
      "/guide": { body: page(`${SITE}/guide`) },
    });
    const result = await checkSite("http://localhost:1", { fetchImpl });
    expect(result.problems).toEqual([]);
    expect(result.locs).toEqual([SITE, `${SITE}/guide`]);
    expect(asked).toEqual(["/robots.txt", "/sitemap.xml", "/", "/guide"]);
  });

  it("reports every problem it finds, each naming where", async () => {
    const { fetchImpl } = site({
      "/robots.txt": {
        headers: { "content-type": "text/plain" },
        body: "User-Agent: *\nAllow: /\nDisallow: /guide\n",
      },
      "/sitemap.xml": {
        headers: { "content-type": "text/xml" },
        body: sitemap(
          SITE,
          `${SITE}/guide`,
          `${SITE}/guide`,
          "http://orizons.xyz/x?y=1",
          `${SITE}/gone`,
        ),
      },
      "/": { body: page(SITE) },
      "/guide": { body: page(`${SITE}/guide`) },
      "/x": { body: page("http://orizons.xyz/x?y=1") },
    });
    const { problems } = await checkSite("http://localhost:1", { fetchImpl });
    expect(problems).toEqual([
      "robots.txt names no Sitemap: https://orizons.xyz/sitemap.xml",
      "robots.txt does not disallow /api/",
      "sitemap.xml is served as text/xml, not application/xml",
      "sitemap.xml lists https://orizons.xyz/guide twice",
      "http://orizons.xyz/x?y=1: not an https://orizons.xyz URL",
      "http://orizons.xyz/x?y=1: has a query string",
      "https://orizons.xyz/guide: robots.txt disallows it (Disallow: /guide)",
      "https://orizons.xyz/gone: answered 404, not 200",
    ]);
  });

  it("reports failed answers, a missing declaration and unfetchable locs", async () => {
    const { fetchImpl, asked } = site({
      "/robots.txt": { ...robots, status: 500 },
      "/sitemap.xml": {
        status: 503,
        headers: { "content-type": "text/xml" },
        body: `<urlset><url><loc>not-a-url</loc></url><url><loc>${SITE}/a#top</loc></url><url><loc>${SITE}</loc></url></urlset>`,
      },
      "/": { body: page(SITE) },
    });
    const { problems } = await checkSite("http://localhost:1", { fetchImpl });
    expect(problems).toEqual([
      "robots.txt answered 500, not 200",
      "sitemap.xml answered 503, not 200",
      "sitemap.xml does not declare XML 1.0 in UTF-8 first",
      "not-a-url: not an absolute URL",
      "https://orizons.xyz/a#top: has a fragment",
    ]);
    expect(asked).toEqual(["/robots.txt", "/sitemap.xml", "/"]);
  });

  it("reports a robots.txt served as something other than text", async () => {
    const { fetchImpl } = site({
      "/robots.txt": { body: ROBOTS },
      "/sitemap.xml": xml(sitemap(SITE)),
      "/": { body: page(SITE) },
    });
    const { problems } = await checkSite("http://localhost:1", { fetchImpl });
    expect(problems).toEqual([
      "robots.txt is served as text/html; charset=utf-8, not text/plain",
    ]);
  });

  it("reports a sitemap over 50 MB and over 50,000 URLs", async () => {
    const locs = Array.from({ length: 50_001 }, () => SITE);
    const padding = `<!--${"x".repeat(50 * 1024 * 1024)}-->`;
    const { fetchImpl } = site({
      "/robots.txt": robots,
      "/sitemap.xml": xml(
        sitemap(...locs).replace("</urlset>", `${padding}</urlset>`),
      ),
      "/": { body: page(SITE) },
    });
    const { locs: unique, problems } = await checkSite("http://localhost:1", {
      fetchImpl,
    });
    expect(unique).toEqual([SITE]);
    expect(problems).toEqual([
      "sitemap.xml is larger than 50 MB",
      "sitemap.xml lists 50001 URLs, over 50,000",
      "sitemap.xml lists https://orizons.xyz twice",
    ]);
  });

  it("drops the origin's trailing slashes, in linear time", async () => {
    const asked: string[] = [];
    const fetchImpl = async (url: string): Promise<Response> => {
      asked.push(url);
      throw new Error("offline");
    };
    const slashes = "/".repeat(100_000);
    const started = performance.now();
    for (const origin of [
      "http://localhost:1///",
      "http://localhost:1",
      `http://localhost:1${slashes}x`,
    ]) {
      await expect(checkSite(origin, { fetchImpl })).rejects.toThrow("offline");
    }
    expect(performance.now() - started).toBeLessThan(500);
    expect(asked).toEqual([
      "http://localhost:1/robots.txt",
      "http://localhost:1/robots.txt",
      `http://localhost:1${slashes}x/robots.txt`,
    ]);
  });
});
