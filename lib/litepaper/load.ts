/**
 * Loads what the /litepaper page shows, from litepaper/, at build time.
 *
 * /litepaper is statically generated, so this runs during `next build` and
 * never on a request. It reads the cover's title, version and date, each
 * rendered file's size, and the §6 anchor in the HTML book, all from the
 * source folder the copy step publishes (scripts/litepaper-assets.mjs), so
 * the sizes on the page are the sizes served. Any problem throws a
 * LitepaperSourceError listing them all, which fails the build.
 *
 * LITEPAPER_DIR points it at another folder, as for the copy step.
 */

import { statSync } from "node:fs";
import path from "node:path";
import { CHANGES_VERSION, LITEPAPER_CHANGES } from "./changes";
import type { LitepaperChange } from "./changes";
import { formatBytes } from "./display";
import {
  ARTIFACTS,
  LitepaperSourceError,
  checkSource,
  litepaperDir,
  publishedHref,
  type Artifact,
} from "./source.mjs";

export type LitepaperDownload = Artifact & {
  /** Where it is served, e.g. /litepaper/orizon-agents-litepaper.pdf. */
  href: string;
  bytes: number;
  /** "2.0 MB" */
  size: string;
};

export type Litepaper = {
  title: string;
  version: string;
  /** The cover's date, ISO. */
  date: string;
  downloads: LitepaperDownload[];
  /** §6 in the HTML book: its link and its heading's words. */
  chapter6: { href: string; title: string };
  changes: readonly LitepaperChange[];
};

/** Read and check the folder. Throws LitepaperSourceError on any problem. */
export function loadLitepaper(
  env: Record<string, string | undefined> = process.env,
): Litepaper {
  const root = process.cwd();
  const dir = litepaperDir(env, root);
  const shown = path.relative(root, dir) || dir;
  const checked = checkSource(dir);
  if (!checked.ok) throw new LitepaperSourceError(shown, checked.problems);

  const { cover, chapter6 } = checked;
  if (cover.version !== CHANGES_VERSION) {
    throw new LitepaperSourceError(shown, [
      `the cover says version ${cover.version}, but lib/litepaper/changes.ts lists the changes in ${CHANGES_VERSION}; update the list for ${cover.version}`,
    ]);
  }

  const downloads = ARTIFACTS.map((a) => {
    const bytes = statSync(path.join(dir, a.source)).size;
    return {
      ...a,
      href: publishedHref(a.file),
      bytes,
      size: formatBytes(bytes),
    };
  });
  const html = downloads.find((d) => d.format === "html")!;
  return {
    title: cover.title,
    version: cover.version,
    date: cover.date,
    downloads,
    chapter6: { href: `${html.href}#${chapter6.id}`, title: chapter6.title },
    changes: LITEPAPER_CHANGES,
  };
}
