// @vitest-environment jsdom
/**
 * The sitemap's XML: the sitemaps.org 0.9 protocol, plus Google's video
 * extension on pages that play videos, escaped so any text survives.
 */

import { describe, expect, it } from "vitest";
import type { SitemapEntry } from "./sitemap";
import { MAX_SITEMAP_URLS, renderSitemap } from "./sitemap-xml";

const VIDEO = {
  title: "Part one",
  description: "The operator's side.",
  thumbnailLoc: "https://i.ytimg.com/vi/abc/hqdefault.jpg",
  playerLoc: "https://www.youtube-nocookie.com/embed/abc?autoplay=1&rel=0",
  durationSeconds: 189,
  publicationDate: "2026-10-02",
};

function parse(xml: string): Document {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  expect(doc.getElementsByTagName("parsererror")).toHaveLength(0);
  return doc;
}

describe("renderSitemap", () => {
  it("writes each page's loc and lastmod, and leaves an unknown date out", () => {
    expect(
      renderSitemap([
        { loc: "https://orizons.xyz", lastmod: "2026-10-02" },
        { loc: "https://orizons.xyz/demo" },
      ]),
    ).toBe(
      [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
        "  <url>",
        "    <loc>https://orizons.xyz</loc>",
        "    <lastmod>2026-10-02</lastmod>",
        "  </url>",
        "  <url>",
        "    <loc>https://orizons.xyz/demo</loc>",
        "  </url>",
        "</urlset>",
        "",
      ].join("\n"),
    );
  });

  it("writes a page's videos in the order the video schema requires, declaring its namespace", () => {
    expect(
      renderSitemap([{ loc: "https://orizons.xyz/demo", videos: [VIDEO] }]),
    ).toBe(
      [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:video="http://www.google.com/schemas/sitemap-video/1.1">',
        "  <url>",
        "    <loc>https://orizons.xyz/demo</loc>",
        "    <video:video>",
        "      <video:thumbnail_loc>https://i.ytimg.com/vi/abc/hqdefault.jpg</video:thumbnail_loc>",
        "      <video:title>Part one</video:title>",
        "      <video:description>The operator&apos;s side.</video:description>",
        "      <video:player_loc>https://www.youtube-nocookie.com/embed/abc?autoplay=1&amp;rel=0</video:player_loc>",
        "      <video:duration>189</video:duration>",
        "      <video:publication_date>2026-10-02</video:publication_date>",
        "    </video:video>",
        "  </url>",
        "</urlset>",
        "",
      ].join("\n"),
    );
  });

  it("escapes every character XML reserves, so any text reads back as written", () => {
    const nasty = `Tom & Jerry's <"quoted"> part`;
    const doc = parse(
      renderSitemap([
        {
          loc: "https://orizons.xyz/a?b=1&c=<2>",
          videos: [{ ...VIDEO, title: nasty, description: nasty }],
        },
      ]),
    );
    expect(doc.getElementsByTagName("loc")[0].textContent).toBe(
      "https://orizons.xyz/a?b=1&c=<2>",
    );
    expect(doc.getElementsByTagName("video:title")[0].textContent).toBe(nasty);
    expect(doc.getElementsByTagName("video:description")[0].textContent).toBe(
      nasty,
    );
  });

  it("refuses more URLs than one sitemap may hold", () => {
    const entries: SitemapEntry[] = Array.from(
      { length: MAX_SITEMAP_URLS + 1 },
      (_, i) => ({ loc: `https://orizons.xyz/p/${i}` }),
    );
    expect(() => renderSitemap(entries)).toThrow(/50000/);
    expect(() => renderSitemap(entries.slice(1))).not.toThrow();
  });
});
