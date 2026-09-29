/**
 * Loads the structural validator, `validateEvidenceIndex(obj) => { ok,
 * problems[] }`, from lib/evidence/validate.mjs — the module `next build` and
 * the evidence page use — so this checker never keeps a second copy of the
 * rules.
 *
 * If the file is missing, or fails to import, or lacks the export, this
 * throws: the checker keeps no rules of its own, so it never validates the
 * index against anything but the page's rules.
 */
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

export const REAL_VALIDATOR = fileURLToPath(
  new URL("../../lib/evidence/validate.mjs", import.meta.url),
);

/**
 * @typedef {(obj: unknown) => { ok: boolean, problems: string[] }} Validate
 * @typedef {{ validateEvidenceIndex: Validate, source: "lib", path: string }} LoadedValidator
 */

/**
 * @param {{ realPath?: string }} [options]
 * @returns {Promise<LoadedValidator>}
 */
export async function loadValidator({ realPath = REAL_VALIDATOR } = {}) {
  if (existsSync(realPath)) {
    const mod = await import(pathToFileURL(realPath).href);
    if (typeof mod.validateEvidenceIndex !== "function") {
      throw new Error(`${realPath} does not export validateEvidenceIndex`);
    }
    return {
      validateEvidenceIndex: mod.validateEvidenceIndex,
      source: "lib",
      path: realPath,
    };
  }
  throw new Error(
    `${realPath} is missing: the checker keeps no rules of its own, so it cannot validate the index`,
  );
}
