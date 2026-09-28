#!/usr/bin/env node
/**
 * Guide sample verifier for content/guides/list-your-agent.md (BLO-37).
 *
 * The guide promises that every code sample is copy-paste runnable and has
 * been run, and that it is versioned with the API. This proves both and fails
 * on drift.
 *
 *   --static (default)   parse the dialect, check every curl, body and
 *                        documented response against the committed OpenAPI
 *                        snapshot, lint the rest. No network. CI runs this.
 *   --live [--api URL]   also execute every verify="live" curl against URL
 *                        (default $ORIZON_API, else https://orizons.xyz/api),
 *                        testnet only, and compare with the documented response.
 *   --offline            also run every verify="offline" snippet in a
 *                        network-denied sandbox. Python needs ORIZON_BE_VENV.
 *
 *   --refresh-openapi <url|file> --backend-sha <sha> [--backend-ref <ref>]
 *                        rewrite content/guides/openapi.snapshot.json
 *   --diff-openapi <url|file>
 *                        exit 1 if a backend's OpenAPI differs from the snapshot
 *
 *   --guide <path>  --snapshot <path>  --report-dir <dir>  --timeout-ms <n>
 *
 * Exit: 0 when nothing failed (skips are reported, never counted as verified),
 * 1 on any failure, 2 on a usage error.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { GUIDE_PATH } from "./parse.mjs";
import { toJson, toMarkdown } from "./report.mjs";
import { checkGuide, reportFailed } from "./run.mjs";
import {
  diffOpenApi,
  loadSnapshot,
  readOpenApi,
  refreshSnapshot,
  SNAPSHOT_PATH,
} from "./snapshot.mjs";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));

/** @param {string[]} argv */
export async function main(argv) {
  let args;
  try {
    ({ values: args } = parseArgs({
      args: argv,
      options: {
        static: { type: "boolean", default: false },
        live: { type: "boolean", default: false },
        offline: { type: "boolean", default: false },
        api: { type: "string" },
        guide: { type: "string" },
        snapshot: { type: "string" },
        "report-dir": { type: "string" },
        "timeout-ms": { type: "string" },
        "refresh-openapi": { type: "string" },
        "backend-sha": { type: "string" },
        "backend-ref": { type: "string" },
        "diff-openapi": { type: "string" },
        help: { type: "boolean", default: false },
      },
      strict: true,
      allowPositionals: false,
    }));
  } catch (err) {
    console.error(
      `${err instanceof Error ? err.message : err}\nRun with --help for usage.`,
    );
    return 2;
  }
  if (args.help) {
    console.log("See the header of scripts/guide-samples/cli.mjs for usage.");
    return 0;
  }
  const snapshotPath = resolve(args.snapshot ?? join(repoRoot, SNAPSHOT_PATH));

  if (args["refresh-openapi"] !== undefined) {
    try {
      const { meta, operations } = await refreshSnapshot({
        source: args["refresh-openapi"],
        sha: /** @type {string} */ (args["backend-sha"]),
        ref: args["backend-ref"],
        path: snapshotPath,
        root: repoRoot,
      });
      console.log(
        `wrote ${snapshotPath}: ${operations} operations, backend ${meta.backend_sha}`,
      );
      console.log(
        "Update the guide's api_verified_against once it is re-verified against this backend.",
      );
      return 0;
    } catch (err) {
      console.error(err instanceof Error ? err.message : err);
      return 1;
    }
  }

  if (args["diff-openapi"] !== undefined) {
    try {
      const { doc, meta } = loadSnapshot(snapshotPath);
      const changes = diffOpenApi(doc, await readOpenApi(args["diff-openapi"]));
      if (changes.length === 0) {
        console.log(
          `the snapshot (backend ${meta.backend_sha}) matches ${args["diff-openapi"]}`,
        );
        return 0;
      }
      console.error(
        `the snapshot (backend ${meta.backend_sha}) differs from ${args["diff-openapi"]}:`,
      );
      for (const c of changes) console.error(`  - ${c}`);
      console.error(
        "Refresh it with --refresh-openapi and re-verify the guide.",
      );
      return 1;
    } catch (err) {
      console.error(err instanceof Error ? err.message : err);
      return 1;
    }
  }

  let timeoutMs;
  if (args["timeout-ms"] !== undefined) {
    timeoutMs = Number(args["timeout-ms"]);
    if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) {
      console.error("--timeout-ms must be a positive integer");
      return 2;
    }
  }
  const api = args.live
    ? (args.api ?? process.env.ORIZON_API ?? "https://orizons.xyz/api").replace(
        /\/+$/,
        "",
      )
    : undefined;

  const report = await checkGuide({
    guidePath: resolve(args.guide ?? join(repoRoot, GUIDE_PATH)),
    snapshotPath,
    repoRoot,
    live: args.live,
    offline: args.offline,
    api,
    timeoutMs,
  });

  const markdown = toMarkdown(report);
  console.log(markdown);
  const dir = resolve(
    args["report-dir"] ?? join(tmpdir(), "orizon-guide-report"),
  );
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "guide-report.md"), markdown);
  writeFileSync(join(dir, "guide-report.json"), toJson(report));
  console.log(`report: ${join(dir, "guide-report.md")} and guide-report.json`);
  return reportFailed(report) ? 1 : 0;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  process.exitCode = await main(process.argv.slice(2));
}
