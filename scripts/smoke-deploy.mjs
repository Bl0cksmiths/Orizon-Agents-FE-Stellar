#!/usr/bin/env node
/**
 * Post-deploy smoke test against a *deployed* origin.
 *
 * This exists because of a real outage: a stale `NEXT_PUBLIC_API_BASE` made the
 * Next.js rewrite target `//api/...`, so every backend call from the production
 * console 404'd. Nothing caught it — unit tests pass, the build is green, the
 * marketing pages render fine, and the backend answered its own health check
 * happily when probed directly. The only way to see it is to call the API
 * *through the deployed frontend*, which is exactly what this does.
 *
 * It also checks that production is on the contracts it should be: every
 * contract id `/api/stellar/network` reports is compared with the contract
 * repo's address book for the network it reports (see checkContractParity).
 * That needs a checkout of Bl0cksmiths/Orizon-Agents-Smart-Contract-Stellar —
 * smoke.yml makes one in .canonical-contracts/ — and a run without one FAILS,
 * because a parity check that skips itself is a parity check nobody has.
 *
 * Usage:
 *   node scripts/smoke-deploy.mjs [origin]
 *   SMOKE_ORIGIN=https://orizons.xyz npm run smoke
 *   ORIZON_CONTRACTS_DIR=/path/to/contract-repo npm run smoke   # local clone
 *
 * The backend sleeps on Render's free tier, so the first request may take up to
 * a minute; the warmup below absorbs that before any assertion runs.
 */
import {
  canonicalNetwork,
  compareLiveContracts,
  loadAddressBook,
  resolveContractsDir,
} from "./live-contract-parity.mjs";

const ORIGIN = (
  process.argv[2] ||
  process.env.SMOKE_ORIGIN ||
  "https://orizons.xyz"
).replace(/\/+$/, "");

const WARMUP_TIMEOUT_MS = 90_000;
const CHECK_TIMEOUT_MS = 30_000;

/** Reports the live network and its contract ids; see checkContractParity. */
const NETWORK_PATH = "/api/stellar/network";

/** @type {{path: string, expect: (body: unknown) => string | null}[]} */
const CHECKS = [
  {
    // Cheapest possible proof that the proxy reaches a live backend. If this
    // 404s while the origin serves HTML fine, the rewrite target is wrong.
    path: "/api/health",
    expect: (body) =>
      body?.status === "ok"
        ? null
        : `expected status "ok", got ${body?.status}`,
  },
  {
    path: "/api/agents",
    expect: (body) => {
      if (!Array.isArray(body)) return "expected an array";
      if (body.length === 0) return "expected at least one agent";
      const bad = body.find(
        (a) => typeof a?.id !== "string" || typeof a?.price !== "number",
      );
      return bad ? `agent missing id/price: ${JSON.stringify(bad)}` : null;
    },
  },
  {
    path: "/api/flow/default",
    expect: (body) =>
      Array.isArray(body?.nodes) && body.nodes.length > 0
        ? null
        : "expected a non-empty nodes array",
  },
  {
    path: "/api/metrics/overview",
    expect: (body) =>
      typeof body?.agents_online === "number" && Array.isArray(body?.throughput)
        ? null
        : "expected agents_online + throughput",
  },
  {
    path: NETWORK_PATH,
    expect: (body) => {
      if (typeof body?.network_passphrase !== "string")
        return "expected network_passphrase";
      const want = process.env.SMOKE_EXPECT_NETWORK;
      if (want && body.network !== want)
        return `expected network ${want}, got ${body.network}`;
      return null;
    },
  },
  {
    path: "/api/tasks",
    expect: (body) => (Array.isArray(body) ? null : "expected an array"),
  },
];

/**
 * @param {string} path
 * @param {number} timeoutMs
 */
