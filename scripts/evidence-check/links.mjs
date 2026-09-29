/**
 * Every link in an evidence index, with where it sits, plus the pure facts a
 * checker reads off a link without the network: which Stellar network its URL
 * names, and the tx hash, contract id or account id it points at.
 *
 * Links live in `deliverables[].items[].links[]` and `metrics[].links[]`
 * (schema orizon.evidence-index/1). The walk tolerates a malformed index —
 * the structural validator reports that — and simply skips what is not there.
 */

/**
 * @typedef {{ label?: unknown, url?: unknown, kind?: unknown, tx_hash?: unknown, date?: unknown }} Link
 * @typedef {{ where: string, context: string, link: Link }} LocatedLink
 */

const TX_HASH = /\b[0-9a-f]{64}\b/i;
const CONTRACT_ID = /\bC[A-Z2-7]{55}\b/;
const ACCOUNT_ID = /\bG[A-Z2-7]{55}\b/;

/** @param {unknown} v @returns {any[]} */
const list = (v) => (Array.isArray(v) ? v : []);

/** @param {any} node @param {string} fallback */
const name = (node, fallback) =>
  typeof node?.id === "string"
    ? node.id
    : typeof node?.title === "string"
      ? node.title
      : typeof node?.name === "string"
        ? node.name
        : fallback;

/**
 * @param {any} index  the parsed index
 * @returns {LocatedLink[]}
 */
export function collectLinks(index) {
  /** @type {LocatedLink[]} */
  const out = [];
  list(index?.deliverables).forEach((d, i) => {
    list(d?.items).forEach((item, j) => {
      list(item?.links).forEach((link, k) => {
        out.push({
          where: `deliverables[${i}].items[${j}].links[${k}]`,
          context: `${name(d, `deliverable ${i + 1}`)} › ${name(item, `item ${j + 1}`)}`,
          link: link ?? {},
        });
      });
    });
  });
  list(index?.metrics).forEach((m, i) => {
    list(m?.links).forEach((link, k) => {
      out.push({
        where: `metrics[${i}].links[${k}]`,
        context: `metric ${name(m, String(i + 1))}`,
        link: link ?? {},
      });
    });
  });
  return out;
}

const MAINNET_HOSTS = new Set([
  "horizon.stellar.org",
  "mainnet.sorobanrpc.com",
  "soroban-rpc.mainnet.stellar.gateway.fm",
]);

/**
 * The Stellar network a URL names, if it names one. Explorers put it in a
 * path segment (stellar.expert/explorer/testnet/..., /public/...), a
 * subdomain (testnet.stellarchain.io) or a query (?network=public).
 *
 * @param {string} url
 * @returns {"testnet" | "mainnet" | null}
 */
export function urlNetwork(url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase();
  if (MAINNET_HOSTS.has(host)) return "mainnet";
  const segments = u.pathname.toLowerCase().split("/").filter(Boolean);
  const param = (u.searchParams.get("network") ?? "").toLowerCase();
  if (
    segments.includes("public") ||
    segments.includes("mainnet") ||
    param === "public" ||
    param === "mainnet"
  )
    return "mainnet";
  if (
    segments.includes("testnet") ||
    param === "testnet" ||
    host.startsWith("testnet.") ||
    host.includes("-testnet.")
  )
    return "testnet";
  return null;
}

/** @param {Link} link */
export function txHashOf(link) {
  if (typeof link.tx_hash === "string" && link.tx_hash) return link.tx_hash;
  const m = typeof link.url === "string" ? link.url.match(TX_HASH) : null;
  return m ? m[0].toLowerCase() : null;
}

/** @param {Link} link */
export function contractIdOf(link) {
  const m = typeof link.url === "string" ? link.url.match(CONTRACT_ID) : null;
  return m ? m[0] : null;
}

/** @param {Link} link */
export function accountIdOf(link) {
  const m = typeof link.url === "string" ? link.url.match(ACCOUNT_ID) : null;
  return m ? m[0] : null;
}

/** @param {string} url */
export function isYouTube(url) {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\.|^m\./, "");
    return host === "youtube.com" || host === "youtu.be";
  } catch {
    return false;
  }
}
