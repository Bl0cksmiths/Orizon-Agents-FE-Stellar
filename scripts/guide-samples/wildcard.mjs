/**
 * Documented values that stand for "any value of this type", and the rules for
 * comparing a documented response or output with a real one.
 *
 * THE WILDCARD RULE. In a documented JSON response, a string value that is
 * wholly `<...>` is a wildcard: it matches any value of one JSON type, never a
 * value of another. Its type is decided, in order, by:
 *
 *   1. A type tag. `<number>`, `<integer: ledger>`, `<string: tx hash>`,
 *      `<boolean>`, `<null>`, `<object>`, `<array>`, `<any>` — the first word,
 *      optionally followed by `:` and a description. The tag must fit the API
 *      contract at that position, or the static check fails.
 *   2. The API contract. An untagged wildcard (`<unix seconds>`, `<nonce>`)
 *      takes whatever types the operation's response schema declares at that
 *      position: `<unix seconds>` in `expires_at`, declared `number`, matches
 *      any number and fails on the string "1712345678". A nullable field
 *      (`anyOf [T, null]`) accepts T or null.
 *   3. Nothing else. An untagged wildcard where the contract declares no type
 *      (a free-form object) is a string.
 *
 * In a documented `text` output, `<...>` on a line matches any non-empty run of
 * characters on that line.
 */

export const JSON_TYPES = [
  "string",
  "number",
  "integer",
  "boolean",
  "null",
  "object",
  "array",
];

const WILDCARD = /^<([^<>]+)>$/;
const TAG =
  /^(string|number|integer|boolean|null|object|array|any)(?:\s*:.*)?$/;

/**
 * @param {unknown} value
 * @returns {{ tag: string | null, text: string } | null}  null when not a wildcard
 */
export function readWildcard(value) {
  if (typeof value !== "string") return null;
  const match = WILDCARD.exec(value);
  if (match === null) return null;
  const text = match[1].trim();
  const tag = TAG.exec(text);
  return { tag: tag ? tag[1] : null, text };
}

/** @param {unknown} value */
export function jsonType(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (typeof value === "number")
    return Number.isInteger(value) ? "integer" : "number";
  if (typeof value === "object") return "object";
  return typeof value;
}

/**
 * Does `value` belong to one of `types`? `number` includes integers.
 *
 * @param {unknown} value
 * @param {Iterable<string>} types
 */
export function valueHasType(value, types) {
  const actual = jsonType(value);
  for (const t of types) {
    if (t === "any" || t === actual) return true;
    if (t === "number" && actual === "integer") return true;
  }
  return false;
}

/** `$`, `$.key`, `$["odd key"]`, `$[0]`. */
export function childPath(path, key) {
  if (typeof key === "number") return `${path}[${key}]`;
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(key)
    ? `${path}.${key}`
    : `${path}[${JSON.stringify(key)}]`;
}

/**
 * The types a documented wildcard accepts at `path`: the static check's
 * resolution if it ran, else the tag, else string.
 *
 * @param {{ tag: string | null }} wildcard
 * @param {string} path
 * @param {Map<string, Set<string>> | undefined} resolved
 */
function wildcardTypes(wildcard, path, resolved) {
  const fromContract = resolved?.get(path);
  if (fromContract !== undefined) return fromContract;
  return new Set([wildcard.tag ?? "string"]);
}

/**
 * @typedef {{ path: string, message: string }} Difference
 * @typedef {{ ok: boolean, missing: Difference[], mismatched: Difference[], extra: Difference[] }} Comparison
 */

/**
 * Compare a real JSON value with its documented form.
 *
 * Objects: every documented key must be present (missing fails) and match;
 * extra real keys are allowed and reported. Arrays: documented elements are
 * compared by position; a shorter real array fails; extra real elements are
 * reported. Scalars: equal in type and value. Wildcards: see the module note.
 *
 * @param {unknown} documented
 * @param {unknown} actual
 * @param {Map<string, Set<string>>} [resolved]  wildcard types from the contract
 * @returns {Comparison}
 */
