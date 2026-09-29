import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, beforeEach, describe, it } from "node:test";
import {
  Account,
  Contract,
  Keypair,
  Operation,
  StrKey,
  TransactionBuilder,
} from "@stellar/stellar-sdk";
import { HarnessError, loadStellarSdk } from "./checks.mjs";
import { main } from "./cli.mjs";
import { emptyWorld, PUBNET, startFake, TESTNET } from "./fake-server.mjs";
import { USER_AGENT } from "./http.mjs";
import { checkEvidence, exitCodeOf } from "./run.mjs";

const HASH = (/** @type {string} */ c) => c.repeat(64);
const REGISTRY = "CAPHXWU53UZUZJGV7IAE57NNMH3YYB5MTWO6YA53KKMXSFVLOITBJ3GQ";
const GONE = StrKey.encodeContract(Buffer.alloc(32, 7));
const ACCOUNT = Keypair.random().publicKey();
const instanceKey = (/** @type {string} */ id) =>
  new Contract(id).getFootprint().toXDR("base64");

/** @type {Awaited<ReturnType<typeof startFake>>} */
let fake;
/** @type {ReturnType<typeof emptyWorld>} */
let world;
const dir = mkdtempSync(join(tmpdir(), "evidence-live-"));

before(async () => {
  world = emptyWorld();
  fake = await startFake(world);
});
after(() => fake.close());
beforeEach(() => {
  Object.assign(world, emptyWorld());
  fake.requests.length = 0;
});

const okValidator = async () => ({
  validateEvidenceIndex: () => ({ ok: true, problems: [] }),
  source: /** @type {const} */ ("lib"),
  path: "(test)",
});

/** Writes an index holding these links (as one deliverable item). @param {object[]} links */
function writeIndex(links) {
  const indexPath = join(
    dir,
    `index-${Math.random().toString(36).slice(2)}.json`,
  );
  writeFileSync(
    indexPath,
    JSON.stringify({
      schema: "orizon.evidence-index/1",
      deliverables: [
        { id: "D1", items: [{ id: "D1.1", status: "present", links }] },
      ],
      metrics: [],
    }),
  );
  return indexPath;
}

/**
 * Runs --live over an index holding these links (as one deliverable item).
 * @param {object[]} links
 * @param {Partial<import("./run.mjs").RunOptions>} [options]
 */
async function live(links, options = {}) {
  const report = await checkEvidence({
    indexPath: writeIndex(links),
    mode: "live",
    loadValidator: okValidator,
    ...options,
    clientOptions: { retryDelaysMs: [], minIntervalMs: 0, timeoutMs: 5_000 },
    endpoints: {
      horizon: `${fake.base}/horizon`,
      rpc: `${fake.base}/rpc`,
      mainnetHorizon: `${fake.base}/mainnet`,
      oembed: `${fake.base}/oembed`,
    },
  });
  return { report, code: exitCodeOf(report) };
}

const page = (/** @type {string} */ path) => `${fake.base}${path}`;
const txLink = (/** @type {string} */ hash, /** @type {string=} */ date) => ({
  label: "tx",
  url: page(`/explorer/testnet/tx/${hash}`),
  kind: "tx",
  tx_hash: hash,
  ...(date ? { date } : {}),
});
const horizonTx = (/** @type {boolean} */ successful) => ({
  successful,
  ledger: 4242,
  created_at: "2026-09-20T23:30:00Z",
  source_account: ACCOUNT,
});

