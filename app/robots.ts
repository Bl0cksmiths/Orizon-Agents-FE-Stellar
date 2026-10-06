import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/guide/display";

/**
 * /robots.txt: every crawler may read every page, and none the API.
 *
 * /api/ is disallowed: it is the backend's JSON, proxied (next.config.mjs),
 * with nothing to index and a cold start a crawler should not trigger. No
 * public page needs it to render; the home page's figures are read on the
 * server.
 *
 * /app/ (the console) is NOT disallowed, on purpose. It is kept out of search
 * by its `noindex` (app/app/layout.tsx), and a crawler only sees a noindex on
 * a page it is allowed to fetch. Disallowing it would hide that noindex, and
 * a console URL linked from elsewhere could then still be indexed, as a bare
 * "blocked by robots.txt" result. Crawlable and noindexed is what Google's
 * documentation prescribes for keeping a page out of its index.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: "/api/",
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
