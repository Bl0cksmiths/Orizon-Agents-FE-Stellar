/**
 * Live samples: execute every `verify="live"` curl against `--api` and compare
 * the real response with the documented one.
 *
 * The curl is translated into a fetch (method, headers, body, query), never run
 * by a shell. Before any sample, the run warms the backend up (Render's free
 * tier sleeps; the first request can take a minute) and REFUSES unless
 * `GET <api>/stellar/network` reports the testnet passphrase — a guide check is
 * never pointed at mainnet.
 *
 * What a live sample may do, enforced here and not left to the guide author:
 *   - GET/HEAD anything; POST only to a build route (unsigned XDR out, nothing
 *     submitted), an availability check, or a challenge mint. Everything else
 *     changes state and is refused.
 *   - send no secret: no X-API-Key / X-Task-Token / Authorization / grant
 *     header, no token/key/secret query parameter, no secret fixture variable,
 *     and no Stellar seed (S...) anywhere in the request.
 * A refused sample FAILS: it is labelled live but cannot be run live, so the
 * label is wrong.
 */
import { SECRET_FIXTURES, TESTNET_PASSPHRASE } from "./fixtures.mjs";
import {
  markerNames,
  parseCurlSample,
  resolveWord,
  ShellParseError,
} from "./shell.mjs";
import { compareJson, formatComparison } from "./wildcard.mjs";

const SECRET_HEADERS =
  /^(x-api-key|x-task-token|authorization|proxy-authorization|x-dispute-read-grant|x-orizon-payment|cookie)$/i;
const SECRET_NAME =
  /secret|private|token|api_?key|password|seed|grant|signature/i;
const STELLAR_SEED = /S[A-Z2-7]{55}/;
const RETRYABLE = new Set([429, 502, 503, 504]);

/**
 * @typedef {{
 *   retryDelaysMs?: number[], warmupBudgetMs?: number, requestTimeoutMs?: number,
 * }} LiveOptions
 */