describe("evidence-check --live", () => {
  it("passes a world where every link resolves and every chain fact holds", async () => {
    world.pages["/app/register"] = {};
    world.pages[`/explorer/testnet/tx/${HASH("a")}`] = {};
    world.pages[`/explorer/testnet/contract/${REGISTRY}`] = {};
    world.pages[`/explorer/testnet/account/${ACCOUNT}`] = {};
    world.horizonTxs[HASH("a")] = horizonTx(true);
    world.contractKeys.add(instanceKey(REGISTRY));
    world.accounts.add(ACCOUNT);
    world.videos["https://youtu.be/demo123"] = 200;

    const { report, code } = await live([
      { label: "register", url: page("/app/register"), kind: "page" },
      txLink(HASH("a"), "2026-09-20"),
      {
        label: "registry",
        url: page(`/explorer/testnet/contract/${REGISTRY}`),
        kind: "contract",
      },
      {
        label: "admin",
        url: page(`/explorer/testnet/account/${ACCOUNT}`),
        kind: "account",
      },
      { label: "demo", url: "https://youtu.be/demo123", kind: "video" },
    ]);

    assert.equal(code, 0, JSON.stringify(report.rows, null, 2));
    assert.deepEqual(
      report.rows.map((r) => r.result),
      ["pass", "pass", "pass", "pass", "pass"],
    );
    assert.deepEqual(report.rows[1].chain, {
      hash: HASH("a"),
      ledger: 4242,
      created_at: "2026-09-20T23:30:00Z",
      source_account: ACCOUNT,
      successful: true,
      via: "horizon",
    });
    assert.equal(report.rows[1].where, "deliverables[0].items[0].links[1]");
    assert.ok(fake.requests.length > 0);
    for (const r of fake.requests) assert.equal(r.userAgent, USER_AGENT);
  });

  it("fails a 404", async () => {
    const { report, code } = await live([
      { label: "guide", url: page("/guide/list-your-agent"), kind: "page" },
    ]);
    assert.equal(code, 1);
    assert.equal(report.rows[0].result, "fail");
    assert.match(report.rows[0].detail, /HTTP 404/);
  });

  it("follows a redirect, reports the final URL, and passes", async () => {
    world.pages["/ALGOREX-PH/Orizon-Agents-FE-Stellar"] = {
      status: 301,
      headers: { location: "/Bl0cksmiths/Orizon-Agents-FE-Stellar" },
    };
    world.pages["/Bl0cksmiths/Orizon-Agents-FE-Stellar"] = {};
    const { report, code } = await live([
      {
        label: "repo",
        url: page("/ALGOREX-PH/Orizon-Agents-FE-Stellar"),
        kind: "repo",
      },
    ]);
    assert.equal(code, 0);
    const row = report.rows[0];
    assert.equal(row.result, "pass");
    assert.equal(row.redirected, true);
    assert.equal(row.final_url, page("/Bl0cksmiths/Orizon-Agents-FE-Stellar"));
    assert.equal(report.summary.redirected, 1);
  });

  it("fails a Vercel login wall, served directly or by redirect", async () => {
    world.pages["/preview"] = {
      status: 401,
      body: '<title>Authentication Required</title><script>location="https://vercel.com/sso-api?url=x"</script>',
    };
    world.pages["/private"] = {
      status: 302,
      headers: { location: "/login?next=/private" },
    };
    world.pages["/login"] = { body: "<form>sign in</form>" };
    const { report, code } = await live([
      { label: "preview", url: page("/preview"), kind: "page" },
      { label: "private", url: page("/private"), kind: "page" },
    ]);
    assert.equal(code, 1);
    assert.equal(report.rows[0].result, "fail");
    assert.match(
      report.rows[0].detail,
      /login wall: the Vercel Authentication page/,
    );
    assert.equal(report.rows[1].result, "fail");
    assert.match(
      report.rows[1].detail,
      /login wall: redirected to a sign-in page/,
    );
  });

  it("fails a transaction that was not successful", async () => {
    world.pages[`/explorer/testnet/tx/${HASH("b")}`] = {};
    world.horizonTxs[HASH("b")] = horizonTx(false);
    const { report, code } = await live([txLink(HASH("b"))]);
    assert.equal(code, 1);
    assert.equal(report.rows[0].result, "fail");
    assert.match(report.rows[0].detail, /FAILED on testnet/);
  });

  it("fails a hash that is missing on testnet but present on mainnet", async () => {
    world.pages[`/explorer/testnet/tx/${HASH("c")}`] = {};
    world.mainnetTxs[HASH("c")] = { ...horizonTx(true), ledger: 555 };
    const { report, code } = await live([txLink(HASH("c"))]);
    assert.equal(code, 1);
    assert.equal(report.rows[0].result, "fail");
    assert.match(report.rows[0].detail, /exists on MAINNET \(ledger 555\)/);
    assert.ok(
      fake.requests.some((r) => r.body.includes('"getTransaction"')),
      "asked RPC before concluding it is not on testnet",
    );
  });

  it("finds a transaction through RPC when Horizon lacks it", async () => {
    const source = Keypair.random();
    const envelope = new TransactionBuilder(
      new Account(source.publicKey(), "1"),
      {
        fee: "100",
        networkPassphrase: TESTNET,
      },
    )
      .addOperation(Operation.manageData({ name: "n", value: "v" }))
      .setTimeout(0)
      .build()
      .toXDR();
    world.pages[`/explorer/testnet/tx/${HASH("d")}`] = {};
    world.rpcTxs[HASH("d")] = {
      status: "SUCCESS",
      ledger: 77,
      createdAt: String(Date.parse("2026-09-21T01:02:03Z") / 1000),
      envelopeXdr: envelope,
    };
    const { report, code } = await live([txLink(HASH("d"), "2026-09-21")]);
    assert.equal(code, 0, report.rows[0].detail);
    assert.deepEqual(report.rows[0].chain, {
      hash: HASH("d"),
      ledger: 77,
      created_at: "2026-09-21T01:02:03.000Z",
      source_account: source.publicKey(),
      successful: true,
      via: "rpc",
    });
  });

  it("fails a date that does not match the ledger's UTC date", async () => {
    world.pages[`/explorer/testnet/tx/${HASH("e")}`] = {};
    world.horizonTxs[HASH("e")] = horizonTx(true);
    const { report, code } = await live([txLink(HASH("e"), "2026-09-21")]);
    assert.equal(code, 1);
    assert.equal(report.rows[0].result, "fail");
    assert.match(
      report.rows[0].detail,
      /the index says 2026-09-21, but the tx closed 2026-09-20 \(UTC\)/,
    );
  });

  it("fails a contract with no instance on testnet", async () => {
    world.pages[`/explorer/testnet/contract/${GONE}`] = {};
    const { report, code } = await live([
      {
        label: "gone",
        url: page(`/explorer/testnet/contract/${GONE}`),
        kind: "contract",
      },
    ]);
    assert.equal(code, 1);
    assert.equal(report.rows[0].result, "fail");
    assert.match(report.rows[0].detail, /no contract instance/);
    const call = fake.requests.find((r) => r.body.includes("getLedgerEntries"));
    assert.deepEqual(JSON.parse(call?.body ?? "{}").params, {
      keys: [instanceKey(GONE)],
    });
  });

  it("fails an account Horizon does not know", async () => {
    world.pages[`/explorer/testnet/account/${ACCOUNT}`] = {};
    const { report, code } = await live([
      {
        label: "acct",
        url: page(`/explorer/testnet/account/${ACCOUNT}`),
        kind: "account",
      },
    ]);
    assert.equal(code, 1);
    assert.match(report.rows[0].detail, /no account/);
  });

  it("marks a link it could not reach unverified, with its own exit code", async () => {
    const { report, code } = await live([
      { label: "down", url: "http://127.0.0.1:1/nothing", kind: "page" },
    ]);
    assert.equal(report.rows[0].result, "unverified");
    assert.match(report.rows[0].detail, /no answer after 1 attempts/);
    assert.equal(report.summary.passed, 0);
    assert.equal(code, 3);
  });

  it("refuses to run when Horizon or RPC serve mainnet, fetching no link", async () => {
    world.pages["/app/register"] = {};
    for (const key of /** @type {const} */ ([
      "horizonPassphrase",
      "rpcPassphrase",
    ])) {
      Object.assign(world, emptyWorld(), { [key]: PUBNET });
      world.pages["/app/register"] = {};
      fake.requests.length = 0;
      const { report, code } = await live([
        { label: "register", url: page("/app/register"), kind: "page" },
      ]);
      assert.equal(code, 2, key);
      assert.match(report.refused ?? "", /refusing to run: .* not testnet/);
      assert.ok(!fake.requests.some((r) => r.url === "/app/register"), key);
    }
  });

  it("fails a link whose URL names mainnet without fetching it", async () => {
    const { report, code } = await live([
      {
        label: "pubnet",
        url: page(`/explorer/public/contract/${REGISTRY}`),
        kind: "contract",
      },
    ]);
    assert.equal(code, 1);
    assert.match(report.rows[0].detail, /points at mainnet/);
    assert.ok(!fake.requests.some((r) => r.url.includes("/explorer/public/")));
  });
});

