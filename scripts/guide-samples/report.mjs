/**
 * The per-sample report, as Markdown for people and JSON for tools.
 */
import { FIXTURE_DOCS } from "./fixtures.mjs";

/** @param {import("./run.mjs").GuideReport} report */
export function toJson(report) {
  return `${JSON.stringify(report, null, 2)}\n`;
}

const MARK = {
  verified: "verified",
  failed: "FAILED",
  skipped: "skipped (not verified)",
};

/** @param {string} text */
const cell = (text) => text.replace(/\|/g, "\\|").replace(/\n/g, " ");

/** @param {import("./run.mjs").GuideReport} report */
export function toMarkdown(report) {
  const { counts } = report;
  const modes = [
    "static",
    report.modes.live ? "live" : null,
    report.modes.offline ? "offline" : null,
  ]
    .filter(Boolean)
    .join(" + ");
  const lines = [
    `# Guide sample report`,
    "",
    `- Guide: \`${report.guide}\`${report.frontmatter.version ? ` v${report.frontmatter.version}` : ""}`,
    `- API verified against: \`${report.frontmatter.api_verified_against ?? "?"}\`; snapshot of backend \`${report.backendSha ?? "?"}\``,
    `- Run: ${modes}${report.api ? ` against ${report.api}${report.network ? ` (${report.network})` : ""}` : ""}`,
    `- Result: **${counts.verified} verified, ${counts.failed} failed, ${counts.skipped} skipped** (a skip is not verified)`,
    "",
  ];
  if (report.guideErrors.length > 0) {
    lines.push(
      "## Guide errors",
      "",
      ...report.guideErrors.map((e) => `- ${e}`),
      "",
    );
  }
  if (report.samples.length > 0) {
    lines.push(
      "## Samples",
      "",
      "| id | mode | status | operation | reason |",
      "|---|---|---|---|---|",
    );
    for (const s of report.samples) {
      lines.push(
        `| \`${s.id}\` | ${s.mode ?? "?"} | ${MARK[s.status]} | ${s.operation ? `\`${s.operation}\`` : ""} | ${cell(s.reason)} |`,
      );
    }
    lines.push("");
  }
  const detailed = report.samples.filter(
    (s) => s.status === "failed" || s.extra?.length,
  );
  for (const s of detailed) {
    lines.push(`### \`${s.id}\` (line ${s.line}) — ${MARK[s.status]}`, "");
    for (const c of s.checks) {
      lines.push(
        `- **${c.name}**: ${c.status}${c.detail ? ` — ${c.detail.split("\n").join("\n  - ")}` : ""}`,
      );
    }
    if (s.diff) lines.push("", "```diff", s.diff, "```");
    if (s.extra?.length)
      lines.push(
        "",
        "Undocumented in the response (allowed):",
        "",
        ...s.extra.map((e) => `- ${e}`),
      );
    if (s.output)
      lines.push(
        "",
        "<details><summary>output</summary>",
        "",
        "```",
        s.output,
        "```",
        "",
        "</details>",
      );
    lines.push("");
  }
  lines.push(
    "## Fixture environment",
    "",
    "Variables a sample may read without the guide setting them:",
    "",
    ...Object.entries(FIXTURE_DOCS).map(([k, v]) => `- \`${k}\`: ${v}`),
    "",
  );
  return lines.join("\n");
}
