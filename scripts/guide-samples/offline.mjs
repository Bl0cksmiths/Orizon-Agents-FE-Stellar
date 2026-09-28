/**
 * Offline samples: run each `verify="offline"` snippet in a throwaway directory
 * with the network denied, a timeout, and only the fixture environment.
 *
 * Network denial is layered, as far as the machine allows:
 *   1. `unshare -rn` puts the snippet in a network namespace with no
 *      interfaces, when unprivileged user namespaces are available;
 *   2. always, an in-process guard: Python gets a `sitecustomize` that makes
 *      socket connects and DNS raise, Node gets a preload that does the same to
 *      net/dns/fetch, and bash snippets must be pure (no curl, wget, nc, ...);
 *   3. the proxy variables point at a closed port.
 * The environment is built from scratch: the caller's variables (API keys, a
 * real wallet seed) never reach a snippet.
 *
 * Python needs stellar_sdk, so it runs on the backend's own interpreter:
 * `$ORIZON_BE_VENV/bin/python` (or `$GUIDE_PYTHON`). Without one the sample is
 * SKIPPED with the reason — never passed.
 */
import { spawn, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { compareText } from "./wildcard.mjs";

export const DEFAULT_TIMEOUT_MS = 20_000;
const MAX_OUTPUT = 1_000_000;

const PY_GUARD = `# Written by scripts/guide-samples: the guide sandbox has no network.
import socket as _s

def _deny(*_a, **_k):
    raise OSError("network access is disabled in the guide sandbox")

_s.socket.connect = _deny
_s.socket.connect_ex = _deny
_s.create_connection = _deny
_s.getaddrinfo = _deny
`;

const NODE_GUARD = `// Written by scripts/guide-samples: the guide sandbox has no network.
import net from "node:net";
import dns from "node:dns";
const deny = () => {
  throw new Error("network access is disabled in the guide sandbox");
};
net.Socket.prototype.connect = deny;
net.connect = deny;
net.createConnection = deny;
dns.lookup = deny;
dns.promises.lookup = deny;
globalThis.fetch = async () => deny();
`;

/** Commands that reach the network; a pure bash sample uses none. */
const NETWORK_COMMANDS =
  /(^|[\s;|&(`$])(curl|wget|nc|ncat|netcat|telnet|ssh|scp|sftp|rsync|ftp|git|npm|npx|pip|pip3|dig|nslookup|ping)(\s|$)|\/dev\/(tcp|udp)\//m;

let unshareProbe;
/** Whether `unshare -rn` works here. Probed once. */
export function hasUnshare() {
  if (unshareProbe === undefined) {
    const probe = spawnSync("unshare", ["-rn", "true"], {
      stdio: "ignore",
      timeout: 5000,
    });
    unshareProbe = probe.status === 0;
  }
  return unshareProbe;
}

/**
 * The Python to run snippets with, or why there is none.
 *
 * @param {Record<string, string | undefined>} hostEnv
 * @returns {{ python: string } | { skip: string }}
 */
export function resolvePython(hostEnv = process.env) {
  const explicit = hostEnv.GUIDE_PYTHON;
  const venv = hostEnv.ORIZON_BE_VENV;
  const python = explicit || (venv ? join(venv, "bin", "python") : undefined);
  if (python === undefined) {
    return {
      skip: "no Python with stellar_sdk configured: set ORIZON_BE_VENV to the backend's .venv (or GUIDE_PYTHON)",
    };
  }
  if (!existsSync(python))
    return { skip: `the configured Python ${python} does not exist` };
  const probe = spawnSync(python, ["-c", "import stellar_sdk"], {
    stdio: "ignore",
    timeout: 30_000,
  });
  if (probe.status !== 0)
    return { skip: `${python} cannot import stellar_sdk` };
  return { python };
}

/**
 * @typedef {{
 *   status: "verified" | "failed" | "skipped", reason: string,
 *   exitCode?: number | null, stdout?: string, stderr?: string, diff?: string, sandbox?: string,
 * }} RunResult
 */

/**
 * @param {import("./parse.mjs").Fence} sample
 * @param {{
 *   env: Record<string, string>, repoRoot: string, timeoutMs?: number,
 *   python?: { python: string } | { skip: string }, useUnshare?: boolean,
 * }} options
 * @returns {Promise<RunResult>}
 */
export async function runOffline(sample, options) {
  const { env, repoRoot, timeoutMs = DEFAULT_TIMEOUT_MS } = options;
  const useUnshare = options.useUnshare ?? hasUnshare();

  if (sample.lang === "bash") {
    const hit = NETWORK_COMMANDS.exec(sample.code);
    if (hit !== null) {
      return {
        status: "failed",
        reason: `not a pure bash sample: it runs ${hit[2] ?? hit[0].trim()}, which needs the network`,
      };
    }
  }

  let interpreter;
  if (sample.lang === "python") {
    const python = options.python ?? resolvePython();
    if ("skip" in python)
      return { status: "skipped", reason: `not verified: ${python.skip}` };
    interpreter = python.python;
  }

  const dir = mkdtempSync(join(tmpdir(), "guide-offline-"));
  try {
    /** @type {string[]} */
    let argv;
    if (sample.lang === "python") {
      writeFileSync(join(dir, "sitecustomize.py"), PY_GUARD);
      writeFileSync(join(dir, "sample.py"), sample.code);
      argv = [/** @type {string} */ (interpreter), "sample.py"];
    } else if (sample.lang === "js") {
      writeFileSync(join(dir, "deny-net.mjs"), NODE_GUARD);
      const commonjs =
        /\brequire\(/.test(sample.code) && !/^\s*import\s/m.test(sample.code);
      const file = commonjs ? "sample.cjs" : "sample.mjs";
      writeFileSync(join(dir, file), sample.code);
      const modules = join(repoRoot, "node_modules");
      if (existsSync(modules))
        symlinkSync(modules, join(dir, "node_modules"), "dir");
      argv = [process.execPath, "--import", "./deny-net.mjs", file];
    } else if (sample.lang === "bash") {
      writeFileSync(join(dir, "sample.sh"), sample.code);
      argv = ["bash", "--noprofile", "--norc", "-e", "sample.sh"];
    } else {
      return {
        status: "failed",
        reason: `a ${sample.lang} fence cannot run offline`,
      };
    }
    if (useUnshare) argv = ["unshare", "-rn", ...argv];

    const childEnv = {
      PATH: process.env.PATH ?? "/usr/bin:/bin",
      HOME: dir,
      LANG: "C.UTF-8",
      PYTHONPATH: dir,
      PYTHONDONTWRITEBYTECODE: "1",
      HTTP_PROXY: "http://127.0.0.1:9",
      HTTPS_PROXY: "http://127.0.0.1:9",
      http_proxy: "http://127.0.0.1:9",
      https_proxy: "http://127.0.0.1:9",
      NO_COLOR: "1",
      ...env,
    };
    const sandbox = `${useUnshare ? "unshare -rn + " : ""}in-process network guard`;
    const run = await spawnWithTimeout(argv, {
      cwd: dir,
      env: childEnv,
      timeoutMs,
    });
    const base = {
      exitCode: run.code,
      stdout: run.stdout,
      stderr: run.stderr,
      sandbox,
    };
    if (run.timedOut) {
      return {
        ...base,
        status: "failed",
        reason: `timed out after ${timeoutMs} ms`,
      };
    }
    if (run.code !== 0) {
      const tail = run.stderr.trim().split("\n").slice(-3).join(" | ");
      return {
        ...base,
        status: "failed",
        reason: `exited ${run.code}${tail ? `: ${tail}` : ""}`,
      };
    }
    if (sample.output !== undefined) {
      const { ok, diff } = compareText(sample.output.code, run.stdout);
      if (!ok) {
        return {
          ...base,
          diff,
          status: "failed",
          reason: `stdout differs from ${sample.output.id}`,
        };
      }
      return {
        ...base,
        status: "verified",
        reason: `exited 0; stdout matches ${sample.output.id}`,
      };
    }
    return { ...base, status: "verified", reason: "exited 0" };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * @param {string[]} argv
 * @param {{ cwd: string, env: Record<string, string>, timeoutMs: number }} options
 * @returns {Promise<{ code: number | null, stdout: string, stderr: string, timedOut: boolean }>}
 */
function spawnWithTimeout(argv, { cwd, env, timeoutMs }) {
  return new Promise((resolve) => {
    const child = spawn(argv[0], argv.slice(1), {
      cwd,
      env,
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    child.stdout.on("data", (chunk) => {
      if (stdout.length < MAX_OUTPUT) stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      if (stderr.length < MAX_OUTPUT) stderr += chunk;
    });
    const timer = setTimeout(() => {
      timedOut = true;
      try {
        process.kill(-(/** @type {number} */ (child.pid)), "SIGKILL");
      } catch {
        child.kill("SIGKILL");
      }
    }, timeoutMs);
    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({
        code: 127,
        stdout,
        stderr: `${stderr}${err.message}`,
        timedOut,
      });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr, timedOut });
    });
  });
}
