/**
 * The litepaper's source folder, litepaper/, and what the site reads from it.
 *
 * The litepaper is written and rendered in its own folder (imported from its
 * own repository): Markdown sections, figures, and four rendered files, the
 * PDF, the self-contained HTML, the Word file and the bound Markdown book.
 * The site publishes those four files and the figures unchanged, and builds
 * /litepaper from them.
 *
 * This lives in `.mjs` (not `.ts`) so the plain Node copy step,
 * scripts/litepaper-assets.mjs, runs the very same checks that `next build`
 * runs through lib/litepaper/load.ts. Both fail the build on any problem:
 * a missing folder, a missing or empty file, a cover without its
 * `**Version** X · **Date** Y` line, or an HTML book with no §6 heading.
 *
 * LITEPAPER_DIR points both at another folder with the same layout. The unit
 * and Playwright suites use test/fixtures/litepaper/, a tiny fake book.
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { LITEPAPER_PATH } from "./paths.mjs";

export { LITEPAPER_PATH };

export const DEFAULT_LITEPAPER_DIR = "litepaper";
/** Where the copy step publishes the files: served at /litepaper/…. */
export const PUBLIC_LITEPAPER_DIR = "public/litepaper";
export const FRONT_MATTER = "sections/00-front-matter.md";
export const FIGURES_DIR = "figures";

/**
 * The four rendered files: their name in litepaper/, their clean published
 * name, and what the page calls them. A download link reads its name, then
 * its type and size: "PDF document (PDF, 2.0 MB)".
 *
 * @typedef {"pdf" | "html" | "docx" | "md"} ArtifactFormat
 * @typedef {{
 *   format: ArtifactFormat,
 *   source: string,
 *   file: string,
 *   name: string,
 *   type: string,
 *   contentType: string,
 * }} Artifact
 * @type {readonly Artifact[]}
 */
export const ARTIFACTS = [
  {
    format: "pdf",
    source: "Orizon-Agents-Litepaper.pdf",
    file: "orizon-agents-litepaper.pdf",
    name: "PDF document",
    type: "PDF",
    contentType: "application/pdf",
  },
  {
    format: "html",
    source: "Orizon-Agents-Litepaper.html",
    file: "orizon-agents-litepaper.html",
    name: "Web page",
    type: "HTML",
    contentType: "text/html",
  },
  {
    format: "docx",
    source: "Orizon-Agents-Litepaper.docx",
    file: "orizon-agents-litepaper.docx",
    name: "Word document",
    type: "DOCX",
    contentType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  },
  {
    format: "md",
    source: "Orizon-Agents-Litepaper.md",
    file: "orizon-agents-litepaper.md",
    name: "Markdown text",
    type: "MD",
    contentType: "text/markdown",
  },
];

/** The URL a published file is served at, e.g. /litepaper/orizon-agents-litepaper.pdf. */
export function publishedHref(file) {
  return `${LITEPAPER_PATH}/${file}`;
}

/** A litepaper problem that must stop the build. The message is for authors. */
export class LitepaperSourceError extends Error {
  /**
   * @param {string} dir the folder, as shown to the author
   * @param {string[]} problems each problem on its own
   */
  constructor(dir, problems) {
    super(
      `${dir}: the litepaper cannot be published.\n` +
        problems.map((p) => `  - ${p}`).join("\n"),
    );
    this.name = "LitepaperSourceError";
    this.problems = problems;
  }
}

/**
 * The source folder, absolute: LITEPAPER_DIR, or litepaper/.
 *
 * @param {Record<string, string | undefined>} [env]
 * @param {string} [root]
 */
export function litepaperDir(env = process.env, root = process.cwd()) {
  return path.resolve(root, env.LITEPAPER_DIR?.trim() || DEFAULT_LITEPAPER_DIR);
}

const COVER_LINE =
  /^\*\*Version\*\*[ \t]+(\S+)[ \t]+·[ \t]+\*\*Date\*\*[ \t]+(\S+)[ \t]*$/m;
const VERSION = /^\d+(?:\.\d+)+$/;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** @param {string} iso */
function isRealDate(iso) {
  const m = ISO_DATE.exec(iso);
  if (!m) return false;
  const d = new Date(`${iso}T00:00:00Z`);
  return (
    !Number.isNaN(d.getTime()) &&
    d.getUTCFullYear() === Number(m[1]) &&
    d.getUTCMonth() + 1 === Number(m[2]) &&
    d.getUTCDate() === Number(m[3])
  );
}

