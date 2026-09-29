/**
 * One pass over a guide: what each sample's status means. A manual sample is
 * never executed; a skip is never counted as verified; json and external curl
 * samples get their static checks; per-sample env values reach the sample.
 *
 * Run: node --test scripts/guide-samples
 */
import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { after, test } from "node:test";
import { toMarkdown } from "./report.mjs";
import { checkGuide, reportFailed } from "./run.mjs";
import { envForSample, loadSamplesEnv } from "./samples-env.mjs";

const GUIDE = fileURLToPath(new URL("./fixtures/guide.md", import.meta.url));
const MINI = fileURLToPath(
  new URL("./fixtures/openapi.mini.json", import.meta.url),
);
const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const dir = mkdtempSync(join(tmpdir(), "guide-run-test-"));
after(() => rmSync(dir, { recursive: true, force: true }));

const FRONT =
  "---\ntitle: T\ndescription: D\nversion: 1.0.0\napi_verified_against: aaaaaaa\nnetwork: testnet\nupdated: 2026-09-28\nstatus: draft\n---\n\n";
const fence = (info, code) => `\`\`\`${info}\n${code}\n\`\`\`\n\n`;
const API = fence(
  'bash id="set-api" verify="manual"',
  "export ORIZON_API=https://orizons.xyz/api",
);

/** Write a guide (and optionally its samples.env.json) into its own directory. */
function guideAt(name, body, samplesEnv) {
  const guideDir = join(dir, name);
  mkdirSync(guideDir, { recursive: true });
  const path = join(guideDir, "guide.md");
  writeFileSync(path, FRONT + body);
  const envPath = join(guideDir, "samples.env.json");
  if (samplesEnv !== undefined)
    writeFileSync(envPath, JSON.stringify(samplesEnv));
  return { path, envPath };
}

const run = (path, options = {}) =>
  checkGuide({
    guidePath: path,
    snapshotPath: MINI,
    repoRoot,
    useUnshare: false,
    ...options,
  });
const byId = (report, id) => report.samples.find((s) => s.id === id);

test("a manual sample is never executed, in any mode", async () => {
  const marker = join(dir, "manual-ran");
  const { path } = guideAt(
    "manual",
    API +
      fence('bash id="m-bash" verify="manual"', `touch ${marker}-bash`) +
      fence(
        'js id="m-js" verify="manual"',
        `require("node:fs").writeFileSync(${JSON.stringify(`${marker}-js`)}, "x");`,
      ) +
      fence(
        'python id="m-py" verify="manual"',
        `open(${JSON.stringify(`${marker}-py`)}, "w").write("x")`,
      ),
  );
  const report = await run(path, {
    offline: true,
    python: { python: "python3" },
  });
  for (const id of ["m-bash", "m-js", "m-py"]) {
    assert.equal(byId(report, id).status, "verified", byId(report, id).reason);
    assert.equal(
      byId(report, id).reason,
      "manual — statically checked, never executed",
    );
  }
  for (const suffix of ["bash", "js", "py"])
    assert.equal(existsSync(`${marker}-${suffix}`), false, suffix);
});

test("a skip is reported as not verified and never counted as verified", async () => {
  const report = await run(GUIDE);
  const skipped = report.samples
    .filter((s) => s.status === "skipped")
    .map((s) => s.id);
  assert.deepEqual(skipped.sort(), [
    "bind-challenge",
    "build-register",
    "check-id",
    "digest-message",
    "endpoint-check",
    "get-network",
    "set-api",
    "sign-challenge",
  ]);
  assert.equal(report.counts.skipped, skipped.length);
  assert.equal(report.counts.verified, report.samples.length - skipped.length);
  assert.equal(
    reportFailed(report),
    false,
    "a skip alone does not fail the run",
  );
  const md = toMarkdown(report);
  assert.match(
    md,
    /\*\*\d+ verified, 0 failed, 8 skipped\*\* \(a skip is not verified\)/,
  );
  assert.match(md, /\| `get-network` \| live \| skipped \(not verified\) \|/);

  const noPython = await run(GUIDE, {
    offline: true,
    python: { skip: "no python here" },
  });
  const sign = byId(noPython, "sign-challenge");
  assert.equal(sign.status, "skipped");
  assert.match(sign.reason, /offline: not verified: no python here/);
  assert.equal(byId(noPython, "digest-message").status, "verified");
});

test("a failure anywhere fails the run; a missing guide or an empty one fails it too", async () => {
  const { path } = guideAt(
    "bad",
    API + fence('json id="bad-json" verify="manual"', "{nope"),
  );
  const report = await run(path);
  assert.equal(byId(report, "bad-json").status, "failed");
  assert.equal(reportFailed(report), true);
  const missing = await run(join(dir, "absent.md"));
  assert.match(missing.guideErrors[0], /guide not found/);
  assert.equal(reportFailed(missing), true);
  const { path: empty } = guideAt("empty", "no fences at all\n");
  assert.ok(
    (await run(empty)).guideErrors.includes("the guide has no code samples"),
  );
});

