/**
 * Unit tests for the live checks in checks.mjs, run against a stub client so
 * every answer a link or an endpoint can give is pinned without a server.
 * live.test.mjs runs the same checks end to end through a fake server.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  TESTNET_ENDPOINTS,
  checkReachable,
  checkTx,
  loadStellarSdk,
} from "./checks.mjs";
import { NetworkError } from "./http.mjs";

/**
 * @typedef {{ status: number, url?: string, text?: string, chain?: { url: string, status: number }[] }} StubAnswer
 */

/**
 * A client whose `request` answers each URL from `pages`, and whose `rpc`
 * answers each method from `rpcs`; either throws a NetworkError for what it
 * lacks, or throws the Error it is given. Records every URL and method asked.
 *
 * @param {Record<string, StubAnswer | Error>} pages
 * @param {Record<string, { status: number, json: unknown } | Error>} [rpcs]
 */
function stubClient(pages, rpcs = {}) {
  /** @type {string[]} */
  const asked = [];
  return {
    asked,
    /** @param {string} endpoint @param {string} method */
    async rpc(endpoint, method) {
      asked.push(`${endpoint} ${method}`);
      const reply = rpcs[method];
      if (reply === undefined) throw new NetworkError(`no answer to ${method}`);
      if (reply instanceof Error) throw reply;
      return { answer: { status: reply.status }, json: reply.json };
    },
    /** @param {string} url */
    async request(url) {
      asked.push(url);
      const page = pages[url];
      if (page === undefined) throw new NetworkError(`no answer for ${url}`);
      if (page instanceof Error) throw page;
      return {
        url: page.url ?? url,
        status: page.status,
        text: page.text ?? "",
        chain: page.chain ?? [{ url, status: page.status }],
        headers: new Headers(),
      };
    },
  };
}

const VIDEO = "https://youtu.be/demo123";
const OEMBED = `${TESTNET_ENDPOINTS.oembed}?url=${encodeURIComponent(VIDEO)}&format=json`;

describe("checkReachable: a YouTube link, through oEmbed", () => {
  it("passes a 200, quoting the title when there is one", async () => {
    const titled = stubClient({
      [OEMBED]: { status: 200, text: JSON.stringify({ title: "Demo" }) },
    });
    assert.deepEqual(await checkReachable(titled, VIDEO, TESTNET_ENDPOINTS), {
      check: {
        name: "youtube-oembed",
        result: "pass",
        detail: 'oEmbed 200: public or unlisted ("Demo")',
      },
      finalUrl: VIDEO,
      redirected: false,
    });
    assert.deepEqual(titled.asked, [OEMBED]);

    const untitled = stubClient({ [OEMBED]: { status: 200, text: "{}" } });
    const { check } = await checkReachable(untitled, VIDEO, TESTNET_ENDPOINTS);
    assert.equal(check.detail, "oEmbed 200: public or unlisted");
  });

  for (const [status, result, detail] of [
    [401, "fail", "oEmbed HTTP 401: private, or embedding disabled"],
    [403, "fail", "oEmbed HTTP 403: private, or embedding disabled"],
    [404, "fail", "oEmbed HTTP 404: no such video"],
    [500, "fail", "oEmbed HTTP 500: not viewable"],
    [429, "unverified", "oEmbed HTTP 429: rate limited"],
  ]) {
    it(`reports an oEmbed ${status} as ${result}`, async () => {
      const client = stubClient({ [OEMBED]: { status: Number(status) } });
      assert.deepEqual(await checkReachable(client, VIDEO, TESTNET_ENDPOINTS), {
        check: { name: "youtube-oembed", result, detail },
        finalUrl: null,
        redirected: false,
      });
    });
  }

  it("marks no answer unverified", async () => {
    const client = stubClient({});
    assert.deepEqual(await checkReachable(client, VIDEO, TESTNET_ENDPOINTS), {
      check: {
        name: "youtube-oembed",
        result: "unverified",
        detail: `no answer for ${OEMBED}`,
      },
      finalUrl: null,
      redirected: false,
    });
  });
});

