#!/usr/bin/env node
/**
 * Checks a running site's /robots.txt and /sitemap.xml the way a crawler
 * reads them, and then every URL the sitemap lists.
 *
 * - robots.txt answers 200 as text/plain, names the sitemap by its absolute
 *   URL, disallows /api/, and blocks no URL the sitemap lists.
 * - sitemap.xml answers 200 as application/xml, declares UTF-8, lists at
 *   most 50,000 URLs, each once, each an https://orizons.xyz URL with no
 *   query or fragment.
 * - Every listed URL answers 200 itself (no redirect), carries no noindex
 *   (neither an X-Robots-Tag header nor a robots meta), and, when it is a
 *   page, names itself as its canonical, character for character.
 *
 * The sitemap's URLs are production URLs; each is fetched from the origin
 * under test at the same path, so a local `next start` is checked exactly as
 * production would be.
 *
 *   node scripts/sitemap-check.mjs http://localhost:3881   # a local build
 *   npm run sitemap:check                                   # orizons.xyz
 *
 * e2e/sitemap.spec.ts runs the same check against the Playwright server.
 */
import { pathToFileURL } from "node:url";

export const SITE_URL = "https://orizons.xyz";
const MAX_URLS = 50_000;
const MAX_BYTES = 50 * 1024 * 1024;

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

/** @param {string} text */
function unescapeXml(text) {
  return text.replace(/&(amp|lt|gt|quot|apos);/g, (_, name) => ENTITIES[name]);
}

/**
 * Every <loc> in a sitemap, unescaped.
 * @param {string} xml
 * @returns {string[]}
 */
export function parseSitemapLocs(xml) {
  return [...xml.matchAll(/<loc>\s*([^<]*?)\s*<\/loc>/g)].map((m) =>
    unescapeXml(m[1]),
  );
}

/**
 * A robots.txt's groups and Sitemap lines. Field names are case-insensitive.
 * @param {string} text
 * @returns {{ groups: { agents: string[], allow: string[], disallow: string[] }[], sitemaps: string[] }}
 */
export function parseRobots(text) {
  /** @type {{ agents: string[], allow: string[], disallow: string[] }[]} */
  const groups = [];
  /** @type {string[]} */
  const sitemaps = [];
  let current = null;
  let lastWasAgent = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    const m = /^([A-Za-z-]+)\s*:\s*(.*)$/.exec(line);
    if (!m) continue;
    const field = m[1].toLowerCase();
    const value = m[2].trim();
    if (field === "sitemap") {
      sitemaps.push(value);
    } else if (field === "user-agent") {
      if (!current || !lastWasAgent) {
        current = { agents: [], allow: [], disallow: [] };
        groups.push(current);
      }
      current.agents.push(value);
      lastWasAgent = true;
      continue;
    } else if (current && (field === "allow" || field === "disallow")) {
      if (value) current[field].push(value);
    }
    lastWasAgent = false;
  }
  return { groups, sitemaps };
}

/** The value of each attribute of an HTML tag, by lower-cased name. */
function attributes(tag) {
  /** @type {Record<string, string>} */
  const attrs = {};
  for (const m of tag.matchAll(/([a-zA-Z-:]+)\s*=\s*"([^"]*)"/g)) {
    attrs[m[1].toLowerCase()] = unescapeXml(m[2]);
  }
  return attrs;
}

/**
 * What is wrong with one listed URL's response, if anything.
 * @param {string} loc
 * @param {{ status: number, headers: Record<string, string> | Headers, body: string }} response
 * @returns {string[]}
 */
export function pageProblems(loc, { status, headers, body }) {
  const header = (name) =>
    headers instanceof Headers
      ? (headers.get(name) ?? "")
      : (headers[name] ?? "");
  if (status !== 200) return [`answered ${status}, not 200`];
  const problems = [];
  if (/noindex|none/i.test(header("x-robots-tag"))) {
    problems.push(`its X-Robots-Tag says ${header("x-robots-tag")}`);
  }
  if (!header("content-type").startsWith("text/html")) return problems;

  const head = body.split(/<\/head>/i)[0];
  const tags = [...head.matchAll(/<(meta|link)\b[^>]*>/gi)].map((m) =>
    attributes(m[0]),
  );
  for (const meta of tags) {
    const name = meta.name?.toLowerCase();
    if (
      (name === "robots" || name === "googlebot") &&
      /noindex|none/i.test(meta.content ?? "")
    ) {
      problems.push(`its robots meta says ${meta.content}`);
    }
  }
  const canonicals = tags
    .filter((t) => t.rel?.toLowerCase() === "canonical")
    .map((t) => t.href);
  if (canonicals.length === 0) {
    problems.push("it has no canonical");
  } else if (canonicals.length > 1) {
    problems.push(`it has ${canonicals.length} canonicals`);
  } else if (canonicals[0] !== loc) {
    problems.push(`its canonical is ${canonicals[0]}, not its loc`);
  }
  return problems;
}

