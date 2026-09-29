/**
 * The live checks, one link at a time. Testnet only.
 *
 *   every link   GET it, following redirects by hand; a final 2xx with no
 *                login wall passes. A redirect passes but is reported with its
 *                final URL (GitHub sends ALGOREX-PH to Bl0cksmiths). A YouTube
 *                link is checked through oEmbed instead, which answers 200 only
 *                for a public or unlisted video.
 *   tx           also: Horizon testnet has it and it is `successful`, falling
 *                back to Soroban RPC `getTransaction`; its ledger, created_at
 *                and source account are recorded, and a `date` on the link must
 *                equal created_at's UTC date. A hash that is on mainnet but not
 *                on testnet FAILS, and the report says so.
 *   contract     also: RPC `getLedgerEntries` finds the contract instance.
 *   account      also: Horizon `accounts/<G>` answers 200.
 *
 * A link whose URL names mainnet fails without being fetched. Before any
 * chain check, `preflight` asks Horizon and RPC which network they serve and
 * refuses to run against anything but testnet.
 *
 * Each check is pass, fail or unverified. No answer at all (NetworkError) is
 * unverified, never a pass; a row is the worst of its checks.
 */
import { NetworkError, parseJson } from "./http.mjs";
import {
  accountIdOf,
  contractIdOf,
  isYouTube,
  txHashOf,
  urlNetwork,
} from "./links.mjs";

export const TESTNET_PASSPHRASE = "Test SDF Network ; September 2015";

export const TESTNET_ENDPOINTS = Object.freeze({
  horizon: "https://horizon-testnet.stellar.org",
  rpc: "https://soroban-testnet.stellar.org",
  /** Read only to say "this hash is on mainnet" when testnet lacks it. */
  mainnetHorizon: "https://horizon.stellar.org",
  oembed: "https://www.youtube.com/oembed",
});

/**
 * @typedef {"pass" | "fail" | "unverified"} Result
 * @typedef {{ name: string, result: Result, detail: string }} Check
 * @typedef {typeof TESTNET_ENDPOINTS} Endpoints
 * @typedef {ReturnType<typeof import("./http.mjs").createClient>} Client
 * @typedef {{ horizon: boolean, rpc: boolean }} Reachable
 * @typedef {{ hash: string, ledger: number | null, created_at: string | null, source_account: string | null, successful: boolean, via: "horizon" | "rpc" }} ChainTx
 */

export class RefusedError extends Error {}

/** @param {unknown} err */
const why = (err) => (err instanceof Error ? err.message : String(err));

/** @param {Check[]} checks @returns {Result} */
export function worst(checks) {
  if (checks.some((c) => c.result === "fail")) return "fail";
  if (checks.some((c) => c.result === "unverified")) return "unverified";
  return "pass";
}

/**
 * Asks both chain endpoints which network they serve. Throws RefusedError when
 * either answers with anything but the testnet passphrase; an endpoint that
 * does not answer at all is marked unreachable, and the checks that need it
 * come back unverified.
 *
 * @param {Client} client
 * @param {Endpoints} endpoints
 * @returns {Promise<Reachable>}
 */
export async function preflight(client, endpoints) {
  const reachable = { horizon: false, rpc: false };
  try {
    const answer = await client.request(`${endpoints.horizon}/`);
    const passphrase = parseJson(answer.text)?.network_passphrase;
    if (passphrase !== TESTNET_PASSPHRASE) {
      throw new RefusedError(
        `refusing to run: Horizon ${endpoints.horizon} serves ${JSON.stringify(passphrase ?? `HTTP ${answer.status}`)}, not testnet`,
      );
    }
    reachable.horizon = true;
  } catch (err) {
    if (!(err instanceof NetworkError)) throw err;
  }
  try {
    const { answer, json } = await client.rpc(endpoints.rpc, "getNetwork", {});
    const passphrase = json?.result?.passphrase;
    if (passphrase !== TESTNET_PASSPHRASE) {
      throw new RefusedError(
        `refusing to run: RPC ${endpoints.rpc} serves ${JSON.stringify(passphrase ?? `HTTP ${answer.status}`)}, not testnet`,
      );
    }
    reachable.rpc = true;
  } catch (err) {
    if (!(err instanceof NetworkError)) throw err;
  }
  return reachable;
}

