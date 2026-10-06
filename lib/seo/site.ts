/**
 * Loads content/site.json, the dates of pages whose words live in code.
 *
 * The guides, the demo, the evidence index and the litepaper each carry their
 * own date, so the sitemap reads theirs. The home page has none: its copy is
 * written in its components, and its only moving part, the hero's network
 * figures, refreshes every few minutes without the page changing in any way a
 * search engine should recrawl for. So the day of its last real change (new
 * copy, a new section, new figures) is kept here, by hand, like a guide's
 * `updated`. Bump it in the same commit that changes what the home page says;
 * leave it alone for styling, layout and performance work.
 *
 * Read at build time only. A missing or malformed file fails `next build`.
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export const DEFAULT_SITE_FILE = "content/site.json";

export type SiteDates = {
  home: {
    /** The day the home page last changed what it says, YYYY-MM-DD. */
    updated: string;
  };
};

/** A site.json problem that must stop the build. The message is for authors. */
export class SiteContentError extends Error {
  constructor(file: string, problem: string) {
    super(`${file}: the sitemap cannot be published.\n  - ${problem}`);
    this.name = "SiteContentError";
  }
}

const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** True for a YYYY-MM-DD day that exists on the calendar. */
export function isIsoDay(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const m = ISO_DAY.exec(value);
  if (!m) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return (
    d.getUTCFullYear() === Number(m[1]) &&
    d.getUTCMonth() + 1 === Number(m[2]) &&
    d.getUTCDate() === Number(m[3])
  );
}

/** Read and check content/site.json. Throws SiteContentError on any problem. */
export function loadSite(
  file: string = path.resolve(process.cwd(), DEFAULT_SITE_FILE),
): SiteDates {
  const shown = path.relative(process.cwd(), file) || file;
  if (!existsSync(file)) {
    throw new SiteContentError(shown, "the file is missing");
  }
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    throw new SiteContentError(
      shown,
      `it is not valid JSON: ${(error as Error).message}`,
    );
  }
  const updated = (raw as { home?: { updated?: unknown } } | null)?.home
    ?.updated;
  if (!isIsoDay(updated)) {
    throw new SiteContentError(
      shown,
      `home.updated must be a YYYY-MM-DD day, got ${JSON.stringify(updated)}`,
    );
  }
  return { home: { updated } };
}