/**
 * Check robots.txt, sitemap.xml and every listed URL on `origin`.
 * @param {string} origin e.g. http://localhost:3881
 * @param {{ siteUrl?: string, fetchImpl?: (url: string, init?: RequestInit) => Promise<Response> }} [options]
 * @returns {Promise<{ locs: string[], problems: string[] }>}
 */
export async function checkSite(origin, options = {}) {
  const siteUrl = options.siteUrl ?? SITE_URL;
  const fetchImpl = options.fetchImpl ?? fetch;
  const base = origin.replace(/\/+$/, "");
  /** @type {string[]} */
  const problems = [];
  const get = (pathname) =>
    fetchImpl(`${base}${pathname}`, { redirect: "manual" });

  // robots.txt
  const robotsRes = await get("/robots.txt");
  const robotsType = robotsRes.headers.get("content-type") ?? "";
  if (robotsRes.status !== 200) {
    problems.push(`robots.txt answered ${robotsRes.status}, not 200`);
  } else if (!robotsType.startsWith("text/plain")) {
    problems.push(`robots.txt is served as ${robotsType}, not text/plain`);
  }
  const robots = parseRobots(await robotsRes.text());
  if (!robots.sitemaps.includes(`${siteUrl}/sitemap.xml`)) {
    problems.push(`robots.txt names no Sitemap: ${siteUrl}/sitemap.xml`);
  }
  const everyone = robots.groups.filter((g) => g.agents.includes("*"));
  const disallowed = everyone.flatMap((g) => g.disallow);
  if (!disallowed.includes("/api/")) {
    problems.push("robots.txt does not disallow /api/");
  }

  // sitemap.xml
  const sitemapRes = await get("/sitemap.xml");
  const sitemapType = sitemapRes.headers.get("content-type") ?? "";
  const xml = await sitemapRes.text();
  if (sitemapRes.status !== 200) {
    problems.push(`sitemap.xml answered ${sitemapRes.status}, not 200`);
  } else if (sitemapType.split(";")[0].trim() !== "application/xml") {
    problems.push(
      `sitemap.xml is served as ${sitemapType}, not application/xml`,
    );
  }
  if (!xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')) {
    problems.push("sitemap.xml does not declare XML 1.0 in UTF-8 first");
  }
  if (new TextEncoder().encode(xml).length > MAX_BYTES) {
    problems.push("sitemap.xml is larger than 50 MB");
  }
  const listed = parseSitemapLocs(xml);
  if (listed.length > MAX_URLS) {
    problems.push(`sitemap.xml lists ${listed.length} URLs, over 50,000`);
  }
  const locs = [...new Set(listed)];
  for (const loc of locs) {
    if (listed.indexOf(loc) !== listed.lastIndexOf(loc)) {
      problems.push(`sitemap.xml lists ${loc} twice`);
    }
  }

  /** @type {string[]} */
  const fetchable = [];
  for (const loc of locs) {
    let url;
    try {
      url = new URL(loc);
    } catch {
      problems.push(`${loc}: not an absolute URL`);
      continue;
    }
    const before = problems.length;
    if (url.origin !== siteUrl) problems.push(`${loc}: not an ${siteUrl} URL`);
    if (url.search) problems.push(`${loc}: has a query string`);
    if (url.hash) problems.push(`${loc}: has a fragment`);
    if (problems.length === before) fetchable.push(loc);
  }

  for (const loc of fetchable) {
    const { pathname } = new URL(loc);
    const rule = disallowed.find((d) => pathname.startsWith(d));
    if (rule)
      problems.push(`${loc}: robots.txt disallows it (Disallow: ${rule})`);
    const res = await get(pathname);
    const body = await res.text();
    for (const problem of pageProblems(loc, {
      status: res.status,
      headers: res.headers,
      body,
    })) {
      problems.push(`${loc}: ${problem}`);
    }
  }
  return { locs, problems };
}

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