/**
 * The title, version and date on the litepaper's cover, from the front
 * matter: its first `# ` heading and its `**Version** 0.5 · **Date**
 * 2026-09-29` line.
 *
 * @param {string} markdown sections/00-front-matter.md
 * @returns {{ ok: true, cover: { title: string, version: string, date: string } } | { ok: false, problems: string[] }}
 */
export function parseCover(markdown) {
  /** @type {string[]} */
  const problems = [];
  const title = /^#[ \t]+(.+?)[ \t]*$/m.exec(markdown)?.[1];
  if (!title) {
    problems.push(`${FRONT_MATTER} has no "# " title heading`);
  }
  const line = COVER_LINE.exec(markdown);
  if (!line) {
    problems.push(
      `${FRONT_MATTER} has no cover line like "**Version** 0.5 · **Date** 2026-09-29"`,
    );
  } else {
    if (!VERSION.test(line[1])) {
      problems.push(
        `the cover's version must be numbers and dots, like 0.5, not "${line[1]}"`,
      );
    }
    if (!isRealDate(line[2])) {
      problems.push(
        `the cover's date must be a calendar date like 2026-09-29, not "${line[2]}"`,
      );
    }
  }
  if (problems.length || !title || !line) return { ok: false, problems };
  return { ok: true, cover: { title, version: line[1], date: line[2] } };
}

/** Pandoc's heading text, as plain words. */
function headingText(inner) {
  return inner
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The anchor pandoc gave a chapter's heading in the HTML book, and the
 * heading's words: for §6, `{ id: "operations-and-governance", title:
 * "§6 · Operations and Governance" }`. Null when no heading starts "§n".
 *
 * @param {string} html the rendered HTML book
 * @param {number} chapter
 * @returns {{ id: string, title: string } | null}
 */
export function findChapterAnchor(html, chapter) {
  const heading = /<h([1-6])\b([^>]*)>([\s\S]*?)<\/h\1>/g;
  for (const m of html.matchAll(heading)) {
    const title = headingText(m[3]);
    if (!new RegExp(`^§${chapter}(?!\\d)`).test(title)) continue;
    const id = /\bid="([^"]+)"/.exec(m[2])?.[1];
    if (id) return { id, title };
  }
  return null;
}

/** @param {string} file */
function nonEmptyFile(file) {
  try {
    const s = statSync(file);
    return s.isFile() && s.size > 0;
  } catch {
    return false;
  }
}

/** The figures' PNG files, sorted; empty when there is no figures folder. */
export function figureFiles(dir) {
  const figures = path.join(dir, FIGURES_DIR);
  if (!existsSync(figures)) return [];
  return readdirSync(figures)
    .filter((f) => f.toLowerCase().endsWith(".png"))
    .sort();
}

/**
 * Everything the site needs from the folder, checked. Every problem is
 * collected, never just the first.
 *
 * @param {string} dir the source folder, absolute
 * @returns {{ ok: true, cover: { title: string, version: string, date: string }, chapter6: { id: string, title: string }, figures: string[] } | { ok: false, problems: string[] }}
 */
export function checkSource(dir) {
  if (!existsSync(dir) || !statSync(dir).isDirectory()) {
    return {
      ok: false,
      problems: [
        "the folder is missing; import the litepaper there, or point LITEPAPER_DIR at it",
      ],
    };
  }
  /** @type {string[]} */
  const problems = [];
  for (const a of ARTIFACTS) {
    if (!nonEmptyFile(path.join(dir, a.source))) {
      problems.push(`the ${a.type} file ${a.source} is missing or empty`);
    }
  }
  const figures = figureFiles(dir);
  if (!figures.length) {
    problems.push(`${FIGURES_DIR}/ has no PNG figures`);
  }

  let cover = null;
  const front = path.join(dir, FRONT_MATTER);
  if (!nonEmptyFile(front)) {
    problems.push(`${FRONT_MATTER} is missing or empty`);
  } else {
    const parsed = parseCover(readFileSync(front, "utf8"));
    if (parsed.ok) cover = parsed.cover;
    else problems.push(...parsed.problems);
  }

  let chapter6 = null;
  const html = path.join(
    dir,
    ARTIFACTS.find((a) => a.format === "html").source,
  );
  if (nonEmptyFile(html)) {
    chapter6 = findChapterAnchor(readFileSync(html, "utf8"), 6);
    if (!chapter6) {
      problems.push(
        `the HTML book has no heading starting "§6" with an id to link to`,
      );
    }
  }

  if (problems.length || !cover || !chapter6) return { ok: false, problems };
  return { ok: true, cover, chapter6, figures };
}
