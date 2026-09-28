/**
 * The offline sandbox: pass, fail, timeout, no network, no host environment,
 * and a missing interpreter reported as not verified.
 *
 * Run: node --test scripts/guide-samples
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { after, test } from "node:test";
import { fixtureEnv } from "./fixtures.mjs";
import { hasUnshare, resolvePython, runOffline } from "./offline.mjs";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const env = fixtureEnv();

/** A sample fence as parse.mjs would hand it over. */
const sample = (lang, code, output) => ({
  id: "s",
  lang,
  verify: "offline",
  code,
  attrs: {},
  ...(output === undefined ? {} : { output: { id: "s-output", code: output } }),
});
const run = (s, extra = {}) =>
  runOffline(s, {
    env,
    repoRoot,
    timeoutMs: 5000,
    useUnshare: false,
    ...extra,
  });

test("a snippet that exits 0 with the documented output is verified", async () => {
  const r = await run(
    sample(
      "js",
      'console.log("digest:", process.env.ORIZON_AGENT_ID.length > 0);',
      "digest: <anything>",
    ),
  );
  assert.equal(r.status, "verified", r.reason + r.stderr);
  const bash = await run(
    sample(
      "bash",
      'export ORIZON_API=https://orizons.xyz/api\necho "$ORIZON_NETWORK"',
      "testnet",
    ),
  );
  assert.equal(bash.status, "verified", bash.reason);
});

test("a non-zero exit, or output that differs from the -output fence, fails", async () => {
  const exit = await run(
    sample("js", 'console.error("boom"); process.exit(3);'),
  );
  assert.equal(exit.status, "failed");
  assert.match(exit.reason, /exited 3: boom/);
  const differs = await run(sample("bash", "echo length: 63", "length: 64"));
  assert.equal(differs.status, "failed");
  assert.match(differs.diff, /- line 1: length: 64\n\+ line 1: length: 63/);
});

test("a snippet that runs past the timeout is killed and fails", async () => {
  const started = Date.now();
  const r = await run(sample("js", "setInterval(() => {}, 1000);"), {
    timeoutMs: 500,
  });
  assert.equal(r.status, "failed");
  assert.match(r.reason, /timed out after 500 ms/);
  assert.ok(Date.now() - started < 4000);
});

test("the network is denied, even without a network namespace", async () => {
  let hits = 0;
  const server = createServer((_req, res) => {
    hits += 1;
    res.end("reached");
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  after(() => server.close());
  const { port } = /** @type {import("node:net").AddressInfo} */ (
    server.address()
  );
  const js = await run(
    sample(
      "js",
      `await fetch("http://127.0.0.1:${port}/"); console.log("reached");`,
    ),
  );
  assert.equal(js.status, "failed", js.stdout);
  const http = await run(
    sample(
      "js",
      `import http from "node:http"; http.get("http://127.0.0.1:${port}/", () => console.log("reached"));`,
    ),
  );
  assert.equal(http.status, "failed", http.stdout);
  const python = spawnSync("python3", ["--version"]);
  if (python.status === 0) {
    const py = await run(
      sample(
        "python",
        `import urllib.request\nurllib.request.urlopen("http://127.0.0.1:${port}/")`,
      ),
      {
        python: { python: "python3" },
      },
    );
    assert.equal(py.status, "failed", py.stdout);
    assert.match(py.stderr, /network access is disabled in the guide sandbox/);
  }
  const bash = await run(sample("bash", `curl -s http://127.0.0.1:${port}/`));
  assert.equal(bash.status, "failed");
  assert.match(bash.reason, /not a pure bash sample: it runs curl/);
  assert.equal(hits, 0, "nothing reached the server");
});

test(
  "the network namespace is used when the machine has one",
  { skip: !hasUnshare() && "no unshare -rn here" },
  async () => {
    const r = await runOffline(sample("bash", "echo ok"), {
      env,
      repoRoot,
      timeoutMs: 5000,
    });
    assert.equal(r.status, "verified", r.reason);
    assert.match(r.sandbox ?? "", /unshare -rn/);
  },
);

test("a snippet sees the fixture env, never the caller's", async () => {
  process.env.GUIDE_TEST_LEAK = "should-not-be-visible";
  after(() => delete process.env.GUIDE_TEST_LEAK);
  const r = await run(
    sample(
      "js",
      'console.log(process.env.GUIDE_TEST_LEAK ?? "absent", process.env.ORIZON_OWNER_SECRET.startsWith("S"));',
      "absent true",
    ),
  );
  assert.equal(r.status, "verified", r.reason + r.stdout);
});

test("python without a configured interpreter is skipped as not verified, never passed", async () => {
  assert.match(resolvePython({}).skip, /set ORIZON_BE_VENV/);
  assert.match(
    resolvePython({ ORIZON_BE_VENV: "/nonexistent/venv" }).skip,
    /does not exist/,
  );
  const r = await runOffline(sample("python", "print(1)"), {
    env,
    repoRoot,
    python: resolvePython({}),
    useUnshare: false,
  });
  assert.equal(r.status, "skipped");
  assert.match(
    r.reason,
    /^not verified: no Python with stellar_sdk configured/,
  );
});

const venvPython = resolvePython();
test(
  "the guide's signing snippets run against the fixture key and XDR",
  { skip: "skip" in venvPython && `not verified here: ${venvPython.skip}` },
  async () => {
    const code = [
      "import os",
      "from stellar_sdk import Keypair, Network, TransactionEnvelope",
      'keypair = Keypair.from_secret(os.environ["ORIZON_OWNER_SECRET"])',
      'envelope = TransactionEnvelope.from_xdr(os.environ["ORIZON_UNSIGNED_XDR"], Network.TESTNET_NETWORK_PASSPHRASE)',
      "assert envelope.transaction.source.account_id == keypair.public_key",
      "envelope.sign(keypair)",
      "print(len(envelope.signatures))",
    ].join("\n");
    const r = await run(sample("python", code, "1"), {
      python: venvPython,
      timeoutMs: 20_000,
    });
    assert.equal(r.status, "verified", r.reason + r.stderr);
  },
);
