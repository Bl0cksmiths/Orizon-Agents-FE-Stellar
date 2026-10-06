import { sitemapEntries } from "@/lib/seo/sitemap";
import { renderSitemap } from "@/lib/seo/sitemap-xml";

/**
 * /sitemap.xml: every public page, dated by its content, with the demo's
 * videos on /demo (lib/seo/sitemap.ts says what is listed and why).
 *
 * A route handler rather than app/sitemap.ts because Next 14's sitemap type
 * cannot carry videos (lib/seo/sitemap-xml.ts). Built once at `next build`,
 * from the same content the pages are built from, and served static.
 */
export const dynamic = "force-static";

export function GET(): Response {
  return new Response(renderSitemap(sitemapEntries()), {
    headers: { "Content-Type": "application/xml" },
  });
}
