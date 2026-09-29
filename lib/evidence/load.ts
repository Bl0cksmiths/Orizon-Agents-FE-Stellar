/**
 * Loads the evidence index, content/evidence/index.json, at build time.
 *
 * /evidence is statically generated, so this runs during `next build` and
 * never on a request. An index that breaks a rule in lib/evidence/validate.mjs
 * throws an EvidenceContentError listing every problem, which fails the
 * build: the page is never published half-right.
 *
 * EVIDENCE_CONTENT_DIR points the loader at another directory holding an
 * index.json, the way GUIDE_CONTENT_DIR does for the guide. The unit and
 * Playwright suites use it to serve the fixture in test/fixtures/evidence/,
 * so no test changes when the real index is filled in.
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { EvidenceIndex } from "./types";
import { validateEvidenceIndex } from "./validate.mjs";

export const DEFAULT_EVIDENCE_DIR = "content/evidence";
export const INDEX_NAME = "index.json";

/** An index problem that must stop the build. The message is for authors. */
export class EvidenceContentError extends Error {
  constructor(
    file: string,
    /** Each problem on its own, so several checks can report together. */
    readonly problems: string[],
  ) {
    super(
      `${file}: the evidence page cannot be published.\n` +
        problems.map((p) => `  - ${p}`).join("\n"),
    );
    this.name = "EvidenceContentError";
  }
}

export type EvidencePaths = { root: string; file: string };

/** Where the index is read from, absolute. */
export function evidencePaths(
  env: Record<string, string | undefined> = process.env,
): EvidencePaths {
  const root = process.cwd();
  const dir = path.resolve(
    root,
    env.EVIDENCE_CONTENT_DIR?.trim() || DEFAULT_EVIDENCE_DIR,
  );
  return { root, file: path.join(dir, INDEX_NAME) };
}

/** Read and check the index. Throws EvidenceContentError on any problem. */
export function loadEvidence(
  paths: EvidencePaths = evidencePaths(),
): EvidenceIndex {
  const shown = path.relative(paths.root, paths.file) || paths.file;
  if (!existsSync(paths.file)) {
    throw new EvidenceContentError(shown, ["the index is missing"]);
  }
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(paths.file, "utf8"));
  } catch (error) {
    throw new EvidenceContentError(shown, [
      `it is not valid JSON: ${(error as Error).message}`,
    ]);
  }
  const { ok, problems } = validateEvidenceIndex(raw);
  if (!ok) throw new EvidenceContentError(shown, problems);
  return raw as EvidenceIndex;
}
