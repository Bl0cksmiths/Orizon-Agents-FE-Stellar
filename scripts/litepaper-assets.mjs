#!/usr/bin/env node
/**
 * Publishes the litepaper's rendered files under the site's own origin.
 *
 * Copies the four rendered files (PDF, HTML, Word, Markdown) and the PNG
 * figures from litepaper/ into public/litepaper/, under clean names, so Next
 * serves them statically at /litepaper/orizon-agents-litepaper.pdf and so on,
 * with no login. public/litepaper/ is generated and gitignored: the files
 * live in git once, under litepaper/.
 *
 * Runs as `prebuild`, so `npm run build` (and Vercel's build) always ships
 * the copy that matches the page's sizes. It fails the build, listing every
 * problem, when the folder or any file is missing, or when the cover line or
 * the §6 heading the page links to is gone (lib/litepaper/source.mjs).
 *
 *   LITEPAPER_DIR  the source folder (default litepaper/); the tests and the
 *                  Playwright server point it at test/fixtures/litepaper/.
 *
 * The output is always public/litepaper/ under the working directory, and it
 * is cleared first, so a figure dropped from the book stops being served.
 */

import { copyFileSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ARTIFACTS,
  FIGURES_DIR,
  LitepaperSourceError,
  PUBLIC_LITEPAPER_DIR,
  checkSource,
  litepaperDir,
} from "../lib/litepaper/source.mjs";

/**
 * Check the source folder, then replace outDir with its published files.
 * Throws LitepaperSourceError, having written nothing, on any problem.
 *
 * @param {{ sourceDir: string, outDir: string, root?: string }} options
 * @returns {{ version: string, date: string, files: string[] }} the files
 *   written, relative to outDir
 */
export function copyLitepaperAssets({
  sourceDir,
  outDir,
  root = process.cwd(),
}) {
  const shown = path.relative(root, sourceDir) || sourceDir;
  const checked = checkSource(sourceDir);
  if (!checked.ok) throw new LitepaperSourceError(shown, checked.problems);

  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(path.join(outDir, FIGURES_DIR), { recursive: true });
  const files = [];
  for (const a of ARTIFACTS) {
    copyFileSync(path.join(sourceDir, a.source), path.join(outDir, a.file));
    files.push(a.file);
  }
  // Figures keep their names: the Markdown book links figures/figure-1.png.
  for (const f of checked.figures) {
    const rel = `${FIGURES_DIR}/${f}`;
    copyFileSync(path.join(sourceDir, rel), path.join(outDir, rel));
    files.push(rel);
  }
  return {
    version: checked.cover.version,
    date: checked.cover.date,
    files,
  };
}

/** @param {Record<string, string | undefined>} env @param {string} root */
export function main(env = process.env, root = process.cwd()) {
  const sourceDir = litepaperDir(env, root);
  const outDir = path.join(root, PUBLIC_LITEPAPER_DIR);
  try {
    const { version, date, files } = copyLitepaperAssets({
      sourceDir,
      outDir,
      root,
    });
    console.log(
      `litepaper v${version} (${date}): published ${files.length} files from ` +
        `${path.relative(root, sourceDir) || sourceDir} to ${PUBLIC_LITEPAPER_DIR}/`,
    );
    return 0;
  } catch (error) {
    if (!(error instanceof LitepaperSourceError)) throw error;
    console.error(error.message);
    return 1;
  }
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  process.exitCode = main();
}
