/**
 * What /sitemap.xml lists: every public, indexable page, at the exact URL its
 * `<link rel="canonical">` names, dated by its own content.
 *
 * Every lastmod is a W3C day (YYYY-MM-DD) read from content, never the build
 * time: a rebuild must not claim that every page changed, or search engines
 * learn to ignore the dates altogether.
 *
 * - The home page: content/site.json (lib/seo/site.ts says why).
 * - Each guide: its own `updated` frontmatter.
 * - /demo: its newest part's publication day; undated while unpublished.
 * - /evidence: its snapshot's as-of day.
 * - /litepaper: the litepaper's cover date.
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
import { DEMO_PATH } from "@/lib/demo/display";
import { loadDemo } from "@/lib/demo/load";
import { EVIDENCE_PATH } from "@/lib/evidence/display";
import { loadEvidence } from "@/lib/evidence/load";
import { LITEPAPER_PATH } from "@/lib/litepaper/display";
import { loadLitepaper } from "@/lib/litepaper/load";
import { loadSite } from "./site";

export type SitemapEntry = {
  /** Absolute, and equal to the page's canonical URL. */
  loc: string;
  /** The day its content last changed, YYYY-MM-DD; absent when unknown. */
  lastmod?: string;
};

/** The newest of some YYYY-MM-DD days: they sort as strings. */
export function newestDay(days: readonly string[]): string | undefined {
  return [...days].sort().at(-1);
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
          { loc: `${SITE_URL}/guide` },
          ...guides.map((guide) => ({
            loc: `${SITE_URL}${guidePath(guide.slug)}`,
            lastmod: guide.meta.updated,
          })),
        ]
      : []),
    {
      loc: `${SITE_URL}${DEMO_PATH}`,
      ...(demo.status === "published"
        ? { lastmod: newestDay(demo.parts.map((p) => p.published_at)) }
        : {}),
    },
    {
      loc: `${SITE_URL}${EVIDENCE_PATH}`,
      lastmod: evidence.snapshot.as_of,
    },
    { loc: `${SITE_URL}${LITEPAPER_PATH}`, lastmod: litepaper.date },
  ];
}
