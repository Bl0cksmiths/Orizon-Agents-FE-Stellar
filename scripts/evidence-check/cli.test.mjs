/**
 * The cli's own contract: its usage errors word for word, --help, and how its
 * flags reach the client and the endpoints. report.test.mjs and live.test.mjs
 * cover the runs themselves.
 */
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { main } from "./cli.mjs";
import { emptyWorld, startFake } from "./fake-server.mjs";

const dir = mkdtempSync(join(tmpdir(), "evidence-cli-"));

/** Runs the cli, collecting what it logs and what it reports as errors. @param {string[]} argv */
async function cli(argv) {
  /** @type {string[]} */
  const logs = [];
  /** @type {string[]} */
  const errors = [];
  const code = await main(argv, {
    log: (line) => logs.push(line),
    error: (line) => errors.push(line),
    loadValidator: async () => ({
      validateEvidenceIndex: () => ({ ok: true, problems: [] }),
      source: /** @type {const} */ ("lib"),
      path: "(test)",
    }),
  });
  return { code, logs, errors };
}

describe("evidence-check cli: usage", () => {
  for (const [argv, message] of [
    [["--static", "--live"], "choose one of --static and --live"],
    [["--retries=-1"], "--retries must be an integer >= 0"],
    [["--retries", "1.5"], "--retries must be an integer >= 0"],
    [["--timeout-ms", "0"], "--timeout-ms must be an integer >= 1"],
    [["--interval-ms", "x"], "--interval-ms must be an integer >= 0"],
  ]) {
    it(`refuses ${argv.join(" ")} with exit 2`, async () => {
      assert.deepEqual(await cli(argv), {
        code: 2,
        logs: [],
        errors: [`${message}\nRun with --help for usage.`],
      });
    });
  }

  it("refuses an unknown flag with exit 2", async () => {
    const { code, logs, errors } = await cli(["--bogus"]);
    assert.equal(code, 2);
    assert.deepEqual(logs, []);
    assert.equal(errors.length, 1);
    assert.match(errors[0], /^Unknown option '--bogus'/);
    assert.match(errors[0], /\nRun with --help for usage\.$/);
  });

  it("points --help at the header and exits 0, checking nothing", async () => {
    assert.deepEqual(await cli(["--help"]), {
      code: 0,
      logs: ["See the header of scripts/evidence-check/cli.mjs for usage."],
      errors: [],
    });
  });
});

describe("evidence-check cli: flags reach the run", () => {
  /** @type {Awaited<ReturnType<typeof startFake>>} */
  let fake;
  before(async () => {
    fake = await startFake(emptyWorld());
  });
  after(() => fake.close());

  it("strips trailing slashes from endpoints and turns --retries into attempts", async () => {
    const index = join(dir, "index.json");
    writeFileSync(
      index,
      JSON.stringify({
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
                    label: "down",
                    url: "http://127.0.0.1:1/nothing",
                    kind: "page",
                  },
                ],
              },
            ],
          },
        ],
        metrics: [],
      }),
    );
    const reportDir = join(dir, "report");
    const { code, logs, errors } = await cli([
      "--live",
      "--index",
      index,
      "--report-dir",
      reportDir,
      "--horizon",
      `${fake.base}/horizon//`,
      "--rpc",
      `${fake.base}/rpc/`,
      "--retries",
      "0",
      "--interval-ms",
      "0",
    ]);
    assert.equal(code, 3);
    assert.ok(fake.requests.some((r) => r.url === "/horizon/"));
    assert.ok(fake.requests.some((r) => r.url === "/rpc"));
    assert.match(logs[0], /no answer after 1 attempts/);
    assert.equal(
      logs[1],
      `report: ${join(reportDir, "evidence-report.md")} and evidence-report.json`,
    );
    assert.deepEqual(errors, [
      "some links could not be checked (unverified): exit 3, not a pass",
    ]);
  });
});
