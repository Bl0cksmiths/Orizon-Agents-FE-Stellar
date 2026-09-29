/**
 * The one HTTP client every live check goes through: an identifying
 * User-Agent, a timeout, a polite per-host pace, bounded retries, and
 * redirects followed by hand so the report can show every hop.
 *
 * A request that never gets an answer (DNS, refused, reset, timeout) after its
 * retries throws NetworkError, which the checks turn into "unverified" — never
 * a pass and never a fail, because nothing was learned about the link. Any
 * HTTP answer, including a 5xx after retries, is returned for the caller to
 * judge.
 */

export const USER_AGENT =
  "orizon-evidence-check/1 (+https://github.com/Bl0cksmiths/Orizon-Agents-FE-Stellar)";

const RETRYABLE = new Set([429, 500, 502, 503, 504]);
const REDIRECTS = new Set([301, 302, 303, 307, 308]);

export class NetworkError extends Error {}

/**
 * @typedef {{
 *   userAgent?: string, retryDelaysMs?: number[], timeoutMs?: number,
 *   minIntervalMs?: number, maxRedirects?: number, fetchImpl?: typeof fetch,
 * }} ClientOptions
 * @typedef {{ url: string, status: number }} Hop
 * @typedef {{
 *   status: number, url: string, chain: Hop[], headers: Headers, text: string,
 * }} Answer
 */

export const LIVE_DEFAULTS = Object.freeze({
  userAgent: USER_AGENT,
  retryDelaysMs: [1_000, 3_000],
  timeoutMs: 20_000,
  minIntervalMs: 750,
  maxRedirects: 10,
});

const sleep = (/** @type {number} */ ms) =>
  new Promise((resolve) => setTimeout(resolve, ms));

/** @param {unknown} err */
const reason = (err) =>
  err instanceof Error
    ? `${err.message}${err.cause instanceof Error ? ` (${err.cause.message})` : ""}`
    : String(err);

/** @param {ClientOptions} [options] */
export function createClient(options = {}) {
  const {
    userAgent,
    retryDelaysMs,
    timeoutMs,
    minIntervalMs,
    maxRedirects,
    fetchImpl = fetch,
  } = { ...LIVE_DEFAULTS, ...options };
  /** @type {Map<string, number>} */
  const lastByHost = new Map();

  /** @param {string} url */
  async function pace(url) {
    const host = new URL(url).host;
    const wait =
      (lastByHost.get(host) ?? -Infinity) + minIntervalMs - Date.now();
    if (wait > 0) await sleep(wait);
    lastByHost.set(host, Date.now());
  }

  /**
   * One hop, retried on no answer and on 429/5xx.
   * @param {string} url
   * @param {RequestInit} init
   */
  async function once(url, init) {
    let lastError;
    for (let attempt = 0; attempt <= retryDelaysMs.length; attempt += 1) {
      if (attempt > 0) await sleep(retryDelaysMs[attempt - 1]);
      await pace(url);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await fetchImpl(url, {
          ...init,
          headers: { "user-agent": userAgent, ...(init.headers ?? {}) },
          redirect: "manual",
          signal: controller.signal,
        });
        const text = await res.text();
        if (RETRYABLE.has(res.status) && attempt < retryDelaysMs.length) {
          const after = Number(res.headers.get("retry-after"));
          if (Number.isFinite(after) && after > 0)
            await sleep(Math.min(after * 1000, 30_000));
          continue;
        }
        return { res, text };
      } catch (err) {
        lastError = err;
      } finally {
        clearTimeout(timer);
      }
    }
    throw new NetworkError(
      `${init.method ?? "GET"} ${url}: no answer after ${retryDelaysMs.length + 1} attempts: ${reason(lastError)}`,
    );
  }

  /**
   * @param {string} url
   * @param {{ method?: string, headers?: Record<string, string>, body?: string }} [init]
   * @returns {Promise<Answer>}
   */
  async function request(url, init = {}) {
    /** @type {Hop[]} */
    const chain = [];
    let current = url;
    let method = init.method ?? "GET";
    let body = init.body;
    for (let hop = 0; ; hop += 1) {
      const { res, text } = await once(current, {
        method,
        headers: init.headers,
        body,
      });
      chain.push({ url: current, status: res.status });
      const location = res.headers.get("location");
      if (!REDIRECTS.has(res.status) || !location) {
        return {
          status: res.status,
          url: current,
          chain,
          headers: res.headers,
          text,
        };
      }
      if (hop >= maxRedirects) {
        throw new NetworkError(`${url}: more than ${maxRedirects} redirects`);
      }
      current = new URL(location, current).href;
      if (
        res.status === 303 ||
        ((res.status === 301 || res.status === 302) && method === "POST")
      ) {
        method = "GET";
        body = undefined;
      }
    }
  }

  /**
   * A JSON-RPC 2.0 call. Returns the answer and its parsed JSON (or null).
   * @param {string} endpoint
   * @param {string} rpcMethod
   * @param {unknown} params
   */
  async function rpc(endpoint, rpcMethod, params) {
    const answer = await request(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: rpcMethod,
        params,
      }),
    });
    return { answer, json: parseJson(answer.text) };
  }

  return { request, rpc };
}

/** @param {string} text */
export function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
