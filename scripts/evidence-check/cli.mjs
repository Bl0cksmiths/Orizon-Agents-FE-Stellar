#!/usr/bin/env node
/**
 * Evidence link verifier for content/evidence/index.json (BLO-39, 5.05).
 *
 * "Every link is verified before submission. A dead link in an evidence pack
 * undermines the ones that work." This is that verification; story 6.04 runs
 * the live mode and keeps its report.
 *
 *   --static (default)  the structural validator (lib/evidence/validate.mjs)
 *                       plus the testnet-only rule on every URL. No network.
 *                       CI runs this through `npm run evidence:check`.
 *   --live              also fetch every link and check every tx, contract and
 *                       account on testnet (see checks.mjs). Testnet only: the
 *                       run is refused if Horizon or RPC serve another network.
 *                       `npm run evidence:verify`.
 *
 *   --index <path>        the index (default content/evidence/index.json)
 *   --report-dir <dir>    where evidence-report.md and .json go
 *                         (default <tmp>/orizon-evidence-report)
 *   --horizon <url>  --rpc <url>  --mainnet-horizon <url>  --oembed <url>
 *                         endpoint overrides (tests use a local fake)
 *   --timeout-ms <n>      per request (default 20000)
 *   --interval-ms <n>     minimum gap between requests to one host (default 750)
 *   --retries <n>         retries on no answer / 429 / 5xx (default 2)
 *
 * Exit: 0 every check passed · 1 anything failed · 2 bad usage, or the run was
 * refused as not testnet · 3 nothing failed but a link could not be checked
 * (unverified, e.g. a network error) — never a pass.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { toJson, toMarkdown } from "./report.mjs";
import { checkEvidence, exitCodeOf } from "./run.mjs";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
export const INDEX_PATH = "content/evidence/index.json";

/** @param {string | undefined} value @param {string} flag @param {number} min */
function integer(value, flag, min) {
  if (value === undefined) return undefined;
  const n = Number(value);
  if (!Number.isInteger(n) || n < min)
    throw new Error(`${flag} must be an integer >= ${min}`);
  return n;
}

/**
 * @param {string[]} argv
 * @param {{ log?: (s: string) => void, error?: (s: string) => void, loadValidator?: import("./run.mjs").RunOptions["loadValidator"] }} [io]
 *   output sinks, and a validator loader for tests
 */
export async function main(argv, io = {}) {
  const log = io.log ?? console.log;
  const error = io.error ?? console.error;
  let args;
  let clientOptions;
  try {
    ({ values: args } = parseArgs({
      args: argv,
      options: {
        static: { type: "boolean", default: false },
        live: { type: "boolean", default: false },
        index: { type: "string" },
        "report-dir": { type: "string" },
        horizon: { type: "string" },
        rpc: { type: "string" },
        "mainnet-horizon": { type: "string" },
        oembed: { type: "string" },
        "timeout-ms": { type: "string" },
        "interval-ms": { type: "string" },
        retries: { type: "string" },
        help: { type: "boolean", default: false },
      },
      strict: true,
      allowPositionals: false,
    }));
    if (args.static && args.live)
      throw new Error("choose one of --static and --live");
    const retries = integer(args.retries, "--retries", 0);
    clientOptions = {
      timeoutMs: integer(args["timeout-ms"], "--timeout-ms", 1),
      minIntervalMs: integer(args["interval-ms"], "--interval-ms", 0),
      retryDelaysMs:
        retries === undefined
          ? undefined
          : Array.from({ length: retries }, (_, i) => 1_000 * 3 ** i),
    };
    for (const key of /** @type {const} */ ([
      "timeoutMs",
      "minIntervalMs",
      "retryDelaysMs",
    ])) {
      if (clientOptions[key] === undefined) delete clientOptions[key];
    }
  } catch (err) {
    error(
      `${err instanceof Error ? err.message : err}\nRun with --help for usage.`,
    );
    return 2;
  }
  if (args.help) {
    log("See the header of scripts/evidence-check/cli.mjs for usage.");
    return 0;
  }

  /** @type {Record<string, string>} */
  const endpoints = {};
  for (const [flag, key] of [
    ["horizon", "horizon"],
    ["rpc", "rpc"],
    ["mainnet-horizon", "mainnetHorizon"],
    ["oembed", "oembed"],
  ]) {
    const value = args[/** @type {"horizon"} */ (flag)];
    if (value !== undefined) endpoints[key] = value.replace(/\/+$/, "");
  }

  const report = await checkEvidence({
    indexPath: resolve(args.index ?? join(repoRoot, INDEX_PATH)),
    mode: args.live ? "live" : "static",
    clientOptions,
    loadValidator: io.loadValidator,
    endpoints,
  });

  const markdown = toMarkdown(report);
  log(markdown);
  const dir = resolve(
    args["report-dir"] ?? join(tmpdir(), "orizon-evidence-report"),
  );
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "evidence-report.md"), markdown);
  writeFileSync(join(dir, "evidence-report.json"), toJson(report));
  log(`report: ${join(dir, "evidence-report.md")} and evidence-report.json`);
  const code = exitCodeOf(report);
  if (code === 3)
    error("some links could not be checked (unverified): exit 3, not a pass");
  return code;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  process.exitCode = await main(process.argv.slice(2));
}
