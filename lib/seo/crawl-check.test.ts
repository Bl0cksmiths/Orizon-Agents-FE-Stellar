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
});
