/**
 * Static lint for samples that are not curls: never executed, only read.
 *
 *   json    parses
 *   env     every line is NAME=value (or a comment)
 *   bash    `bash -n` (syntax only; bash reads, does not run)
 *   python  `ast.parse` (syntax only)
 *   js      `node --check` (syntax only)
 *   text    nothing to check
 *
 * A linter that is not available (no python3 on PATH) is a skip, with the
 * reason, never a pass.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * @param {import("./parse.mjs").Fence} sample
 * @returns {{ status: "verified" | "failed" | "skipped", reason: string }}
 */
export function lintSample(sample) {
  switch (sample.lang) {
    case "json":
      try {
        JSON.parse(sample.code);
        return { status: "verified", reason: "valid JSON" };
      } catch (err) {
        return {
          status: "failed",
          reason: `invalid JSON: ${err instanceof Error ? err.message : err}`,
        };
      }
    case "env": {
      const lines = sample.code.split("\n");
      const bad = lines.findIndex(
        (line) =>
          line.trim() !== "" &&
          !line.trim().startsWith("#") &&
          !/^\s*(export\s+)?[A-Za-z_][A-Za-z0-9_]*=/.test(line),
      );
      return bad === -1
        ? { status: "verified", reason: "every line is NAME=value" }
        : {
            status: "failed",
            reason: `line ${bad + 1} is not NAME=value: ${JSON.stringify(lines[bad])}`,
          };
    }
    case "bash":
      return syntax(["bash", "-n"], sample.code, "bash -n");
    case "python":
      return syntax(
        ["python3", "-c", "import ast, sys; ast.parse(sys.stdin.read())"],
        sample.code,
        "python3 ast.parse",
      );
    case "js":
      return jsSyntax(sample.code);
    case "text":
      return {
        status: "verified",
        reason: "text: nothing executable to check",
      };
    default:
      return { status: "failed", reason: `no lint for ${sample.lang}` };
  }
}

/** @param {string[]} argv @param {string} input @param {string} label */
function syntax(argv, input, label) {
  const run = spawnSync(argv[0], argv.slice(1), {
    input,
    encoding: "utf8",
    timeout: 15_000,
  });
  if (run.error !== undefined) {
    return {
      status: "skipped",
      reason: `not verified: ${label} is unavailable (${run.error.message})`,
    };
  }
  if (run.status !== 0) {
    return {
      status: "failed",
      reason: `${label}: ${(run.stderr || "").trim().split("\n").slice(-2).join(" | ")}`,
    };
  }
  return { status: "verified", reason: `${label} accepts it` };
}

/** @param {string} code */
function jsSyntax(code) {
  const dir = mkdtempSync(join(tmpdir(), "guide-lint-"));
  try {
    const commonjs = /\brequire\(/.test(code) && !/^\s*import\s/m.test(code);
    const file = join(dir, commonjs ? "sample.cjs" : "sample.mjs");
    writeFileSync(file, code);
    const run = spawnSync(process.execPath, ["--check", file], {
      encoding: "utf8",
      timeout: 15_000,
    });
    if (run.status !== 0) {
      return {
        status: "failed",
        reason: `node --check: ${(run.stderr || "").trim().split("\n").slice(0, 5).join(" | ")}`,
      };
    }
    return { status: "verified", reason: "node --check accepts it" };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