test("a json sample with schema= is validated against that contract schema", async () => {
  const { path } = guideAt(
    "schema",
    API +
      fence(
        'json id="taken" verify="offline" schema="AgentIdAvailability"',
        '{"available": false, "reason": "id_taken", "owner": "<G address>"}',
      ) +
      fence(
        'json id="wrong" verify="manual" schema="AgentIdAvailability"',
        '{"available": "no"}',
      ) +
      fence('json id="ghost" verify="manual" schema="NoSuchSchema"', "{}"),
  );
  const report = await run(path, { offline: true });
  assert.equal(
    byId(report, "taken").status,
    "verified",
    byId(report, "taken").reason,
  );
  assert.match(
    byId(report, "taken").reason,
    /^json — nothing to execute; parse \+ lint \+ schema$/,
  );
  assert.match(
    byId(report, "wrong").reason,
    /schema: \$\.available: expected boolean, got string/,
  );
  assert.match(
    byId(report, "ghost").reason,
    /schema=NoSuchSchema is not a schema in the OpenAPI snapshot/,
  );
});

test("an external curl is linted, and an API URL written without $ORIZON_API is refused", async () => {
  const { path } = guideAt(
    "external",
    API +
      fence(
        'bash id="fund" verify="manual"',
        'curl -sS "https://friendbot.stellar.org/?addr=$OPERATOR_PUBLIC_KEY"',
      ) +
      fence(
        'bash id="sneaky" verify="manual"',
        'curl -sS "https://orizons.xyz/api/stellar/network"',
      ) +
      fence(
        'bash id="broken" verify="manual"',
        'curl -sS "https://friendbot.stellar.org/" -o out.json',
      ),
  );
  const report = await run(path);
  assert.equal(byId(report, "fund").status, "verified");
  assert.match(
    byId(report, "sneaky").reason,
    /is the API: write it as \$ORIZON_API/,
  );
  assert.match(
    byId(report, "broken").reason,
    /the curl does not parse: unsupported curl option -o/,
  );
});

test("per-sample env: a default set, a named set on top, fixtures by ${NAME}", async () => {
  const samplesEnv = {
    default: {
      WHO: "default",
      SECRET_SEED: "${ORIZON_OWNER_SECRET}",
      AGENT: "${ORIZON_AGENT_ID}",
    },
    sets: { other: { WHO: "other" } },
    samples: { second: "other", third: { WHO: "inline" } },
  };
  const script =
    'console.log(process.env.WHO, process.env.AGENT.startsWith("guide_check_"), process.env.SECRET_SEED.startsWith("S"));';
  const { path, envPath } = guideAt(
    "env",
    API +
      fence('js id="first" verify="offline"', script) +
      fence('text id="first-output"', "default true true") +
      fence('js id="second" verify="offline"', script) +
      fence('text id="second-output"', "other true true") +
      fence('js id="third" verify="offline"', script) +
      fence('text id="third-output"', "inline true true"),
    samplesEnv,
  );
  const report = await run(path, { offline: true, samplesEnvPath: envPath });
  assert.deepEqual(report.guideErrors, []);
  for (const id of ["first", "second", "third"])
    assert.equal(byId(report, id).status, "verified", byId(report, id).reason);

  const loaded = loadSamplesEnv(envPath);
  const live = envForSample(loaded, "first", { ORIZON_AGENT_ID: "a" });
  assert.deepEqual(
    live,
    { WHO: "default", AGENT: "a" },
    "a secret fixture never reaches a caller that lacks it",
  );
});

test("a samples.env.json that names a sample the guide lacks, or a fixture that does not exist, is an error", async () => {
  const { path, envPath } = guideAt("stale", API, {
    default: { A: "${NOT_A_FIXTURE}" },
    samples: { gone: {} },
  });
  const report = await run(path, { samplesEnvPath: envPath });
  assert.ok(
    report.guideErrors.some((e) =>
      e.endsWith("names sample gone, which the guide does not have"),
    ),
    report.guideErrors.join("\n"),
  );
  assert.ok(
    report.guideErrors.some((e) =>
      e.includes("references ${NOT_A_FIXTURE}, which is not a fixture"),
    ),
    report.guideErrors.join("\n"),
  );
  const badSet = guideAt("badset", API, { samples: { "set-api": "nope" } });
  assert.match(
    (
      await run(badSet.path, { samplesEnvPath: badSet.envPath })
    ).guideErrors.join("\n"),
    /names an unknown set "nope"/,
  );
});