const LOGIN_HOSTS = new Set([
  "accounts.google.com",
  "login.microsoftonline.com",
  "login.live.com",
]);
const LOGIN_PATH =
  /(^|\/)(login|log-in|signin|sign-in|sign_in|sso|sso-api)(\/|$)/i;
const VERCEL_WALL =
  /vercel\.com\/sso-api|_vercel_sso_nonce|vercel-authentication|<title>[^<]*log ?in[^<]*vercel[^<]*<\/title>/i;

/**
 * Why this answer is a login wall rather than the page, or null.
 * @param {import("./http.mjs").Answer} answer
 */
export function loginWall(answer) {
  const final = new URL(answer.url);
  const host = final.hostname.toLowerCase();
  if (host === "vercel.com" && LOGIN_PATH.test(final.pathname))
    return `redirected to the Vercel login (${final.origin}${final.pathname}): a protected deployment`;
  if (
    VERCEL_WALL.test(answer.text) ||
    (/authentication required/i.test(answer.text) &&
      /vercel/i.test(answer.text))
  )
    return "the Vercel Authentication page: a protected deployment";
  if (LOGIN_HOSTS.has(host)) return `redirected to a sign-in page (${host})`;
  if (answer.chain.length > 1 && LOGIN_PATH.test(final.pathname))
    return `redirected to a sign-in page (${final.origin}${final.pathname})`;
  if (answer.status === 401) return "HTTP 401: authentication required";
  return null;
}

/**
 * @param {Client} client
 * @param {string} url
 * @param {Endpoints} endpoints
 * @returns {Promise<{ check: Check, finalUrl: string | null, redirected: boolean }>}
 */
export async function checkReachable(client, url, endpoints) {
  if (isYouTube(url)) {
    const oembed = `${endpoints.oembed}?url=${encodeURIComponent(url)}&format=json`;
    try {
      const answer = await client.request(oembed);
      if (answer.status === 200) {
        const title = parseJson(answer.text)?.title;
        return {
          check: {
            name: "youtube-oembed",
            result: "pass",
            detail: `oEmbed 200: public or unlisted${title ? ` ("${title}")` : ""}`,
          },
          finalUrl: url,
          redirected: false,
        };
      }
      const meaning =
        answer.status === 401 || answer.status === 403
          ? "private, or embedding disabled"
          : answer.status === 404
            ? "no such video"
            : "not viewable";
      return {
        check: {
          name: "youtube-oembed",
          result: answer.status === 429 ? "unverified" : "fail",
          detail: `oEmbed HTTP ${answer.status}: ${answer.status === 429 ? "rate limited" : meaning}`,
        },
        finalUrl: null,
        redirected: false,
      };
    } catch (err) {
      return {
        check: {
          name: "youtube-oembed",
          result: "unverified",
          detail: why(err),
        },
        finalUrl: null,
        redirected: false,
      };
    }
  }

  let answer;
  try {
    answer = await client.request(url);
  } catch (err) {
    return {
      check: { name: "http", result: "unverified", detail: why(err) },
      finalUrl: null,
      redirected: false,
    };
  }
  const redirected = answer.chain.length > 1;
  const via = redirected ? ` after redirect to ${answer.url}` : "";
  const wall = loginWall(answer);
  /** @type {Check} */
  let check;
  if (wall) {
    check = { name: "http", result: "fail", detail: `login wall: ${wall}` };
  } else if (answer.status >= 200 && answer.status < 300) {
    check = {
      name: "http",
      result: "pass",
      detail: `HTTP ${answer.status}${via}`,
    };
  } else if (answer.status === 429) {
    check = {
      name: "http",
      result: "unverified",
      detail: `HTTP 429${via}: rate limited, not checked`,
    };
  } else if (
    answer.status === 404 &&
    new URL(answer.url).hostname === "github.com"
  ) {
    check = {
      name: "http",
      result: "fail",
      detail: `HTTP 404${via}: GitHub answers 404 anonymously, so this is private or missing`,
    };
  } else {
    check = {
      name: "http",
      result: "fail",
      detail: `HTTP ${answer.status}${via}`,
    };
  }
  return { check, finalUrl: answer.url, redirected };
}