async function fetchJson(path, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();
  try {
    const res = await fetch(`${ORIGIN}${path}`, {
      signal: controller.signal,
      headers: { accept: "application/json" },
    });
    const text = await res.text();
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      body = undefined;
    }
    return { res, body, text, ms: Date.now() - started };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Every contract id the deployed backend reports, against the contract repo's
 * address book for the network it reports (live-contract-parity.mjs has the
 * rules). The backend's network and ids live in the Render dashboard, not in
 * any repository, so this is the only check that reads what production
 * actually uses.
 *
 * Takes the body the network check already fetched instead of fetching its
 * own: the backend is asked once, and both verdicts describe one response.
 * Throws when the address book cannot be read — the caller reports that as a
 * failure, never as a pass.
 *
 * `compared` is false when no comparison ran, so a failure caused by a missing
 * response or checkout is not dressed up as the two sides disagreeing.
 *
 * @param {unknown} live  the NETWORK_PATH body; undefined if none arrived
 * @returns {{ compared: boolean, summary: string, rows: import("./live-contract-parity.mjs").ParityRow[], problems: string[] }}
 */
function checkContractParity(live) {
  if (live === undefined) {
    return {
      compared: false,
      summary: "nothing to compare",
      rows: [],
      problems: [`${NETWORK_PATH} returned no JSON body; see its check above`],
    };
  }

  // An unknown network has no address book to load. It is still handed to the
  // comparison, which turns it into a failure like any other mismatch.
  const network = canonicalNetwork(/** @type {any} */ (live)?.network);
  const source =
    network === null
      ? undefined
      : loadAddressBook(network, resolveContractsDir());
  const { rows, problems } = compareLiveContracts(live, source?.book);

  const against = source?.path ?? "no address book";
  const summary =
    problems.length === 0
      ? `${rows.length} live contract ids match ${against}`
      : `${problems.length} ${problems.length === 1 ? "problem" : "problems"} against ${against}`;
  return { compared: true, summary, rows, problems };
}

async function main() {
  console.log(`smoke: ${ORIGIN}`);

  // Absorb a cold start before timing anything, and fail fast if the origin
  // itself is unreachable.
  try {
    const { res, ms } = await fetchJson("/api/health", WARMUP_TIMEOUT_MS);
    console.log(`  warmup /api/health → ${res.status} in ${ms}ms`);
  } catch (err) {
    console.error(
      `  warmup failed: ${err instanceof Error ? err.message : err}`,
    );
    process.exitCode = 1;
    return;
  }

  const failures = [];
  /** Parsed bodies of the checks that answered 2xx, for the parity step. */
  const bodies = new Map();
  for (const check of CHECKS) {
    try {
      const { res, body, text, ms } = await fetchJson(
        check.path,
        CHECK_TIMEOUT_MS,
      );
      if (!res.ok) {
        failures.push(
          `${check.path} → HTTP ${res.status}: ${text.slice(0, 200)}`,
        );
        console.log(`  ✗ ${check.path} → ${res.status} (${ms}ms)`);
        continue;
      }
      bodies.set(check.path, body);
      const problem = check.expect(body);
      if (problem) {
        failures.push(`${check.path} → ${problem}`);
        console.log(`  ✗ ${check.path} → ${problem} (${ms}ms)`);
        continue;
      }
      console.log(`  ✓ ${check.path} → ${res.status} (${ms}ms)`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      failures.push(`${check.path} → ${msg}`);
      console.log(`  ✗ ${check.path} → ${msg}`);
    }
  }

  // Counted before parity adds its own, so the proxy hint below is only
  // printed when a proxied request actually failed.
  const requestFailures = failures.length;

  // Runs after the loop rather than as one of CHECKS: it fetches nothing of
  // its own, and still runs when the network check failed on an unexpected
  // network, so a mismatch is reported against the book for the network the
  // backend is actually on.
  let parity;
  try {
    parity = checkContractParity(bodies.get(NETWORK_PATH));
  } catch (err) {
    parity = {
      compared: false,
      summary: "address book unavailable",
      rows: [],
      problems: [err instanceof Error ? err.message : String(err)],
    };
  }
  const parityOk = parity.problems.length === 0;
  console.log(`  ${parityOk ? "✓" : "✗"} contract parity → ${parity.summary}`);
  for (const row of parity.rows) {
    if (row.ok) console.log(`      ok  ${row.name}  ${row.canonical}`);
  }
  for (const problem of parity.problems) {
    console.log(`    FAIL  ${problem.split("\n")[0]}`);
  }
  if (!parityOk) {
    failures.push(
      `contract parity → ${parity.summary}:\n` +
        parity.problems
          .map((problem) => problem.replace(/^/gm, "      "))
          .join("\n"),
    );
  }

  const total = CHECKS.length + 1;
  if (failures.length > 0) {
    console.error(
      `\n${failures.length}/${total} checks failed against ${ORIGIN}:`,
    );
    for (const f of failures) console.error(`  - ${f}`);
    if (requestFailures > 0) {
      console.error(
        "\nIf every /api/* check failed with 404, the proxy target is wrong:" +
          "\ncheck NEXT_PUBLIC_API_BASE — it must be a bare origin with no trailing" +
          "\nslash and no /api suffix (see lib/api-base.mjs).",
      );
    }
    if (!parityOk && parity.compared) {
      console.error(
        "\nA contract parity failure means production and the deploy scripts" +
          "\ndisagree. The live ids come from the backend's environment in the" +
          "\nRender dashboard (which overrides its render.yaml); the canonical ones" +
          "\nfrom addresses*.json in Bl0cksmiths/Orizon-Agents-Smart-Contract-Stellar." +
          "\nFix whichever side is stale — never the check.",
      );
    }
    process.exitCode = 1;
    return;
  }

  console.log(`\nall ${total} checks passed against ${ORIGIN}`);
}

await main();