const DEFAULTS = {
  retryDelaysMs: [2_000, 5_000, 10_000],
  warmupBudgetMs: 120_000,
  requestTimeoutMs: 30_000,
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * One request with a timeout and bounded retries on cold-start answers.
 *
 * @param {string} url
 * @param {RequestInit} init
 * @param {LiveOptions} options
 */
export async function fetchWithRetry(url, init, options = {}) {
  const { retryDelaysMs, requestTimeoutMs } = { ...DEFAULTS, ...options };
  let lastError;
  for (let attempt = 0; attempt <= retryDelaysMs.length; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), requestTimeoutMs);
    try {
      const res = await fetch(url, {
        ...init,
        signal: controller.signal,
        redirect: "follow",
      });
      const text = await res.text();
      if (!RETRYABLE.has(res.status) || attempt === retryDelaysMs.length) {
        return { status: res.status, text, attempts: attempt + 1 };
      }
      const retryAfter = Number(res.headers.get("retry-after"));
      await sleep(
        Number.isFinite(retryAfter) && retryAfter > 0
          ? Math.min(retryAfter * 1000, 30_000)
          : retryDelaysMs[attempt],
      );
    } catch (err) {
      lastError = err;
      if (attempt === retryDelaysMs.length) break;
      await sleep(retryDelaysMs[attempt]);
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error(
    `${init.method ?? "GET"} ${url} failed after ${retryDelaysMs.length + 1} attempts: ${
      lastError instanceof Error ? lastError.message : lastError
    }`,
  );
}

/**
 * Warm the backend up, then require testnet.
 *
 * @param {string} api  the API base, e.g. https://orizons.xyz/api
 * @param {LiveOptions} [options]
 * @returns {Promise<{ ok: true, network: string } | { ok: false, problem: string }>}
 */
export async function preflight(api, options = {}) {
  const { warmupBudgetMs, requestTimeoutMs } = { ...DEFAULTS, ...options };
  const started = Date.now();
  let warmed = false;
  let lastProblem = "";
  while (Date.now() - started < warmupBudgetMs) {
    try {
      const res = await fetchWithRetry(
        `${api}/health`,
        { method: "GET" },
        { ...options, retryDelaysMs: [] },
      );
      if (res.status >= 200 && res.status < 300) {
        warmed = true;
        break;
      }
      lastProblem = `HTTP ${res.status}`;
    } catch (err) {
      lastProblem = err instanceof Error ? err.message : String(err);
    }
    await sleep(Math.min(5_000, Math.max(50, warmupBudgetMs / 20)));
  }
  if (!warmed) {
    return {
      ok: false,
      problem: `${api}/health never answered 2xx within ${warmupBudgetMs} ms (${lastProblem})`,
    };
  }
  let body;
  try {
    const res = await fetchWithRetry(
      `${api}/stellar/network`,
      { method: "GET" },
      { ...options, requestTimeoutMs },
    );
    if (res.status !== 200)
      return {
        ok: false,
        problem: `${api}/stellar/network answered HTTP ${res.status}`,
      };
    body = JSON.parse(res.text);
  } catch (err) {
    return {
      ok: false,
      problem: `cannot read ${api}/stellar/network: ${err instanceof Error ? err.message : err}`,
    };
  }
  if (body?.network_passphrase !== TESTNET_PASSPHRASE) {
    return {
      ok: false,
      problem:
        `refusing to run: ${api}/stellar/network reports network ${JSON.stringify(body?.network)} with passphrase ` +
        `${JSON.stringify(body?.network_passphrase)}, not testnet ("${TESTNET_PASSPHRASE}")`,
    };
  }
  return { ok: true, network: String(body.network) };
}

/**
 * Why this request may not be sent live, or null.
 *
 * @param {{ method: string, url: string, headers: [string, string][], body: string | null }} request  resolved
 * @param {string[]} variables  the names the sample expands
 * @param {string} path  the URL path
 */
export function liveRefusal(request, variables, path) {
  for (const [name] of request.headers) {
    if (SECRET_HEADERS.test(name)) return `it sends ${name}, a credential`;
  }
  for (const name of variables) {
    if (SECRET_FIXTURES.has(name) || SECRET_NAME.test(name))
      return `it expands $${name}, a secret`;
  }
  const query = request.url.includes("?")
    ? request.url.slice(request.url.indexOf("?") + 1)
    : "";
  for (const pair of query.split("&").filter(Boolean)) {
    let name = pair.split("=")[0];
    try {
      name = decodeURIComponent(name);
    } catch {
      // keep the raw name
    }
    if (SECRET_NAME.test(name))
      return `it sends the query parameter ${name}, a credential`;
  }
  const everything = [
    request.url,
    request.body ?? "",
    ...request.headers.map(([, v]) => v),
  ].join("\n");
  if (STELLAR_SEED.test(everything))
    return "it sends what looks like a Stellar secret seed (S...)";
  const method = request.method.toUpperCase();
  if (method === "GET" || method === "HEAD") return null;
  const segments = path.split("/").filter(Boolean);
  const last = segments[segments.length - 1] ?? "";
  const allowed =
    method === "POST" &&
    (segments.includes("build") ||
      last === "challenge" ||
      last.endsWith("-challenge"));
  if (!allowed) {
    return `${method} ${path} changes state; live runs are GET, build, availability and challenge only`;
  }
  return null;
}

/**
 * @param {import("./parse.mjs").Fence} sample
 * @param {{
 *   env: Record<string, string>, api: string, wildcards: Map<string, Set<string>>,
 *   status: string, options?: LiveOptions,
 * }} input
 * @returns {Promise<import("./offline.mjs").RunResult & { extra?: string[] }>}
 */
export async function runLive(
  sample,
  { env, api, wildcards, status, options = {} },
) {
  let request;
  let variables;
  try {
    ({ request } = parseCurlSample(sample.code));
    variables = [
      ...new Set([
        ...markerNames(request.url),
        ...(request.body === null ? [] : markerNames(request.body)),
        ...request.headers.flatMap(([n, v]) => [
          ...markerNames(n),
          ...markerNames(v),
        ]),
      ]),
    ];
    request = {
      ...request,
      url: resolveWord(request.url, env, { strict: true }),
      headers: request.headers.map(([n, v]) => [
        resolveWord(n, env, { strict: true }),
        resolveWord(v, env, { strict: true }),
      ]),
      body:
        request.body === null
          ? null
          : resolveWord(request.body, env, { strict: true }),
    };
  } catch (err) {
    const why = err instanceof ShellParseError ? err.message : String(err);
    return { status: "failed", reason: `cannot run as written: ${why}` };
  }
  if (!request.url.startsWith(api)) {
    return {
      status: "failed",
      reason: `the URL ${request.url} is not under --api ${api}`,
    };
  }
  const path = new URL(request.url).pathname;
  const refusal = liveRefusal(request, variables, path);
  if (refusal !== null)
    return { status: "failed", reason: `refused to run live: ${refusal}` };

  let res;
  try {
    res = await fetchWithRetry(
      request.url,
      {
        method: request.method,
        headers: Object.fromEntries(request.headers),
        body: request.body ?? undefined,
      },
      options,
    );
  } catch (err) {
    return {
      status: "failed",
      reason: err instanceof Error ? err.message : String(err),
    };
  }
  const summary = `${request.method} ${path} → HTTP ${res.status}${res.attempts > 1 ? ` after ${res.attempts} attempts` : ""}`;
  let actual;
  try {
    actual = JSON.parse(res.text);
  } catch {
    return {
      status: "failed",
      reason: `${summary}: the response is not JSON`,
      stdout: res.text.slice(0, 2000),
    };
  }
  const documented = JSON.parse(
    /** @type {import("./parse.mjs").Fence} */ (sample.response).code,
  );
  const comparison = compareJson(documented, actual, wildcards);
  const extra = comparison.extra.map((d) => `${d.path}: ${d.message}`);
  const statusOk = String(res.status) === status;
  if (!statusOk || !comparison.ok) {
    const diff = [
      statusOk ? "" : `! status: documented ${status}, got ${res.status}`,
      formatComparison(comparison),
    ]
      .filter(Boolean)
      .join("\n");
    return {
      status: "failed",
      reason: `${summary}: ${statusOk ? "the response differs from the documented one" : `documented ${status}`}`,
      diff,
      stdout: JSON.stringify(actual, null, 2).slice(0, 4000),
      extra,
    };
  }
  return {
    status: "verified",
    reason: `${summary}; matches ${sample.response?.id}${extra.length ? ` (${extra.length} undocumented)` : ""}`,
    extra,
  };
}