/** @param {string} envelopeXdr */
async function sourceOfEnvelope(envelopeXdr) {
  try {
    const { TransactionBuilder, FeeBumpTransaction } =
      await import("@stellar/stellar-sdk");
    const tx = TransactionBuilder.fromXDR(envelopeXdr, TESTNET_PASSPHRASE);
    return tx instanceof FeeBumpTransaction
      ? tx.innerTransaction.source
      : tx.source;
  } catch {
    return null;
  }
}

/**
 * The transaction as testnet knows it: Horizon first, then RPC. null when
 * neither has it.
 *
 * @param {Client} client
 * @param {string} hash
 * @param {Endpoints} endpoints
 * @param {Reachable} reachable
 * @returns {Promise<ChainTx | null>}
 */
async function findOnTestnet(client, hash, endpoints, reachable) {
  if (reachable.horizon) {
    const answer = await client.request(
      `${endpoints.horizon}/transactions/${hash}`,
    );
    if (answer.status === 200) {
      const tx = parseJson(answer.text) ?? {};
      return {
        hash,
        ledger: typeof tx.ledger === "number" ? tx.ledger : null,
        created_at: typeof tx.created_at === "string" ? tx.created_at : null,
        source_account:
          typeof tx.source_account === "string" ? tx.source_account : null,
        successful: tx.successful === true,
        via: "horizon",
      };
    }
    if (answer.status !== 404) {
      throw new NetworkError(
        `Horizon answered HTTP ${answer.status} for ${hash}`,
      );
    }
  }
  if (!reachable.rpc) {
    throw new NetworkError(
      reachable.horizon
        ? "not on Horizon testnet, and Soroban RPC was unreachable"
        : "neither Horizon nor Soroban RPC testnet was reachable",
    );
  }
  const { answer, json } = await client.rpc(endpoints.rpc, "getTransaction", {
    hash,
  });
  const result = json?.result;
  if (answer.status !== 200 || !result) {
    throw new NetworkError(
      `RPC getTransaction answered HTTP ${answer.status}${json?.error ? `: ${json.error.message}` : ""}`,
    );
  }
  if (result.status === "NOT_FOUND") return null;
  const createdAt = Number(result.createdAt);
  return {
    hash,
    ledger: typeof result.ledger === "number" ? result.ledger : null,
    created_at:
      Number.isFinite(createdAt) && createdAt > 0
        ? new Date(createdAt * 1000).toISOString()
        : null,
    source_account:
      typeof result.envelopeXdr === "string"
        ? await sourceOfEnvelope(result.envelopeXdr)
        : null,
    successful: result.status === "SUCCESS",
    via: "rpc",
  };
}

/** @param {string} value  YYYY-MM-DD or an ISO timestamp */
function utcDate(value) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const t = Date.parse(value);
  return Number.isNaN(t) ? null : new Date(t).toISOString().slice(0, 10);
}

/**
 * @param {Client} client
 * @param {import("./links.mjs").Link} link
 * @param {Endpoints} endpoints
 * @param {Reachable} reachable
 * @returns {Promise<{ checks: Check[], chain: ChainTx | null }>}
 */
