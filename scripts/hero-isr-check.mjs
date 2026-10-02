#!/usr/bin/env node
/**
 * The hero's figures under real ISR: a production build served by
 * `next start`, reading a fake backend (e2e/stats-backend.mjs) that answers
 * complete, then mid-refill, then not at all, then complete again.
 *
 * What it proves, against Next's own regeneration rather than a model of it:
 *   - a regeneration that reads a partial or missing registry throws, and
 *     Next keeps serving the last page — the hero keeps its complete figures
 *     and the partial count never reaches a response;
 *   - a later regeneration with complete figures replaces them;
 *   - with --cold, a build whose backend never answers waits out its retry
 *     budget, renders the hero without the row, and the first complete
 *     regeneration adds it.
 *
 * It waits out the page's real 300s revalidate window three times, so a
 * run takes about 18 minutes, 21 with --cold. Not part of `npm test`; run it
 * when the ISR path changes:
 *
 *   npm run hero:isr            # stale-on-error
 *   npm run hero:isr -- --cold  # the cold-build edge as well
 *
 * HERO_ISR_PORT (3741) and HERO_ISR_BACKEND_PORT (3742) pick the ports.
 */
import { spawn } from "node:child_process";
import { createWriteStream, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { startStatsBackend } from "../e2e/stats-backend.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const PORT = Number(process.env.HERO_ISR_PORT ?? 3741);
const BACKEND_PORT = Number(process.env.HERO_ISR_BACKEND_PORT ?? 3742);
const DIST = ".next/hero-isr";
const NEXT = "node_modules/next/dist/bin/next";
const REVALIDATE_MS = 300_000;
const COLD = process.argv.includes("--cold");

const A = { registered: 278, external: 253, wallets: 248 };
const B = { registered: 280, external: 255, wallets: 249 };
const PARTIAL = { registered: 31, external: 20, wallets: 20 };

const env = {
  ...process.env,
  E2E_DIST_DIR: DIST,
  NEXT_PUBLIC_API_BASE: `http://127.0.0.1:${BACKEND_PORT}`,
  NEXT_TELEMETRY_DISABLED: "1",
};

const t0 = Date.now();
const stamp = () => `[${((Date.now() - t0) / 1000).toFixed(0).padStart(4)}s]`;
const log = (...a) => console.log(stamp(), ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const failures = [];
const fail = (msg) => {
  failures.push(msg);
  log(`FAIL ${msg}`);
};

/** Runs to completion, teeing output to `file`. */
function run(cmd, args, file) {
  return new Promise((resolve, reject) => {
    const out = createWriteStream(file);
    const p = spawn(cmd, args, { cwd: root, env });
    p.stdout.pipe(out);
    p.stderr.pipe(out);
    p.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`)),
    );
  });
}

/** The hero row as label → figure, null when absent, and whether the
 * partial count appears anywhere a figure could. */
async function hero() {
  const res = await fetch(`http://127.0.0.1:${PORT}/`);
  const html = await res.text();
  const at = html.indexOf("data-hero-stats");
  let row = null;
  if (at !== -1) {
    row = {};
    const seg = html.slice(at, html.indexOf("</dl>", at));
    for (const m of seg.matchAll(
      /<dt[^>]*>([^<]+)<\/dt><dd[^>]*>([^<]+)<\/dd>/g,
    )) {
      row[m[1]] = m[2];
    }
  }
  const leaked = /"registered":31\b/.test(html);
  return { row, cache: res.headers.get("x-nextjs-cache"), leaked };
}

const show = (r) =>
  r.row
    ? `${r.row["Registered agents"]}/${r.row["External agents"]}/${r.row["Operator wallets"]}`
    : "no row";
const asRow = (s) => `${s.registered}/${s.external}/${s.wallets}`;

async function expectRow(want, label) {
  const r = await hero();
  log(`${label}: ${show(r)} (x-nextjs-cache: ${r.cache})`);
  if (r.leaked) fail(`${label}: the partial count is in the page`);
  if (want === null ? r.row !== null : show(r) !== asRow(want)) {
    fail(`${label}: wanted ${want ? asRow(want) : "no row"}, got ${show(r)}`);
  }
  return r;
}

/** Whether something already answers on `port`. */
const taken = (port) =>
  fetch(`http://127.0.0.1:${port}/`).then(
    () => true,
    () => false,
  );

async function main() {
  for (const port of [PORT, BACKEND_PORT]) {
    if (await taken(port)) {
      throw new Error(`port ${port} is in use; stop what holds it first`);
    }
  }
  const backend = await startStatsBackend(BACKEND_PORT);
  const set = (s) => Object.assign(backend.state, s);
  rmSync(`${root}/${DIST}`, { recursive: true, force: true });

  // ── build ──
  if (COLD) set({ down: true });
  else set({ ...A, signal: "none", synced: true, down: false });
  log(`building against a ${COLD ? "dead" : "complete, signal-less"} backend…`);
  const buildLog = join(tmpdir(), "hero-isr-build.log");
  await run(
    "node",
    ["scripts/litepaper-assets.mjs"],
    join(tmpdir(), "hero-isr-assets.log"),
  );
  await run("node", [NEXT, "build"], buildLog);
  const builtAt = Date.now();
  const built = readFileSync(buildLog, "utf8");
  const manifest = JSON.parse(
    readFileSync(`${root}/${DIST}/prerender-manifest.json`, "utf8"),
  );
  const home = manifest.routes["/"];
  log(
    `build done; / prerendered, revalidate ${home?.initialRevalidateSeconds}s`,
  );
  if (home?.initialRevalidateSeconds !== REVALIDATE_MS / 1000) {
    fail("/ is not prerendered with a 300s revalidate");
  }
  if (COLD && !/no complete network figures after 120s/.test(built)) {
    fail("the cold build did not log its give-up");
  }

  // ── serve ──
  const serverLog = join(tmpdir(), "hero-isr-server.log");
  const out = createWriteStream(serverLog);
  // Next's own binary, not npx: killing an npx wrapper leaves the server it
  // started holding the port, and the next run then reads the old server.
  const server = spawn("node", [NEXT, "start", "-p", String(PORT)], {
    cwd: root,
    env: { ...env, NODE_ENV: "production" },
  });
  server.stdout.pipe(out);
  server.stderr.pipe(out);
  for (let i = 0; i < 60; i++) {
    try {
      await fetch(`http://127.0.0.1:${PORT}/`);
      break;
    } catch {
      await sleep(1000);
    }
  }

  try {
    await expectRow(COLD ? null : A, "fresh from the build");

    // ── mid-refill: the regeneration must throw and keep the last page ──
    set({ ...PARTIAL, signal: "overview", synced: false, down: false });
    log("backend now mid-refill (31 agents, registry_synced: false)");
    await sleep(Math.max(0, builtAt + REVALIDATE_MS + 5_000 - Date.now()));
    await expectRow(COLD ? null : A, "first request past the window (stale)");
    const failedAt = Date.now();
    await sleep(8_000);
    await expectRow(COLD ? null : A, "after the failed regeneration");

    // Next 14.2 re-dates the kept page when a regeneration fails, so the
    // next attempt comes a whole window later (measured: ~300s, not the 30s
    // its response cache asks for). Wait it out, so the next request
    // regenerates against a backend that is not there at all.
    set({ down: true });
    log("backend now down (503)");
    await sleep(Math.max(0, failedAt + REVALIDATE_MS + 5_000 - Date.now()));
    await expectRow(COLD ? null : A, "backend down");
    await sleep(8_000);
    await expectRow(COLD ? null : A, "after a regeneration against it");

    // ── complete again: a regeneration may now replace the page ──
    set({ ...B, signal: "overview", synced: true, down: false });
    log("backend complete again (280/255/249, registry_synced: true)");
    const until = Date.now() + REVALIDATE_MS + 60_000;
    let last = null;
    while (Date.now() < until) {
      last = await hero();
      if (last.leaked) fail("the partial count reached a page");
      const s = show(last);
      if (s === asRow(B)) break;
      if (s !== (COLD ? "no row" : asRow(A))) fail(`unexpected hero ${s}`);
      await sleep(10_000);
    }
    log(`settled on ${show(last)} (x-nextjs-cache: ${last.cache})`);
    if (show(last) !== asRow(B))
      fail("the complete figures never replaced the page");
  } finally {
    server.kill();
    await new Promise((r) => server.once("exit", r));
    await backend.close();
  }

  const serverOut = readFileSync(serverLog, "utf8");
  const thrown = serverOut.match(/hero stats incomplete[^\n]*/g) ?? [];
  log(`regenerations that threw: ${thrown.length}`);
  for (const t of new Set(thrown)) log(`  ${t.slice(0, 160)}`);
  if (thrown.length === 0)
    fail("no regeneration threw — the partial phase never ran");
  log(`backend reads: ${JSON.stringify(backend.reads)}`);
  log("read timeline (seconds from start):");
  for (const r of backend.timeline) {
    log(
      `  ${((r.at - t0) / 1000).toFixed(0).padStart(4)}s ${r.path} → ${r.answer}`,
    );
  }
  log(failures.length ? `${failures.length} FAILED` : "PASSED");
  process.exit(failures.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
