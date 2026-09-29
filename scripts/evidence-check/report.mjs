/**
 * The evidence-check report: Markdown for people (and the 6.04 record), JSON
 * for tools. One row per link: where it sits in the index, its label, its
 * URL, the result and why.
 */

/** @param {import("./run.mjs").Report} report */
export function toJson(report) {
  return `${JSON.stringify(report, null, 2)}\n`;
}

export const MARK = Object.freeze({
  pass: "pass",
  fail: "FAIL",
  unverified: "UNVERIFIED",
  not_checked: "not checked",
});

/** @param {string} text */
const cell = (text) => text.replace(/\|/g, "\\|").replace(/\s*\n\s*/g, " ");

/** @param {import("./run.mjs").Report} report */
export function toMarkdown(report) {
  const s = report.summary;
  const validator =
    report.validator.source === null
      ? "not run"
      : `${report.validator.ok ? "ok" : `${report.validator.problems.length} problem(s)`} (${
          report.validator.source === "lib"
            ? "lib/evidence/validate.mjs"
            : "LOCAL STUB: lib/evidence/validate.mjs is not on this branch"
        })`;
  const lines = [
    "# Evidence link check",
    "",
    `- Index: \`${report.index}\``,
    `- Mode: ${report.mode} · network: ${report.network} · ${report.generated_at}`,
    `- Structural validator: ${validator}`,
    `- Links: **${s.links}** · passed **${s.passed}** · failed **${s.failed}** · unverified **${s.unverified}** · not checked **${s.not_checked}** · redirected ${s.redirected}`,
    "",
  ];
  if (report.refused) lines.push(`**Run refused:** ${report.refused}`, "");
  if (report.errors.length > 0) {
    lines.push("## Errors", "", ...report.errors.map((e) => `- ${e}`), "");
  }
  if (report.validator.problems.length > 0) {
    lines.push(
      "## Validator problems",
      "",
      ...report.validator.problems.map((p) => `- ${p}`),
      "",
    );
  }
  if (report.rows.length > 0) {
    lines.push(
      "## Links",
      "",
      "| # | where | label | URL | result | detail |",
      "|---|---|---|---|---|---|",
    );
    report.rows.forEach((row, i) => {
      const url =
        row.redirected && row.final_url
          ? `${row.url} → ${row.final_url}`
          : row.url;
      lines.push(
        `| ${i + 1} | \`${row.where}\` (${cell(row.context)}) | ${cell(row.label)} | ${cell(url)} | ${MARK[row.result]}${row.redirected ? " (redirected)" : ""} | ${cell(row.detail)} |`,
      );
    });
    lines.push("");
  }
  const onChain = report.rows.filter((row) => row.chain);
  if (onChain.length > 0) {
    lines.push(
      "## Transactions on testnet",
      "",
      "| where | hash | ledger | created_at | source account | successful |",
      "|---|---|---|---|---|---|",
    );
    for (const row of onChain) {
      const c = /** @type {import("./checks.mjs").ChainTx} */ (row.chain);
      lines.push(
        `| \`${row.where}\` | \`${c.hash}\` | ${c.ledger ?? "?"} | ${c.created_at ?? "?"} | \`${c.source_account ?? "?"}\` | ${c.successful} |`,
      );
    }
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}