export async function checkTx(client, link, endpoints, reachable) {
  const hash = txHashOf(link);
  if (!hash) {
    return {
      checks: [
        {
          name: "testnet-tx",
          result: "fail",
          detail: "no tx hash on the link",
        },
      ],
      chain: null,
    };
  }
  let chain;
  try {
    chain = await findOnTestnet(client, hash, endpoints, reachable);
  } catch (err) {
    return {
      checks: [{ name: "testnet-tx", result: "unverified", detail: why(err) }],
      chain: null,
    };
  }
  if (!chain) {
    let detail = "not found on testnet (Horizon and RPC)";
    try {
      const main = await client.request(
        `${endpoints.mainnetHorizon}/transactions/${hash}`,
      );
      if (main.status === 200) {
        const ledger = parseJson(main.text)?.ledger;
        detail = `not on testnet: this hash exists on MAINNET${ledger ? ` (ledger ${ledger})` : ""}; the index is testnet only`;
      }
    } catch {
      detail += "; the mainnet lookup got no answer";
    }
    return {
      checks: [{ name: "testnet-tx", result: "fail", detail }],
      chain: null,
    };
  }
  const where = `ledger ${chain.ledger ?? "?"}, ${chain.created_at ?? "no time"}, source ${chain.source_account ?? "?"}, via ${chain.via}`;
  /** @type {Check[]} */
  const checks = [
    chain.successful
      ? {
          name: "testnet-tx",
          result: "pass",
          detail: `successful on testnet: ${where}`,
        }
      : {
          name: "testnet-tx",
          result: "fail",
          detail: `the transaction FAILED on testnet: ${where}`,
        },
  ];
  if (typeof link.date === "string" && link.date) {
    const claimed = utcDate(link.date);
    const actual = chain.created_at ? utcDate(chain.created_at) : null;
    if (!actual) {
      checks.push({
        name: "date",
        result: "unverified",
        detail: "testnet gave no created_at to compare",
      });
    } else if (claimed === actual) {
      checks.push({
        name: "date",
        result: "pass",
        detail: `date ${actual} matches (UTC)`,
      });
    } else {
      checks.push({
        name: "date",
        result: "fail",
        detail: `the index says ${link.date}, but the tx closed ${actual} (UTC)`,
      });
    }
  }
  return { checks, chain };
}

/**
 * @param {Client} client
 * @param {import("./links.mjs").Link} link
 * @param {Endpoints} endpoints
 * @param {Reachable} reachable
 * @returns {Promise<Check>}
 */
export async function checkContract(client, link, endpoints, reachable) {
  const id = contractIdOf(link);
  if (!id)
    return {
      name: "testnet-contract",
      result: "fail",
      detail: "no contract id (C...) in the URL",
    };
  let key;
  try {
    const { Contract } = await import("@stellar/stellar-sdk");
    key = new Contract(id).getFootprint().toXDR("base64");
  } catch (err) {
    return {
      name: "testnet-contract",
      result: "fail",
      detail: `${id} is not a valid contract id: ${why(err)}`,
    };
  }
  if (!reachable.rpc) {
    return {
      name: "testnet-contract",
      result: "unverified",
      detail: "Soroban RPC testnet was unreachable",
    };
  }
  try {
    const { answer, json } = await client.rpc(
      endpoints.rpc,
      "getLedgerEntries",
      { keys: [key] },
    );
    const entries = json?.result?.entries;
    if (answer.status !== 200 || !Array.isArray(entries)) {
      return {
        name: "testnet-contract",
        result: "unverified",
        detail: `RPC getLedgerEntries answered HTTP ${answer.status}${json?.error ? `: ${json.error.message}` : ""}`,
      };
    }
    if (entries.length === 0) {
      return {
        name: "testnet-contract",
        result: "fail",
        detail: `no contract instance for ${id} on testnet`,
      };
    }
    const seq = entries[0]?.lastModifiedLedgerSeq;
    return {
      name: "testnet-contract",
      result: "pass",
      detail: `instance exists on testnet${seq ? ` (last modified ledger ${seq})` : ""}`,
    };
  } catch (err) {
    return { name: "testnet-contract", result: "unverified", detail: why(err) };
  }
}

