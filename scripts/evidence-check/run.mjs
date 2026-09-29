/**
 * Runs a check of an evidence index and returns the report; cli.mjs prints
 * and writes it.
 *
 *   static  the structural validator (lib/evidence/validate.mjs) over the
 *           index, plus the testnet-only rule on every URL. No network. Every
 *           link row is "not_checked"; a tx link's `date` is listed as not yet
 *           verified, because only the chain can confirm it (--live does).
 *   live    the same, then every link checked by checks.mjs, one at a time.
 *
 * Exit codes (exitCodeOf): 0 every check passed · 1 anything failed (a
 * validator problem, an unreadable index, a failed link) · 2 the run was
 * refused because an endpoint is not testnet · 3 nothing failed but at least
 * one link could not be checked (unverified), which is never a pass.
 */
import { existsSync, readFileSync } from "node:fs";
import {
  checkLink,
  networkRefusal,
  preflight,
  RefusedError,
  rowBase,
  summarize,
  TESTNET_ENDPOINTS,
} from "./checks.mjs";
import { createClient } from "./http.mjs";
import { collectLinks } from "./links.mjs";
import { loadValidator } from "./validator.mjs";

export const REPORT_SCHEMA = "orizon.evidence-check-report/1";

/**
 * @typedef {import("./checks.mjs").Row} Row
 * @typedef {{
 *   schema: string, mode: "static" | "live", index: string, network: "testnet",
 *   generated_at: string, endpoints: import("./checks.mjs").Endpoints | null,
 *   validator: { source: "lib" | null, ok: boolean, problems: string[] },
 *   errors: string[], refused: string | null, rows: Row[],
 *   summary: { links: number, passed: number, failed: number, unverified: number, not_checked: number, redirected: number },
 * }} Report
 * @typedef {{
 *   indexPath: string, mode: "static" | "live",
 *   loadValidator?: typeof loadValidator,
 *   client?: import("./checks.mjs").Client,
 *   clientOptions?: import("./http.mjs").ClientOptions,
 *   endpoints?: Partial<import("./checks.mjs").Endpoints>,
 *   now?: () => Date,
 * }} RunOptions
 */

/** @param {Row[]} rows */
function summaryOf(rows) {
  const count = (/** @type {string} */ r) =>
    rows.filter((row) => row.result === r).length;
  return {
    links: rows.length,
    passed: count("pass"),
    failed: count("fail"),
    unverified: count("unverified"),
    not_checked: count("not_checked"),
    redirected: rows.filter((row) => row.redirected).length,
  };
}

/** @param {import("./links.mjs").LocatedLink} located @returns {Row} */
function staticRow(located) {
  const base = rowBase(located);
  const refused = networkRefusal(base.url);
  if (refused) return { ...base, checks: [refused], ...summarize([refused]) };
  const date = located.link.date;
  return {
    ...base,
    checks: [],
    result: "not_checked",
    detail:
      base.kind === "tx" && typeof date === "string" && date
        ? `tx date ${date} not verified yet (only --live can match it against the chain)`
        : "not fetched (static)",
  };
}

/**
 * @param {RunOptions} options
 * @returns {Promise<Report>}
 */
export async function checkEvidence(options) {
  const { indexPath, mode } = options;
  const endpoints = { ...TESTNET_ENDPOINTS, ...(options.endpoints ?? {}) };
  const now = options.now ?? (() => new Date());
  /** @type {Report} */
  const report = {
    schema: REPORT_SCHEMA,
    mode,
    index: indexPath,
    network: "testnet",
    generated_at: now().toISOString(),
    endpoints: mode === "live" ? endpoints : null,
    validator: { source: null, ok: false, problems: [] },
    errors: [],
    refused: null,
    rows: [],
    summary: summaryOf([]),
  };

  if (!existsSync(indexPath)) {
    report.errors.push(`the evidence index ${indexPath} is missing`);
    return report;
  }
  let index;
  try {
    index = JSON.parse(readFileSync(indexPath, "utf8"));
  } catch (err) {
    report.errors.push(
      `the evidence index is not valid JSON: ${err instanceof Error ? err.message : err}`,
    );
    return report;
  }

  const validator = await (options.loadValidator ?? loadValidator)();
  const verdict = validator.validateEvidenceIndex(index);
  report.validator = {
    source: validator.source,
    ok: verdict.ok === true && verdict.problems.length === 0,
    problems: [...verdict.problems],
  };

  const links = collectLinks(index);
  if (mode === "static") {
    report.rows = links.map(staticRow);
    report.summary = summaryOf(report.rows);
    return report;
  }

  const client = options.client ?? createClient(options.clientOptions);
  let reachable;
  try {
    reachable = await preflight(client, endpoints);
  } catch (err) {
    if (!(err instanceof RefusedError)) throw err;
    report.refused = err.message;
    report.rows = links.map(staticRow);
    report.summary = summaryOf(report.rows);
    return report;
  }
  for (const located of links) {
    report.rows.push(await checkLink(client, located, endpoints, reachable));
  }
  report.summary = summaryOf(report.rows);
  return report;
}

/** @param {Report} report */
export function exitCodeOf(report) {
  if (report.refused) return 2;
  if (
    report.errors.length > 0 ||
    !report.validator.ok ||
    report.summary.failed > 0
  )
    return 1;
  if (report.summary.unverified > 0) return 3;
  return 0;
}
