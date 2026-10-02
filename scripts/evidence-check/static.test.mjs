import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
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

describe("evidence-check --static on removed metrics", () => {
  const REAL = new URL("../../content/evidence/index.json", import.meta.url);
  const real = () => JSON.parse(readFileSync(REAL, "utf8"));

  it("passes the real index, whose m03 is removed: no row and no links for it", async () => {
    const index = real();
    assert.deepEqual(
      index.removed_metrics.map((/** @type {any} */ r) => r.id),
      ["m03"],
    );
    const report = await checkEvidence({
      indexPath: write(index),
      mode: "static",
      client: /** @type {any} */ (noNetwork),
    });
    assert.deepEqual(report.validator.problems, []);
    assert.equal(exitCodeOf(report), 0);
    assert.equal(
      report.rows.filter((r) => r.context === "metric m03").length,
      0,
    );
    assert.ok(report.rows.some((r) => r.context === "metric m04"));
  });

  it("fails an index that drops a metric without its removed_metrics entry", async () => {
    const index = real();
    delete index.removed_metrics;
    const report = await checkEvidence({
      indexPath: write(index),
      mode: "static",
      client: /** @type {any} */ (noNetwork),
    });
    assert.equal(report.validator.ok, false);
    assert.equal(report.validator.problems.length, 1);
    assert.match(
      report.validator.problems[0],
      /m03 is left out with no removed_metrics entry$/,
    );
    assert.equal(exitCodeOf(report), 1);
  });

  it("fails an index that keeps a removed metric's row", async () => {
    const index = real();
    index.metrics.splice(2, 0, {
      ...index.metrics[1],
      id: "m03",
      category: "Transaction targets",
      metric: index.removed_metrics[0].metric,
      target: "≥ 3",
    });
    const report = await checkEvidence({
      indexPath: write(index),
      mode: "static",
      client: /** @type {any} */ (noNetwork),
    });
    assert.deepEqual(report.validator.problems, [
      'removed_metrics[0].id "m03" is still in metrics; a removed metric has no row',
    ]);
    assert.equal(exitCodeOf(report), 1);
  });
});

describe("the real index on outside operators and item notes", () => {
  const REAL = new URL("../../content/evidence/index.json", import.meta.url);
  const raw = () => readFileSync(REAL, "utf8");
  const real = () => JSON.parse(raw());
  /** @param {any} index @param {string} id */
  const item = (index, id) =>
    index.deliverables
      .flatMap((/** @type {any} */ d) => d.items)
      .find((/** @type {any} */ i) => i.id === id);
  /** @param {any} index @param {string} id */
  const metric = (index, id) =>
    index.metrics.find((/** @type {any} */ m) => m.id === id);
  /** @param {any[]} links */
  const outsideRegistrations = (links) =>
    links
      .filter(
        (l) =>
          l.kind === "tx" &&
          /^Registration of \S+ (?:by|signed by) an outside operator's wallet G[A-Z2-7]{4}…[A-Z2-7]{4}\b/.test(
            l.label,
          ),
      )
      .map((l) => l.tx_hash)
      .sort();

  it("holds nothing back for consent: the platform lists outside operators publicly", () => {
    assert.doesNotMatch(raw(), /consent|held back until|withheld/i);
    assert.doesNotMatch(raw(), /orizons\.xyz\/app\/ecosystem/);
  });

  it("links every outside registration as a transaction in D1-c, D4-c, m01 and m06", () => {
    const index = real();
    const d1c = outsideRegistrations(item(index, "6.1-D1-c").links);
    assert.ok(
      d1c.length >= 2,
      `D1-c links ${d1c.length} outside registrations`,
    );
    assert.deepEqual(outsideRegistrations(item(index, "6.1-D4-c").links), d1c);
    assert.deepEqual(outsideRegistrations(metric(index, "m01").links), d1c);
    assert.deepEqual(outsideRegistrations(metric(index, "m06").links), d1c);
    assert.equal(String(d1c.length), metric(index, "m01").achieved);
  });

  it("links every outside operator's wallet in m02", () => {
    const index = real();
    const wallets = metric(index, "m02").links.filter(
      (/** @type {any} */ l) =>
        l.kind === "account" &&
        l.label.startsWith("An outside operator's wallet G"),
    );
    assert.equal(String(wallets.length), metric(index, "m02").achieved);
  });

  it("gives a present item no note, and every other item a short one", () => {
    for (const d of real().deliverables) {
      for (const i of d.items) {
        if (i.status === "present") {
          assert.equal(i.note, undefined, `${i.id} is present but has a note`);
        } else {
          const sentences = i.note.split(/(?<=\.)\s+(?=[A-Z])/).length;
          assert.ok(
            sentences <= 2,
            `${i.id}'s note has ${sentences} sentences`,
          );
        }
      }
    }
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

  it("refuses when the page's validator is absent, rather than validating with rules of its own", async () => {
    await assert.rejects(
      loadValidator({ realPath: join(dir, "absent", "validate.mjs") }),
      /is missing: the checker keeps no rules of its own/,
    );
  });

  it("loads the page's real validator from lib/evidence", async () => {
    const v = await loadValidator();
    const lib = await import("../../lib/evidence/validate.mjs");
    assert.equal(v.source, "lib");
    assert.equal(v.validateEvidenceIndex, lib.validateEvidenceIndex);
  });
});