describe("evidence-check --live without @stellar/stellar-sdk", () => {
  const missing = async () => {
    throw new Error(
      "Cannot find package '@stellar/stellar-sdk' imported from checks.mjs",
    );
  };
  const chainLinks = () => [
    {
      label: "registry",
      url: page(`/explorer/testnet/contract/${REGISTRY}`),
      kind: "contract",
    },
    txLink(HASH("f"), "2026-09-20"),
    { label: "register", url: page("/app/register"), kind: "page" },
  ];

  it("stops with a harness error naming the package: exit 2, no link failed or passed, nothing fetched", async () => {
    world.pages[`/explorer/testnet/contract/${REGISTRY}`] = {};
    world.pages["/app/register"] = {};
    world.contractKeys.add(instanceKey(REGISTRY));
    const { report, code } = await live(chainLinks(), { importSdk: missing });
    assert.equal(code, 2);
    assert.match(
      report.harness_error ?? "",
      /^harness error: cannot import @stellar\/stellar-sdk \(Cannot find package/,
    );
    assert.match(report.harness_error ?? "", /npm ci/);
    assert.deepEqual(
      report.rows.map((row) => row.result),
      ["not_checked", "not_checked", "not_checked"],
    );
    assert.equal(report.summary.failed, 0);
    assert.equal(report.summary.passed, 0);
    assert.ok(
      !report.rows.some((row) => /not a valid contract id/.test(row.detail)),
    );
    assert.equal(fake.requests.length, 0);
  });

  it("says so on stderr and in the report, and the cli exits 2", async () => {
    /** @type {string[]} */
    const errors = [];
    /** @type {string[]} */
    const logs = [];
    const code = await main(
      [
        "--live",
        "--index",
        writeIndex(chainLinks()),
        "--report-dir",
        join(dir, "harness-report"),
        "--horizon",
        `${fake.base}/horizon`,
        "--rpc",
        `${fake.base}/rpc`,
      ],
      {
        log: (line) => logs.push(line),
        error: (line) => errors.push(line),
        loadValidator: okValidator,
        importSdk: missing,
      },
    );
    assert.equal(code, 2);
    assert.match(errors.join("\n"), /cannot import @stellar\/stellar-sdk/);
    assert.match(
      logs.join("\n"),
      /\*\*Checker could not run \(exit 2\):\*\* harness error: cannot import @stellar\/stellar-sdk/,
    );
    assert.equal(fake.requests.length, 0);
  });

  it("loadStellarSdk throws a HarnessError naming the package, or the exports it lacks", async () => {
    await assert.rejects(
      loadStellarSdk(missing),
      (err) =>
        err instanceof HarnessError &&
        /cannot import @stellar\/stellar-sdk/.test(err.message),
    );
    await assert.rejects(
      loadStellarSdk(async () => ({ Contract })),
      (err) =>
        err instanceof HarnessError &&
        /@stellar\/stellar-sdk was imported but has no TransactionBuilder, FeeBumpTransaction/.test(
          err.message,
        ),
    );
    const sdk = await loadStellarSdk();
    assert.equal(sdk.Contract, Contract);
  });
});
