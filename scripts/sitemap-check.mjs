#!/usr/bin/env node
/**
 * Checks a running site's robots.txt, sitemap.xml and every URL the sitemap
 * lists (lib/seo/crawl-check.mjs says what is checked). Exits 1 on any
 * problem, listing each.
 *
 *   node scripts/sitemap-check.mjs http://localhost:3881   # a local build
 *   npm run sitemap:check                                   # orizons.xyz
 */
import { pathToFileURL } from "node:url";
import { SITE_URL, checkSite } from "../lib/seo/crawl-check.mjs";

async function main() {
  const origin = process.argv[2] || process.env.SITEMAP_ORIGIN || SITE_URL;
  const { locs, problems } = await checkSite(origin);
  console.log(`${origin}: ${locs.length} URLs listed`);
  for (const loc of locs) console.log(`  ${loc}`);
  if (problems.length) {
    console.error(`\n${problems.length} problem(s):`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log("\nrobots.txt and sitemap.xml are sound; every URL answered.");
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
