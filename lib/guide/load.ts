/**
 * Loads guides from the file system. Build-time only: the guide routes are
 * statically generated, so nothing here runs on a request.
 *
 * Guides live in `content/guides/<slug>.md`. GUIDE_CONTENT_DIR points the
 * loader somewhere else; the Playwright suite uses it to serve the fixture
 * guide under test/fixtures/ while the real guide is not on the branch.
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { KEBAB_ID } from "./fence";
import { GuideContentError } from "./frontmatter";
import { parseGuide, type ParsedGuide } from "./parse";

export const DEFAULT_GUIDE_DIR = "content/guides";

export type LoadedGuide = ParsedGuide & { slug: string };

/** The directory guides are read from, absolute. */
export function guideDir(
  env: { GUIDE_CONTENT_DIR?: string } = process.env,
): string {
  return path.resolve(
    process.cwd(),
    env.GUIDE_CONTENT_DIR?.trim() || DEFAULT_GUIDE_DIR,
  );
}

/** Every guide's slug, sorted. A directory that does not exist has none. */
export function listGuideSlugs(dir: string = guideDir()): string[] {
  if (!existsSync(dir)) return [];
  const slugs: string[] = [];
  for (const name of readdirSync(dir).sort()) {
    if (!name.endsWith(".md")) continue;
    const slug = name.slice(0, -".md".length);
    if (!KEBAB_ID.test(slug)) {
      throw new GuideContentError(
        path.relative(process.cwd(), path.join(dir, name)),
        [
          "the file name is the page's URL, so it must be kebab-case, like list-your-agent.md",
        ],
      );
    }
    slugs.push(slug);
  }
  return slugs;
}

const cache = new Map<string, { mtimeMs: number; guide: LoadedGuide }>();

/**
 * Parse one guide, or null when there is no such file. Parsed once per file
 * version: the page, its metadata and the sitemap all ask for it.
 */
export function loadGuide(
  slug: string,
  dir: string = guideDir(),
): LoadedGuide | null {
  if (!KEBAB_ID.test(slug)) return null;
  const file = path.join(dir, `${slug}.md`);
  if (!existsSync(file)) return null;
  const { mtimeMs } = statSync(file);
  const hit = cache.get(file);
  if (hit && hit.mtimeMs === mtimeMs) return hit.guide;

  const shown = path.relative(process.cwd(), file) || file;
  const parsed = parseGuide(readFileSync(file, "utf8"), shown);
  for (const warning of parsed.warnings) {
    console.warn(`${shown}: ${warning}`);
  }
  const guide = { ...parsed, slug };
  cache.set(file, { mtimeMs, guide });
  return guide;
}

/** Every guide, parsed, in slug order. */
export function loadAllGuides(dir: string = guideDir()): LoadedGuide[] {
  return listGuideSlugs(dir).map((slug) => loadGuide(slug, dir)!);
}
