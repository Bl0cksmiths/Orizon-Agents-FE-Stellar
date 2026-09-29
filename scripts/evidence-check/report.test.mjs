import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { main } from "./cli.mjs";
import { toJson, toMarkdown } from "./report.mjs";
import { REPORT_SCHEMA } from "./run.mjs";

const HASH = "a".repeat(64);

/** @returns {import("./run.mjs").Report} */
function sample() {
  return {
    schema: REPORT_SCHEMA,
    mode: "live",
    index: "content/evidence/index.json",
    network: "testnet",
    generated_at: "2026-09-29T00:00:00.000Z",
    endpoints: null,
    validator: { source: "lib", ok: true, problems: [] },
    errors: [],
    refused: null,
    rows: [
      {
        where: "deliverables[0].items[0].links[0]",
        context: "D1 › D1.1",
        label: "FE repo",
        url: "https://github.com/ALGOREX-PH/Orizon-Agents-FE-Stellar",
        kind: "repo",
        result: "pass",
        detail: "http: HTTP 200 after redirect",
        final_url: "https://github.com/Bl0cksmiths/Orizon-Agents-FE-Stellar",
        redirected: true,
        checks: [{ name: "http", result: "pass", detail: "HTTP 200" }],
        chain: null,
      },
      {
        where: "metrics[0].links[0]",
        context: "metric M1",
        label: "reg | tx",
        url: `https://stellar.expert/explorer/testnet/tx/${HASH}`,
        kind: "tx",
        result: "fail",
        detail:
          "date: the index says 2026-09-21, but the tx closed 2026-09-20 (UTC)",
        final_url: `https://stellar.expert/explorer/testnet/tx/${HASH}`,
        redirected: false,
        checks: [],
        chain: {
          hash: HASH,
          ledger: 4242,
          created_at: "2026-09-20T23:30:00Z",
          source_account: "GABC",
          successful: true,
          via: "horizon",
        },
      },
    ],
    summary: {
      links: 2,
      passed: 1,
      failed: 1,
      unverified: 0,
      not_checked: 0,
      redirected: 1,
    },
  };
}

describe("report shapes", () => {
  it("JSON carries the schema, one row per link with its fields, and the summary", () => {
    const parsed = JSON.parse(toJson(sample()));
    assert.equal(parsed.schema, "orizon.evidence-check-report/1");
    assert.deepEqual(Object.keys(parsed.summary), [
      "links",
      "passed",
      "failed",
      "unverified",
      "not_checked",
      "redirected",
    ]);
    assert.equal(parsed.rows.length, 2);
    for (const row of parsed.rows) {
      for (const key of [
        "where",
        "label",
        "url",
        "result",
        "detail",
        "final_url",
        "redirected",
        "checks",
        "chain",
      ]) {
        assert.ok(key in row, key);
      }
    }
  });

  it("Markdown has the summary, one table row per link, the redirect and the tx facts", () => {
    const md = toMarkdown(sample());
    assert.match(
      md,
      /Links: \*\*2\*\* · passed \*\*1\*\* · failed \*\*1\*\* · unverified \*\*0\*\*/,
    );
    assert.match(md, /\| # \| where \| label \| URL \| result \| detail \|/);
    const rows = md.split("\n").filter((l) => /^\| \d+ \|/.test(l));
    assert.equal(rows.length, 2);
    assert.match(
      rows[0],
      /ALGOREX-PH\/Orizon-Agents-FE-Stellar → https:\/\/github.com\/Bl0cksmiths/,
    );
    assert.match(rows[0], /pass \(redirected\)/);
    assert.match(rows[1], /reg \\\| tx/);
    assert.match(rows[1], /\| FAIL \|/);
    assert.match(
      md,
      new RegExp(
        `\\| \`${HASH}\` \\| 4242 \\| 2026-09-20T23:30:00Z \\| \`GABC\` \\| true \\|`,
      ),
    );
  });

  it("Markdown names the stub validator and a refusal", () => {
    const report = sample();
    report.validator.source = "stub";
    report.refused = "refusing to run: Horizon serves mainnet";
    const md = toMarkdown(report);
    assert.match(
      md,
      /LOCAL STUB: lib\/evidence\/validate\.mjs is not on this branch/,
    );
    assert.match(md, /\*\*Run refused:\*\* refusing to run/);
  });
});

describe("cli", () => {
  it("writes both reports and exits 0 on a clean static run, 1 on a bad index, 2 on bad usage", async () => {
    const dir = mkdtempSync(join(tmpdir(), "evidence-cli-"));
    const index = join(dir, "index.json");
    writeFileSync(
      index,
      JSON.stringify({
        schema: "orizon.evidence-index/1",
        deliverables: [],
        metrics: [],
      }),
    );
    const quiet = {
      log: () => {},
      error: () => {},
      loadValidator: async () => ({
        validateEvidenceIndex: (/** @type {any} */ obj) =>
          obj.schema === "orizon.evidence-index/1"
            ? { ok: true, problems: [] }
            : { ok: false, problems: ["schema"] },
        source: /** @type {const} */ ("lib"),
        path: "(test)",
      }),
    };
    const reportDir = join(dir, "out");
    assert.equal(
      await main(
        ["--static", "--index", index, "--report-dir", reportDir],
        quiet,
      ),
      0,
    );
    assert.equal(
      JSON.parse(readFileSync(join(reportDir, "evidence-report.json"), "utf8"))
        .mode,
      "static",
    );
    assert.match(
      readFileSync(join(reportDir, "evidence-report.md"), "utf8"),
      /# Evidence link check/,
    );

    writeFileSync(index, JSON.stringify({ schema: "nope" }));
    assert.equal(
      await main(["--index", index, "--report-dir", reportDir], quiet),
      1,
    );

    assert.equal(await main(["--bogus"], quiet), 2);
    assert.equal(await main(["--static", "--live"], quiet), 2);
    assert.equal(await main(["--retries", "-1"], quiet), 2);
  });
});
