/**
 * What /sitemap.xml lists: every public, indexable page, at the exact URL its
 * `<link rel="canonical">` names, dated by its own content.
 *
 * Every lastmod is a W3C day (YYYY-MM-DD) read from content, never the build
 * time: a rebuild must not claim that every page changed, or search engines
 * learn to ignore the dates altogether.
 *
 * - The home page: content/site.json (lib/seo/site.ts says why).
 * - Each guide: its own `updated` frontmatter; the guide index, its newest.
 * - /demo: the newer of its newest part's publication day and the day its
 *   evidence table was generated; undated while unpublished.
 * - /evidence: its snapshot's as-of day.
 * - /litepaper and its PDF: the litepaper's cover date.
 *
 * The PDF is listed because it is the litepaper itself, the document a reader
 * cites and shares, at a stable URL. Its other renderings (the HTML book, the
 * Word file, the Markdown) say the same words, so listing them too would only
 * ask search engines to index duplicates.
 *
 * /demo also lists the videos it plays (Google's video sitemap extension), so
 * the demo can be found as a video at orizons.xyz/demo, not only on YouTube.
 *
 * Left out on purpose: /app/** (the console, which is noindexed; listing a
 * noindexed URL contradicts it), /api/** (JSON, not pages), and the error and
 * not-found pages.
 *
 * Locs are written the way Next writes the pages' canonicals from
 * metadataBase: the root as `https://orizons.xyz`, with no trailing slash,
 * and every other page without one either.
 */

import { SITE_URL, guidePath } from "@/lib/guide/display";
import { loadAllGuides } from "@/lib/guide/load";
import {
  DEMO_PATH,
  partHeading,
  youtubeEmbedUrl,
  youtubePosterUrl,
} from "@/lib/demo/display";
import { type PublishedDemo, loadDemo } from "@/lib/demo/load";
import { EVIDENCE_PATH } from "@/lib/evidence/display";
import { loadEvidence } from "@/lib/evidence/load";
import { LITEPAPER_PATH } from "@/lib/litepaper/display";
import { loadLitepaper } from "@/lib/litepaper/load";
import { loadSite } from "./site";

/**
 * A video the page plays, as Google's video sitemap extension describes one
 * (https://developers.google.com/search/docs/crawling-indexing/sitemaps/video-sitemaps).
 */
export type SitemapVideo = {
  title: string;
  /** At most 2,048 characters. */
  description: string;
  thumbnailLoc: string;
  /** The embeddable player the page itself loads. */
  playerLoc: string;
  durationSeconds: number;
  /** YYYY-MM-DD */
  publicationDate: string;
};

export type SitemapEntry = {
  /** Absolute, and equal to the page's canonical URL. */
  loc: string;
  /** The day its content last changed, YYYY-MM-DD; absent when unknown. */
  lastmod?: string;
  /** The videos the page plays, when it is a page for watching them. */
  videos?: SitemapVideo[];
};

/** The longest description a video sitemap allows. */
export const VIDEO_DESCRIPTION_MAX = 2048;

/** The newest of some YYYY-MM-DD days: they sort as strings. */
export function newestDay(days: readonly string[]): string | undefined {
  return [...days].sort().at(-1);
}

/**
 * The published demo's day: what the page shows is its videos and the
 * evidence table under them, so it changed when either last did.
 */
export function demoLastmod(demo: PublishedDemo): string {
  const evidenceDay = new Date(demo.evidence.generated_at * 1000)
    .toISOString()
    .slice(0, 10);
  return newestDay([...demo.parts.map((p) => p.published_at), evidenceDay])!;
}

/** Cut to `max` characters, ending on an ellipsis when anything was cut. */
function clip(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

/**
 * The published demo's parts, as video sitemap entries for /demo. Each is
 * described by what the page says of it: its part heading and its chapters.
 */
export function demoVideos(demo: PublishedDemo): SitemapVideo[] {
  return demo.parts.map((part, index) => ({
    title: part.title,
    description: clip(
      `${partHeading(index, part.role)} of the Orizon Agents demo on Stellar testnet. ${part.chapters.map((c) => c.title).join("; ")}.`,
      VIDEO_DESCRIPTION_MAX,
    ),
    thumbnailLoc: youtubePosterUrl(part.id),
    playerLoc: youtubeEmbedUrl(part.id),
    durationSeconds: part.duration_seconds,
    publicationDate: part.published_at,
  }));
}

export function sitemapEntries(): SitemapEntry[] {
  const site = loadSite();
  const guides = loadAllGuides();
  const demo = loadDemo();
  const evidence = loadEvidence();
  const litepaper = loadLitepaper();
  return [
    { loc: SITE_URL, lastmod: site.home.updated },
    ...(guides.length
      ? [
          {
            loc: `${SITE_URL}/guide`,
            lastmod: newestDay(guides.map((g) => g.meta.updated)),
          },
          ...guides.map((guide) => ({
            loc: `${SITE_URL}${guidePath(guide.slug)}`,
            lastmod: guide.meta.updated,
          })),
        ]
      : []),
    {
      loc: `${SITE_URL}${DEMO_PATH}`,
      ...(demo.status === "published"
        ? { lastmod: demoLastmod(demo), videos: demoVideos(demo) }
        : {}),
    },
    {
      loc: `${SITE_URL}${EVIDENCE_PATH}`,
      lastmod: evidence.snapshot.as_of,
    },
    { loc: `${SITE_URL}${LITEPAPER_PATH}`, lastmod: litepaper.date },
    ...litepaper.downloads
      .filter((file) => file.format === "pdf")
      .map((pdf) => ({
        loc: `${SITE_URL}${pdf.href}`,
        lastmod: litepaper.date,
      })),
  ];
}
