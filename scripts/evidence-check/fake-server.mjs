/**
 * Test helper (not a test): one local HTTP server standing in for Horizon
 * testnet, mainnet Horizon, Soroban RPC, YouTube oEmbed and the pages an
 * evidence index links to. A test builds a `world`, points the checker's
 * endpoints at `base`, and reads `requests` to see what was asked.
 *
 *   GET  /horizon/                        { network_passphrase }
 *   GET  /horizon/transactions/<hash>     world.horizonTxs
 *   GET  /horizon/accounts/<G>            world.accounts
 *   GET  /mainnet/transactions/<hash>     world.mainnetTxs
 *   POST /rpc                             getNetwork, getTransaction, getLedgerEntries
 *   GET  /oembed?url=...                  world.videos (status by video URL)
 *   anything else                         world.pages[path] ({ status, headers, body })
 */
import { createServer } from "node:http";

export const TESTNET = "Test SDF Network ; September 2015";
export const PUBNET = "Public Global Stellar Network ; September 2015";

/**
 * @typedef {{ status?: number, headers?: Record<string, string>, body?: string }} Page
 * @typedef {{
 *   horizonPassphrase: string, rpcPassphrase: string,
 *   horizonTxs: Record<string, object>, mainnetTxs: Record<string, object>,
 *   rpcTxs: Record<string, object>, accounts: Set<string>,
 *   contractKeys: Set<string>, videos: Record<string, number>,
 *   pages: Record<string, Page>,
 * }} World
 */

/** @returns {World} */
export function emptyWorld() {
  return {
    horizonPassphrase: TESTNET,
    rpcPassphrase: TESTNET,
    horizonTxs: {},
    mainnetTxs: {},
    rpcTxs: {},
    accounts: new Set(),
    contractKeys: new Set(),
    videos: {},
    pages: {},
  };
}

/**
 * @param {World} world
 * @returns {Promise<{ base: string, requests: { method: string, url: string, userAgent: string, body: string }[], close: () => Promise<void> }>}
 */
export async function startFake(world) {
  /** @type {{ method: string, url: string, userAgent: string, body: string }[]} */
  const requests = [];
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      const url = new URL(req.url ?? "/", "http://fake");
      requests.push({
        method: req.method ?? "",
        url: url.pathname + url.search,
        userAgent: String(req.headers["user-agent"] ?? ""),
        body,
      });
      const json = (
        /** @type {number} */ status,
        /** @type {unknown} */ value,
      ) => {
        res.writeHead(status, { "content-type": "application/json" });
        res.end(JSON.stringify(value));
      };
      const path = url.pathname;
      let m;
      if (path === "/horizon/" || path === "/horizon") {
        return json(200, { network_passphrase: world.horizonPassphrase });
      }
      if ((m = path.match(/^\/horizon\/transactions\/(\w+)$/))) {
        const tx = world.horizonTxs[m[1]];
        return tx ? json(200, tx) : json(404, { status: 404 });
      }
      if ((m = path.match(/^\/horizon\/accounts\/(\w+)$/))) {
        return world.accounts.has(m[1])
          ? json(200, { id: m[1] })
          : json(404, { status: 404 });
      }
      if ((m = path.match(/^\/mainnet\/transactions\/(\w+)$/))) {
        const tx = world.mainnetTxs[m[1]];
        return tx ? json(200, tx) : json(404, { status: 404 });
      }
      if (path === "/rpc" && req.method === "POST") {
        const call = JSON.parse(body || "{}");
        const reply = (/** @type {unknown} */ result) =>
          json(200, { jsonrpc: "2.0", id: call.id, result });
        if (call.method === "getNetwork")
          return reply({ passphrase: world.rpcPassphrase });
        if (call.method === "getTransaction") {
          return reply(
            world.rpcTxs[call.params.hash] ?? { status: "NOT_FOUND" },
          );
        }
        if (call.method === "getLedgerEntries") {
          const entries = call.params.keys
            .filter((/** @type {string} */ k) => world.contractKeys.has(k))
            .map((/** @type {string} */ key) => ({
              key,
              xdr: "",
              lastModifiedLedgerSeq: 123,
            }));
          return reply({ entries, latestLedger: 999 });
        }
        return json(200, {
          jsonrpc: "2.0",
          id: call.id,
          error: { code: -32601, message: "no such method" },
        });
      }
      if (path === "/oembed") {
        const status = world.videos[url.searchParams.get("url") ?? ""] ?? 404;
        return status === 200
          ? json(200, { title: "Orizon demo" })
          : json(status, {});
      }
      const page = world.pages[path];
      if (!page) {
        res.writeHead(404, { "content-type": "text/html" });
        return res.end("<h1>not found</h1>");
      }
      res.writeHead(page.status ?? 200, {
        "content-type": "text/html",
        ...(page.headers ?? {}),
      });
      res.end(page.body ?? "<h1>ok</h1>");
    });
  });
  await new Promise((resolve) =>
    server.listen(0, "127.0.0.1", () => resolve(undefined)),
  );
  const address = /** @type {import("node:net").AddressInfo} */ (
    server.address()
  );
  return {
    base: `http://127.0.0.1:${address.port}`,
    requests,
    close: () =>
      new Promise((resolve) => server.close(() => resolve(undefined))),
  };
}
