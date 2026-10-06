/**
 * /sitemap.xml and /robots.txt as a crawler reads them, from the dev server
 * (fixture guides, evidence and litepaper; the unpublished demo).
 *
 * Asserted:
 *   - robots.txt names the sitemap and blocks only /api/;
 *   - sitemap.xml is application/xml, and every URL it lists answers 200 at
 *     its own address, with no noindex, naming itself as its canonical
 *     (lib/seo/crawl-check.mjs, which npm run sitemap:check runs against
 *     production);
 *   - the pages it leaves out do not claim another page's address: the
 *     console is noindexed and names no canonical, and neither does a 404.
 */
import { expect, test } from "@playwright/test";
import { checkSite } from "../lib/seo/crawl-check.mjs";

/** Every canonical link in a page's HTML. */
function canonicals(html: string): string[] {
  return [...html.matchAll(/<link\b[^>]*rel="canonical"[^>]*>/g)].map(
    (m) => /href="([^"]*)"/.exec(m[0])?.[1] ?? "",
  );
}

test("every URL the sitemap lists answers 200, indexable, canonical to itself", async ({
  baseURL,
}) => {
  const { locs, problems } = await checkSite(baseURL!);
  expect(problems).toEqual([]);
  expect(locs).toEqual([
    "https://orizons.xyz",
    "https://orizons.xyz/guide",
    "https://orizons.xyz/guide/list-your-agent",
    "https://orizons.xyz/demo",
    "https://orizons.xyz/evidence",
    "https://orizons.xyz/litepaper",
    "https://orizons.xyz/litepaper/orizon-agents-litepaper.pdf",
  ]);
});

test("the console is noindexed and claims no canonical", async ({
  request,
}) => {
  for (const path of ["/app", "/app/agents"]) {
    const res = await request.get(path);
    expect(res.status()).toBe(200);
    const html = await res.text();
    expect(html).toMatch(/<meta name="robots" content="noindex, nofollow"\/>/);
    expect(canonicals(html), path).toEqual([]);
  }
});

test("a missing page claims no canonical", async ({ request }) => {
  const res = await request.get("/no-such-page");
  expect(res.status()).toBe(404);
  expect(canonicals(await res.text())).toEqual([]);
});