describe("checkReachable: any other link", () => {
  const URL_ = "https://example.com/page";
  const FINAL = "https://example.com/final";
  const redirect = (/** @type {number} */ status, final = FINAL) => ({
    status,
    url: final,
    chain: [
      { url: URL_, status: 301 },
      { url: final, status },
    ],
  });

  it("marks no answer unverified", async () => {
    const client = stubClient({ [URL_]: new NetworkError("timed out") });
    assert.deepEqual(await checkReachable(client, URL_, TESTNET_ENDPOINTS), {
      check: { name: "http", result: "unverified", detail: "timed out" },
      finalUrl: null,
      redirected: false,
    });
  });

  it("passes a 2xx, naming a redirect's final URL", async () => {
    const direct = stubClient({ [URL_]: { status: 204 } });
    assert.deepEqual(await checkReachable(direct, URL_, TESTNET_ENDPOINTS), {
      check: { name: "http", result: "pass", detail: "HTTP 204" },
      finalUrl: URL_,
      redirected: false,
    });
    const moved = stubClient({ [URL_]: redirect(200) });
    assert.deepEqual(await checkReachable(moved, URL_, TESTNET_ENDPOINTS), {
      check: {
        name: "http",
        result: "pass",
        detail: `HTTP 200 after redirect to ${FINAL}`,
      },
      finalUrl: FINAL,
      redirected: true,
    });
  });

  it("fails a login wall before looking at the status", async () => {
    const client = stubClient({
      [URL_]: redirect(200, "https://accounts.google.com/signin"),
    });
    const { check, finalUrl, redirected } = await checkReachable(
      client,
      URL_,
      TESTNET_ENDPOINTS,
    );
    assert.deepEqual(check, {
      name: "http",
      result: "fail",
      detail: "login wall: redirected to a sign-in page (accounts.google.com)",
    });
    assert.equal(finalUrl, "https://accounts.google.com/signin");
    assert.equal(redirected, true);
  });

  it("marks a 429 unverified", async () => {
    const client = stubClient({ [URL_]: redirect(429) });
    const { check } = await checkReachable(client, URL_, TESTNET_ENDPOINTS);
    assert.deepEqual(check, {
      name: "http",
      result: "unverified",
      detail: `HTTP 429 after redirect to ${FINAL}: rate limited, not checked`,
    });
  });

  it("explains a GitHub 404, and fails any other status", async () => {
    const repo = "https://github.com/org/private";
    const github = stubClient({ [repo]: { status: 404 } });
    assert.deepEqual(
      (await checkReachable(github, repo, TESTNET_ENDPOINTS)).check,
      {
        name: "http",
        result: "fail",
        detail:
          "HTTP 404: GitHub answers 404 anonymously, so this is private or missing",
      },
    );
    const other = stubClient({ [URL_]: { status: 404 } });
    assert.deepEqual(
      (await checkReachable(other, URL_, TESTNET_ENDPOINTS)).check,
      { name: "http", result: "fail", detail: "HTTP 404" },
    );
    const broken = stubClient({ [URL_]: redirect(500) });
    assert.deepEqual(await checkReachable(broken, URL_, TESTNET_ENDPOINTS), {
      check: {
        name: "http",
        result: "fail",
        detail: `HTTP 500 after redirect to ${FINAL}`,
      },
      finalUrl: FINAL,
      redirected: true,
    });
  });
});

describe("checkTx: finding the transaction on testnet", () => {
  const HASH = "a".repeat(64);
  const link = { url: `https://stellar.expert/explorer/testnet/tx/${HASH}` };
  const H_TX = `${TESTNET_ENDPOINTS.horizon}/transactions/${HASH}`;
  const RPC = `${TESTNET_ENDPOINTS.rpc} getTransaction`;
  const both = { horizon: true, rpc: true };
  /** @param {ReturnType<typeof stubClient>} client @param {{ horizon: boolean, rpc: boolean }} reachable */
  const run = async (client, reachable = both) =>
    checkTx(client, link, TESTNET_ENDPOINTS, reachable, await loadStellarSdk());

  it("reads Horizon first, keeping only well-typed fields", async () => {
    const client = stubClient({
      [H_TX]: {
        status: 200,
        text: JSON.stringify({ ledger: "7", successful: "yes" }),
      },
    });
    assert.deepEqual(await run(client), {
      checks: [
        {
          name: "testnet-tx",
          result: "fail",
          detail:
            "the transaction FAILED on testnet: ledger ?, no time, source ?, via horizon",
        },
      ],
      chain: {
        hash: HASH,
        ledger: null,
        created_at: null,
        source_account: null,
        successful: false,
        via: "horizon",
      },
    });
    assert.deepEqual(client.asked, [H_TX]);
  });

  it("marks a Horizon error other than 404 unverified", async () => {
    const client = stubClient({ [H_TX]: { status: 500 } });
    assert.deepEqual(await run(client), {
      checks: [
        {
          name: "testnet-tx",
          result: "unverified",
          detail: `Horizon answered HTTP 500 for ${HASH}`,
        },
      ],
      chain: null,
    });
    assert.deepEqual(client.asked, [H_TX]);
  });

  it("marks it unverified when RPC is unreachable, saying which endpoints were", async () => {
    const afterHorizon = stubClient({ [H_TX]: { status: 404 } });
    assert.equal(
      (await run(afterHorizon, { horizon: true, rpc: false })).checks[0].detail,
      "not on Horizon testnet, and Soroban RPC was unreachable",
    );
    const neither = stubClient({});
    assert.equal(
      (await run(neither, { horizon: false, rpc: false })).checks[0].detail,
      "neither Horizon nor Soroban RPC testnet was reachable",
    );
    assert.deepEqual(neither.asked, []);
  });

  it("marks an RPC error unverified, quoting its message", async () => {
    const failing = stubClient(
      {},
      { getTransaction: { status: 500, json: { error: { message: "boom" } } } },
    );
    assert.deepEqual(
      (await run(failing, { horizon: false, rpc: true })).checks[0],
      {
        name: "testnet-tx",
        result: "unverified",
        detail: "RPC getTransaction answered HTTP 500: boom",
      },
    );
    assert.deepEqual(failing.asked, [RPC]);
    const empty = stubClient({}, { getTransaction: { status: 200, json: {} } });
    assert.equal(
      (await run(empty, { horizon: false, rpc: true })).checks[0].detail,
      "RPC getTransaction answered HTTP 200",
    );
  });

  it("reads RPC when Horizon lacks it, keeping only what parses", async () => {
    const client = stubClient(
      { [H_TX]: { status: 404 } },
      {
        getTransaction: {
          status: 200,
          json: {
            result: {
              status: "FAILED",
              ledger: "9",
              createdAt: "0",
              envelopeXdr: "not an envelope",
            },
          },
        },
      },
    );
    const { chain } = await run(client);
    assert.deepEqual(chain, {
      hash: HASH,
      ledger: null,
      created_at: null,
      source_account: null,
      successful: false,
      via: "rpc",
    });
    assert.deepEqual(client.asked, [H_TX, RPC]);
  });
});
