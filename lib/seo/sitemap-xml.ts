/**
 * The sitemap as XML: the sitemaps.org 0.9 protocol
 * (https://www.sitemaps.org/protocol.html), with Google's video extension
 * (http://www.google.com/schemas/sitemap-video/1.1) on pages that play videos.
 *
 * Written here rather than by Next's app/sitemap.ts because Next 14's
 * MetadataRoute.Sitemap has no field for videos (images and videos arrived in
 * Next 15), and because its writer puts each value into the XML unescaped.
 * Every value here is escaped, so a `&` in a player URL or an apostrophe in a
 * title cannot break the file.
 */

import type { SitemapEntry, SitemapVideo } from "./sitemap";

/** The most URLs one sitemap file may list (sitemaps.org). */
export const MAX_SITEMAP_URLS = 50_000;

const SITEMAP_NS = "http://www.sitemaps.org/schemas/sitemap/0.9";
const VIDEO_NS = "http://www.google.com/schemas/sitemap-video/1.1";

const ENTITIES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&apos;",
};

/** Text made safe for an XML element. */
export function escapeXml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ENTITIES[c]);
}

const tag = (name: string, value: string | number, indent: string) =>
  `${indent}<${name}>${escapeXml(String(value))}</${name}>`;

/** Children in the order sitemap-video/1.1's schema requires them. */
function videoLines(video: SitemapVideo): string[] {
  const i = "      ";
  return [
    "    <video:video>",
    tag("video:thumbnail_loc", video.thumbnailLoc, i),
    tag("video:title", video.title, i),
    tag("video:description", video.description, i),
    tag("video:player_loc", video.playerLoc, i),
    tag("video:duration", video.durationSeconds, i),
    tag("video:publication_date", video.publicationDate, i),
    "    </video:video>",
  ];
}

export function renderSitemap(entries: readonly SitemapEntry[]): string {
  if (entries.length > MAX_SITEMAP_URLS) {
    throw new RangeError(
      `a sitemap may list at most ${MAX_SITEMAP_URLS} URLs; this one has ${entries.length}`,
    );
  }
  const hasVideos = entries.some((e) => e.videos?.length);
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<urlset xmlns="${SITEMAP_NS}"${hasVideos ? ` xmlns:video="${VIDEO_NS}"` : ""}>`,
  ];
  for (const entry of entries) {
    lines.push("  <url>", tag("loc", entry.loc, "    "));
    if (entry.lastmod) lines.push(tag("lastmod", entry.lastmod, "    "));
    for (const video of entry.videos ?? []) lines.push(...videoLines(video));
    lines.push("  </url>");
  }
  lines.push("</urlset>", "");
  return lines.join("\n");
}