/**
 * @param {Client} client
 * @param {import("./links.mjs").Link} link
 * @param {Endpoints} endpoints
 * @param {Reachable} reachable
 * @returns {Promise<Check>}
 */
export async function checkAccount(client, link, endpoints, reachable) {
  const id = accountIdOf(link);
  if (!id)
    return {
      name: "testnet-account",
      result: "fail",
      detail: "no account id (G...) in the URL",
    };
  if (!reachable.horizon) {
    return {
      name: "testnet-account",
      result: "unverified",
      detail: "Horizon testnet was unreachable",
    };
  }
  try {
    const answer = await client.request(`${endpoints.horizon}/accounts/${id}`);
    if (answer.status === 200)
      return {
        name: "testnet-account",
        result: "pass",
        detail: "account exists on testnet",
      };
    if (answer.status === 404)
      return {
        name: "testnet-account",
        result: "fail",
        detail: `no account ${id} on testnet`,
      };
    return {
      name: "testnet-account",
      result: "unverified",
      detail: `Horizon answered HTTP ${answer.status}`,
    };
  } catch (err) {
    return { name: "testnet-account", result: "unverified", detail: why(err) };
  }
}

/**
 * @typedef {{
 *   where: string, context: string, label: string, url: string, kind: string,
 *   result: Result | "not_checked", detail: string, final_url: string | null,
 *   redirected: boolean, checks: Check[], chain: ChainTx | null,
 * }} Row
 */

/**
 * A link's network check, shared by --static and --live: a URL that names
 * mainnet fails before anything is fetched.
 * @param {string} url
 * @returns {Check | null}
 */
export function networkRefusal(url) {
  return urlNetwork(url) === "mainnet"
    ? {
        name: "network",
        result: "fail",
        detail:
          "the URL points at mainnet; this index is testnet only (refused, not fetched)",
      }
    : null;
}

/** @param {import("./links.mjs").LocatedLink} located @returns {Omit<Row, "result" | "detail" | "checks">} */
export function rowBase({ where, context, link }) {
  return {
    where,
    context,
    label: typeof link.label === "string" ? link.label : "",
    url: typeof link.url === "string" ? link.url : "",
    kind: typeof link.kind === "string" ? link.kind : "",
    final_url: null,
    redirected: false,
    chain: null,
  };
}

/** @param {Check[]} checks */
export function summarize(checks) {
  const result = worst(checks);
  const shown =
    result === "pass" ? checks : checks.filter((c) => c.result !== "pass");
  return {
    result,
    detail: shown.map((c) => `${c.name}: ${c.detail}`).join(" · "),
  };
}

/**
 * @param {Client} client
 * @param {import("./links.mjs").LocatedLink} located
 * @param {Endpoints} endpoints
 * @param {Reachable} reachable
 * @returns {Promise<Row>}
 */
export async function checkLink(client, located, endpoints, reachable) {
  const row = rowBase(located);
  const refused = networkRefusal(row.url);
  if (refused) return { ...row, checks: [refused], ...summarize([refused]) };
  if (!/^https?:\/\//i.test(row.url)) {
    const bad = /** @type {Check} */ ({
      name: "http",
      result: "fail",
      detail: "not an http(s) URL",
    });
    return { ...row, checks: [bad], ...summarize([bad]) };
  }
  const reach = await checkReachable(client, row.url, endpoints);
  /** @type {Check[]} */
  const checks = [reach.check];
  let chain = null;
  if (row.kind === "tx") {
    const tx = await checkTx(client, located.link, endpoints, reachable);
    checks.push(...tx.checks);
    chain = tx.chain;
  } else if (row.kind === "contract") {
    checks.push(
      await checkContract(client, located.link, endpoints, reachable),
    );
  } else if (row.kind === "account") {
    checks.push(await checkAccount(client, located.link, endpoints, reachable));
  }
  return {
    ...row,
    final_url: reach.finalUrl,
    redirected: reach.redirected,
    chain,
    checks,
    ...summarize(checks),
  };
}
