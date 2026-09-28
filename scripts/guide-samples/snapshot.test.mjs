/**
 * Drift: the guide's api_verified_against against the snapshot's backend sha,
 * the snapshot against a backend's current OpenAPI, and the refresh that moves
 * the snapshot — each run through the CLI as CI and a maintainer would.
 *
 * Run: node --test scripts/guide-samples
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { after, test } from "node:test";
import {
  checkShaDrift,
  diffOpenApi,
  loadSnapshot,
  META_KEY,
} from "./snapshot.mjs";

const CLI = fileURLToPath(new URL("./cli.mjs", import.meta.url));
const GUIDE = fileURLToPath(new URL("./fixtures/guide.md", import.meta.url));
const MINI_PATH = fileURLToPath(
  new URL("./fixtures/openapi.mini.json", import.meta.url),
);
const MINI = JSON.parse(readFileSync(MINI_PATH, "utf8"));
const REAL = fileURLToPath(
  new URL("../../content/guides/openapi.snapshot.json", import.meta.url),
);

const dir = mkdtempSync(join(tmpdir(), "guide-snapshot-test-"));
after(() => rmSync(dir, { recursive: true, force: true }));

/** @param {string[]} args */
const cli = (args) =>
  spawnSync(process.execPath, [CLI, "--report-dir", dir, ...args], {
    encoding: "utf8",
  });

const FULL = "a".repeat(40);

test("api_verified_against must name the snapshot's backend commit", () => {
  assert.equal(checkShaDrift(FULL, FULL), null);
  assert.equal(
    checkShaDrift("aaaaaaa", FULL),
    null,
    "a short sha that prefixes the full one agrees",
  );
  assert.equal(checkShaDrift("AAAAAAA", FULL), null);
  assert.match(
    checkShaDrift("bbbbbbb", FULL) ?? "",
    /but the OpenAPI snapshot is of backend a{40}/,
  );
  assert.match(
    checkShaDrift("aaaaaa", FULL) ?? "",
    /api_verified_against/,
    "under 7 characters is not a sha",
  );
  assert.match(
    checkShaDrift(undefined, FULL) ?? "",
    /has no api_verified_against/,
  );
});

test("the static CLI passes the fixture guide against its snapshot, and fails when the sha drifts", () => {
  const ok = cli(["--static", "--guide", GUIDE, "--snapshot", MINI_PATH]);
  assert.equal(ok.status, 0, ok.stdout + ok.stderr);

  const drifted = join(dir, "drifted.json");
  writeFileSync(
    drifted,
    JSON.stringify({
      ...MINI,
      [META_KEY]: { ...MINI[META_KEY], backend_sha: "b".repeat(40) },
    }),
  );
  const bad = cli(["--static", "--guide", GUIDE, "--snapshot", drifted]);
  assert.equal(bad.status, 1, bad.stdout);
  assert.match(
    bad.stdout,
    /## Guide errors\n\n- the guide says api_verified_against: aaaaaaaa, but the OpenAPI snapshot is of backend b{40}/,
  );
  const json = JSON.parse(readFileSync(join(dir, "guide-report.json"), "utf8"));
  assert.equal(json.guideErrors.length, 1);
});

test("a snapshot without its backend sha is refused", () => {
  const { [META_KEY]: _meta, ...bare } = MINI;
  const path = join(dir, "bare.json");
  writeFileSync(path, JSON.stringify(bare));
  assert.throws(
    () => loadSnapshot(path),
    /has no x-orizon-snapshot.backend_sha/,
  );
  const run = cli(["--static", "--guide", GUIDE, "--snapshot", path]);
  assert.equal(run.status, 1);
  assert.throws(
    () => loadSnapshot(join(dir, "absent.json")),
    /OpenAPI snapshot not found/,
  );
});

test("the committed snapshot is a 3.1 document of a recorded backend commit", () => {
  const { doc, meta } = loadSnapshot(REAL);
  assert.match(meta.backend_sha, /^[0-9a-f]{40}$/);
  assert.ok(
    Object.keys(doc.paths).includes("/api/agents/{agent_id}/bind/challenge"),
  );
});

test("diffOpenApi reports added, removed and changed operations and schemas, not the metadata", () => {
  const current = structuredClone(MINI);
  delete current[META_KEY];
  assert.deepEqual(diffOpenApi(MINI, current), []);
  current.paths["/api/new"] = { get: { responses: {} } };
  delete current.paths["/api/health"];
  current.components.schemas.XdrResponse.required = [];
  current.paths["/api/stellar/network"].get.summary = "renamed";
  assert.deepEqual(diffOpenApi(MINI, current).sort(), [
    "operation added: GET /api/new",
    "operation changed: GET /api/stellar/network",
    "operation removed: GET /api/health",
    "schema changed: XdrResponse",
  ]);
});

test("--diff-openapi exits 1 on a difference and 0 on none", () => {
  const same = join(dir, "same.json");
  const { [META_KEY]: _m, ...plain } = MINI;
  writeFileSync(same, JSON.stringify(plain));
  const ok = cli(["--snapshot", MINI_PATH, "--diff-openapi", same]);
  assert.equal(ok.status, 0, ok.stderr);
  const changed = join(dir, "changed.json");
  writeFileSync(
    changed,
    JSON.stringify({
      ...plain,
      paths: { ...plain.paths, "/api/x": { get: {} } },
    }),
  );
  const bad = cli(["--snapshot", MINI_PATH, "--diff-openapi", changed]);
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /operation added: GET \/api\/x/);
});

test("--refresh-openapi rewrites the snapshot with the backend sha, and requires one", () => {
  const source = join(dir, "source.json");
  const { [META_KEY]: _m, ...plain } = MINI;
  writeFileSync(source, JSON.stringify(plain));
  const target = join(dir, "refreshed.json");
  const noSha = cli(["--snapshot", target, "--refresh-openapi", source]);
  assert.equal(noSha.status, 1);
  assert.match(noSha.stderr, /needs --backend-sha/);
  const sha = "c".repeat(40);
  const ok = cli([
    "--snapshot",
    target,
    "--refresh-openapi",
    source,
    "--backend-sha",
    sha,
    "--backend-ref",
    "origin/x",
  ]);
  assert.equal(ok.status, 0, ok.stderr);
  const { doc, meta } = loadSnapshot(target);
  assert.equal(meta.backend_sha, sha);
  assert.equal(meta.backend_ref, "origin/x");
  assert.deepEqual(diffOpenApi(doc, plain), []);
});
