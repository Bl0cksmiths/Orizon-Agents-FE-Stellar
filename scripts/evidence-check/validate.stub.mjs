/**
 * STAND-IN for lib/evidence/validate.mjs, which another lane owns.
 *
 * It exports the same function with the same contract,
 * `validateEvidenceIndex(obj) => { ok, problems[] }`, so this package and its
 * tests can be written before that module lands. validator.mjs loads the real
 * module whenever it exists and falls back to this file only when it does not,
 * saying so in the report. Delete this file (and the fallback in validator.mjs)
 * once lib/evidence/validate.mjs is on the branch.
 *
 * The rules here are the frozen contract's bare shape and nothing more. The
 * real validator is the authority; do not grow this one.
 */

const LINK_KINDS = new Set([
  "tx",
  "contract",
  "account",
  "page",
  "pr",
  "repo",
  "video",
  "doc",
]);
const ITEM_STATUSES = new Set(["present", "partial", "missing"]);
const METRIC_STATUSES = new Set(["met", "not_met"]);
const TX_HASH = /^[0-9a-f]{64}$/;

/** @param {unknown} v */
const isObject = (v) =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * @param {unknown} link
 * @param {string} where
 * @param {string[]} problems
 */
function checkLink(link, where, problems) {
  if (!isObject(link)) {
    problems.push(`${where}: a link must be an object`);
    return;
  }
  if (typeof link.label !== "string" || link.label.trim() === "")
    problems.push(`${where}.label: required`);
  if (typeof link.url !== "string" || !/^https?:\/\//.test(link.url))
    problems.push(`${where}.url: must be an http(s) URL`);
  if (!LINK_KINDS.has(/** @type {string} */ (link.kind)))
    problems.push(`${where}.kind: unknown kind ${JSON.stringify(link.kind)}`);
  if (link.kind === "tx" && !TX_HASH.test(String(link.tx_hash)))
    problems.push(`${where}.tx_hash: a tx link needs 64 lowercase hex`);
}

/**
 * @param {unknown} obj
 * @returns {{ ok: boolean, problems: string[] }}
 */
export function validateEvidenceIndex(obj) {
  /** @type {string[]} */
  const problems = [];
  if (!isObject(obj))
    return { ok: false, problems: ["the index is not an object"] };
  if (obj.schema !== "orizon.evidence-index/1")
    problems.push(`schema: expected "orizon.evidence-index/1"`);
  if (!Array.isArray(obj.deliverables))
    problems.push("deliverables: required array");
  else
    obj.deliverables.forEach((d, i) => {
      if (!isObject(d) || !Array.isArray(d.items)) {
        problems.push(`deliverables[${i}].items: required array`);
        return;
      }
      d.items.forEach((item, j) => {
        const where = `deliverables[${i}].items[${j}]`;
        if (!isObject(item))
          return problems.push(`${where}: must be an object`);
        if (!ITEM_STATUSES.has(/** @type {string} */ (item.status)))
          problems.push(`${where}.status: present, partial or missing`);
        if (!Array.isArray(item.links))
          problems.push(`${where}.links: required array`);
        else
          item.links.forEach((l, k) =>
            checkLink(l, `${where}.links[${k}]`, problems),
          );
      });
    });
  if (!Array.isArray(obj.metrics)) problems.push("metrics: required array");
  else
    obj.metrics.forEach((m, i) => {
      const where = `metrics[${i}]`;
      if (!isObject(m)) return problems.push(`${where}: must be an object`);
      if (!METRIC_STATUSES.has(/** @type {string} */ (m.status)))
        problems.push(`${where}.status: met or not_met`);
      if (typeof m.reason !== "string" || m.reason.trim() === "")
        problems.push(`${where}.reason: required`);
      if (!Array.isArray(m.links))
        problems.push(`${where}.links: required array`);
      else
        m.links.forEach((l, k) =>
          checkLink(l, `${where}.links[${k}]`, problems),
        );
    });
  return { ok: problems.length === 0, problems };
}