export function compareJson(documented, actual, resolved) {
  /** @type {Comparison} */
  const result = { ok: true, missing: [], mismatched: [], extra: [] };
  walk(documented, actual, "$");
  result.ok = result.missing.length === 0 && result.mismatched.length === 0;
  return result;

  function walk(doc, real, path) {
    const wildcard = readWildcard(doc);
    if (wildcard !== null) {
      const types = wildcardTypes(wildcard, path, resolved);
      if (!valueHasType(real, types)) {
        result.mismatched.push({
          path,
          message: `documented <${wildcard.text}> (${[...types].join(" | ")}), got ${jsonType(real)} ${preview(real)}`,
        });
      }
      return;
    }
    const docType = jsonType(doc);
    const realType = jsonType(real);
    const sameKind =
      docType === realType ||
      (docType === "number" && realType === "integer") ||
      (docType === "integer" && realType === "number");
    if (!sameKind) {
      result.mismatched.push({
        path,
        message: `documented ${docType} ${preview(doc)}, got ${realType} ${preview(real)}`,
      });
      return;
    }
    if (docType === "object") {
      const docObj = /** @type {Record<string, unknown>} */ (doc);
      const realObj = /** @type {Record<string, unknown>} */ (real);
      for (const key of Object.keys(docObj)) {
        const at = childPath(path, key);
        if (!Object.hasOwn(realObj, key)) {
          result.missing.push({
            path: at,
            message: `documented key is missing from the response`,
          });
          continue;
        }
        walk(docObj[key], realObj[key], at);
      }
      for (const key of Object.keys(realObj)) {
        if (!Object.hasOwn(docObj, key)) {
          result.extra.push({
            path: childPath(path, key),
            message: `undocumented key (${jsonType(realObj[key])})`,
          });
        }
      }
      return;
    }
    if (docType === "array") {
      const docArr = /** @type {unknown[]} */ (doc);
      const realArr = /** @type {unknown[]} */ (real);
      docArr.forEach((item, index) => {
        const at = childPath(path, index);
        if (index >= realArr.length) {
          result.missing.push({
            path: at,
            message: `documented element is missing (got ${realArr.length})`,
          });
        } else {
          walk(item, realArr[index], at);
        }
      });
      if (realArr.length > docArr.length) {
        result.extra.push({
          path,
          message: `${realArr.length - docArr.length} undocumented element(s) after the ${docArr.length} documented`,
        });
      }
      return;
    }
    if (doc !== real) {
      result.mismatched.push({
        path,
        message: `documented ${preview(doc)}, got ${preview(real)}`,
      });
    }
  }
}

/** @param {unknown} value */
function preview(value) {
  const text = JSON.stringify(value);
  if (text === undefined) return String(value);
  return text.length > 80 ? `${text.slice(0, 77)}...` : text;
}

/** A unified-ish diff of a comparison, for the report. */
export function formatComparison(comparison) {
  return [
    ...comparison.missing.map((d) => `- ${d.path}: ${d.message}`),
    ...comparison.mismatched.map((d) => `! ${d.path}: ${d.message}`),
    ...comparison.extra.map((d) => `+ ${d.path}: ${d.message}`),
  ].join("\n");
}

/**
 * Compare a program's stdout with a documented `text` output. Trailing
 * whitespace and trailing blank lines are ignored; `<...>` matches any
 * non-empty text within its line.
 *
 * @param {string} documented
 * @param {string} actual
 * @returns {{ ok: boolean, diff: string }}
 */
export function compareText(documented, actual) {
  const norm = (text) => {
    const lines = text
      .replace(/\r\n/g, "\n")
      .split("\n")
      .map((l) => l.trimEnd());
    while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
    return lines;
  };
  const doc = norm(documented);
  const real = norm(actual);
  const diff = [];
  const count = Math.max(doc.length, real.length);
  for (let i = 0; i < count; i += 1) {
    const want = doc[i];
    const got = real[i];
    if (want === undefined) {
      diff.push(`+ line ${i + 1}: ${got}`);
      continue;
    }
    if (got === undefined) {
      diff.push(`- line ${i + 1}: ${want}`);
      continue;
    }
    if (!lineMatches(want, got))
      diff.push(`- line ${i + 1}: ${want}\n+ line ${i + 1}: ${got}`);
  }
  return { ok: diff.length === 0, diff: diff.join("\n") };
}

/** @param {string} pattern @param {string} line */
function lineMatches(pattern, line) {
  const parts = pattern.split(/<[^<>]+>/);
  if (parts.length === 1) return pattern === line;
  const source = parts
    .map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join(".+?");
  return new RegExp(`^${source}$`).test(line);
}
