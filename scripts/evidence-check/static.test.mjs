import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { checkEvidence, exitCodeOf } from "./run.mjs";
import { loadValidator } from "./validator.mjs";

const dir = mkdtempSync(join(tmpdir(), "evidence-static-"));
const HASH = "f".repeat(64);

const INDEX = {
  schema: "orizon.evidence-index/1",
  deliverables: [
    {
      id: "D1",
      items: [
        {
          id: "D1.1",
          status: "present",
          links: [
            {
              label: "registration",
              url: `https://stellar.expert/explorer/testnet/tx/${HASH}`,
              kind: "tx",
              tx_hash: HASH,
              date: "2026-09-20",
            },
            {
              label: "repo",
              url: "https://github.com/Bl0cksmiths/x",
              kind: "repo",
            },
          ],
        },
      ],
    },
  ],
  metrics: [
    {
      id: "M1",
      status: "not_met",
      reason: "not yet",
      links: [{ label: "page", url: "https://orizons.xyz/", kind: "page" }],
    },
  ],
  disclosures: [],
  notes: [],
};

/** @param {unknown} index */
function write(index) {
  const path = join(dir, `index-${Math.random().toString(36).slice(2)}.json`);
  writeFileSync(path, JSON.stringify(index));
  return path;
}

/** A client that fails the test if static mode ever touches the network. */
const noNetwork = {
  request: async () => assert.fail("static mode made a request"),
  rpc: async () => assert.fail("static mode made an RPC call"),
};

/** A validator spy returning the given verdict. */
function spy(/** @type {{ ok: boolean, problems: string[] }} */ verdict) {
  /** @type {unknown[]} */
  const calls = [];
  return {
    calls,
    load: async () => ({
      validateEvidenceIndex: (/** @type {unknown} */ obj) => {
        calls.push(obj);
        return verdict;
      },
      source: /** @type {const} */ ("lib"),
      path: "(spy)",
    }),
  };
}

describe("evidence-check --static", () => {
  it("runs the structural validator over the parsed index and passes when it is ok", async () => {
    const v = spy({ ok: true, problems: [] });
    const report = await checkEvidence({
      indexPath: write(INDEX),
      mode: "static",
      loadValidator: v.load,
      client: /** @type {any} */ (noNetwork),
    });
    assert.deepEqual(v.calls, [INDEX]);
    assert.equal(report.validator.ok, true);
    assert.equal(exitCodeOf(report), 0);
    assert.deepEqual(
      report.rows.map((r) => [r.where, r.result]),
      [
        ["deliverables[0].items[0].links[0]", "not_checked"],
        ["deliverables[0].items[0].links[1]", "not_checked"],
        ["metrics[0].links[0]", "not_checked"],
      ],
    );
    assert.match(report.rows[0].detail, /tx date 2026-09-20 not verified yet/);
  });

  it("fails with the validator's problems", async () => {
    const v = spy({ ok: false, problems: ["metrics[0].reason: required"] });
    const report = await checkEvidence({
      indexPath: write(INDEX),
      mode: "static",
      loadValidator: v.load,
    });
    assert.equal(v.calls.length, 1);
    assert.deepEqual(report.validator.problems, [
      "metrics[0].reason: required",
    ]);
    assert.equal(exitCodeOf(report), 1);
  });

  it("fails a mainnet URL without the network", async () => {
    const index = structuredClone(INDEX);
    index.metrics[0].links[0].url = `https://stellar.expert/explorer/public/tx/${HASH}`;
    const report = await checkEvidence({
      indexPath: write(index),
      mode: "static",
      loadValidator: spy({ ok: true, problems: [] }).load,
      client: /** @type {any} */ (noNetwork),
    });
    assert.equal(report.rows[2].result, "fail");
    assert.equal(exitCodeOf(report), 1);
  });

  it("fails a missing or unparsable index", async () => {
    const missing = await checkEvidence({
      indexPath: join(dir, "nope.json"),
      mode: "static",
    });
    assert.match(missing.errors[0], /is missing/);
    assert.equal(exitCodeOf(missing), 1);
    const path = join(dir, "broken.json");
    writeFileSync(path, "{");
    const broken = await checkEvidence({ indexPath: path, mode: "static" });
    assert.match(broken.errors[0], /not valid JSON/);
    assert.equal(exitCodeOf(broken), 1);
  });
});

describe("loadValidator", () => {
  it("imports lib/evidence/validate.mjs when it exists", async () => {
    const lib = join(dir, "lib-ok");
    mkdirSync(lib);
    const realPath = join(lib, "validate.mjs");
    writeFileSync(
      realPath,
      'export function validateEvidenceIndex() { return { ok: false, problems: ["from lib"] }; }',
    );
    const v = await loadValidator({ realPath });
    assert.equal(v.source, "lib");
    assert.deepEqual(v.validateEvidenceIndex({}), {
      ok: false,
      problems: ["from lib"],
    });
  });

  it("refuses a lib module without the export rather than falling back", async () => {
    const lib = join(dir, "lib-bad");
    mkdirSync(lib);
    const realPath = join(lib, "validate.mjs");
    writeFileSync(realPath, "export const nothing = 1;");
    await assert.rejects(
      loadValidator({ realPath }),
      /does not export validateEvidenceIndex/,
    );
  });

  it("falls back to the local stub when lib is absent, and the stub enforces the shape", async () => {
    const v = await loadValidator({
      realPath: join(dir, "absent", "validate.mjs"),
    });
    assert.equal(v.source, "stub");
    assert.deepEqual(v.validateEvidenceIndex(INDEX), {
      ok: true,
      problems: [],
    });
    const bad = structuredClone(INDEX);
    bad.deliverables[0].items[0].links[0].tx_hash = "ABC";
    const verdict = v.validateEvidenceIndex(bad);
    assert.equal(verdict.ok, false);
    assert.match(verdict.problems.join("\n"), /tx_hash/);
  });
});
