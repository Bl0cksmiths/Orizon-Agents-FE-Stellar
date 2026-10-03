// Capture the screenshots for the Week-4 "Technical Documentation & Demo
// Evidence" PDF. Run from the frontend repo root:
//   node Week-4-Tranche-Submission/technical-documentation/capture.mjs
// Recapture only some shots by passing filename prefixes:
//   node Week-4-Tranche-Submission/technical-documentation/capture.mjs c1 d
//
// Adapted from Week-3-Tranche-Submission/technical-documentation/capture.mjs.
// Read-only: nothing here connects a wallet, signs, authorizes, simulates,
// pays or submits a form. Every request is a GET.
//
// These are the close-up frames only — sections of design documents and the
// live API's responses at 2x. The document also places the full-page frames
// in ../screenshots/ (captured by ../screenshots/capture-screenshots.mjs),
// which it reads from there rather than copying.
//
// Every shot is either a clip of one region of a page, taken with a viewport
// tall enough that the page never scrolls, or an element screenshot (`el`),
// which Playwright scrolls into view — used for the pages that are tens of
// thousands of pixels long. Either way the region, the marks and the PNG
// share one coordinate system. The region's size and the marks (rectangles
// the PDF outlines and numbers, relative to the PNG) are written to
// shots.json; the PNGs themselves are never drawn on.
import { chromium } from "playwright";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const OUT = dirname(fileURLToPath(import.meta.url));
const MANIFEST = join(OUT, "shots.json");
const BE = "https://orizon-agents-be-stellar.onrender.com";
const GH = "https://github.com/Bl0cksmiths";
const BE_BLOB = (p) => `${GH}/Orizon-Agents-BE-Stellar/blob/main/${p}`;
const UAT_BLOB = (p) => `${GH}/Orizon-Agents-UAT-Stellar/blob/main/${p}`;
const EXPERT = "https://stellar.expert/explorer/testnet";

// Text that means the capture is of an error or a wall, not the feature.
const FAILURE_TEXT = [
  "Application error",
  "This page could not be found",
  "Internal Server Error",
  "Bad Gateway",
  "Service Unavailable",
  "Something went wrong",
  "Too many requests",
];

// ------------------------------------------------------------- geometry ---

async function rectOf(locator, what) {
  const first = locator.first();
  await first.waitFor({ state: "visible", timeout: 20000 });
  const b = await first.boundingBox();
  if (!b) throw new Error(`no box for ${what}`);
  return b;
}

const pad = (r, p) => ({
  x: r.x - p,
  y: r.y - p,
  width: r.width + 2 * p,
  height: r.height + 2 * p,
});

function union(...rects) {
  const x = Math.min(...rects.map((r) => r.x));
  const y = Math.min(...rects.map((r) => r.y));
  const right = Math.max(...rects.map((r) => r.x + r.width));
  const bottom = Math.max(...rects.map((r) => r.y + r.height));
  return { x, y, width: right - x, height: bottom - y };
}

// Whole pixels, inside the page: a fractional clip gives a blurred PNG.
function snap(r) {
  const x = Math.max(0, Math.floor(r.x));
  const y = Math.max(0, Math.floor(r.y));
  return {
    x,
    y,
    width: Math.ceil(r.x + r.width) - x,
    height: Math.ceil(r.y + r.height) - y,
  };
}

const relativeTo = (m, region) => ({
  x: +(m.x - region.x).toFixed(1),
  y: +(m.y - region.y).toFixed(1),
  width: +m.width.toFixed(1),
  height: +m.height.toFixed(1),
});

// --------------------------------------------------------- GitHub blobs ---

// A markdown section of a GitHub blob page, from one heading to the next:
// the nodes between them are wrapped in a div so the shot can be an element
// screenshot, which Playwright scrolls into view. Documents here run to tens
// of thousands of pixels, so a viewport-clip capture cannot reach them.
// `maxH` caps the wrapper's height (overflow hidden), so a long section is
// shown from its heading down rather than shrunk to illegibility in the PDF.
function wrapSection(from, to, maxH) {
  return async (page) => {
    const n = await page.evaluate(
      ({ from, to, maxH }) => {
        const art = document.querySelector("article.markdown-body");
        if (!art) return -1;
        const kids = [...art.children];
        const norm = (s) => s.replace(/\s+/g, " ").trim().toLowerCase();
        // GitHub's blob view wraps each heading in <div class="markdown-heading">
        // around the real <h1>-<h6>, so a child that IS a heading and a child
        // that CONTAINS one both count, and the level comes from the inner tag.
        const headingOf = (e) =>
          /^h[1-6]$/i.test(e.tagName)
            ? e
            : e.querySelector(
                ":scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > h5, :scope > h6",
              );
        const level = (e) => {
          const h = headingOf(e);
          return h ? +h.tagName[1] : 0;
        };
        const isHeading = (e, text) => {
          const h = headingOf(e);
          return (
            !!h &&
            (text === undefined || norm(h.textContent).includes(norm(text)))
          );
        };
        const start = kids.findIndex((e) => isHeading(e, from));
        if (start < 0) return -2;
        let end = kids.length;
        for (let i = start + 1; i < kids.length; i++) {
          const e = kids[i];
          if (!isHeading(e)) continue;
          if (to ? isHeading(e, to) : level(e) <= level(kids[start])) {
            end = i;
            break;
          }
        }
        const box = document.createElement("div");
        box.id = "orizon-section";
        box.style.cssText = `padding:18px 22px;background:#fff;max-width:960px;${maxH ? `max-height:${maxH}px;overflow:hidden;` : ""}`;
        art.insertBefore(box, kids[start]);
        for (const e of kids.slice(start, end)) box.append(e);
        // The first heading carries GitHub's large top margin; drop it so the
        // section starts at its own title.
        box.firstElementChild.style.marginTop = "0";
        return end - start;
      },
      { from, to, maxH },
    );
    if (n === -1) throw new Error("no markdown-body on the page");
    if (n === -2) throw new Error(`heading not found: ${from}`);
    await page.waitForTimeout(300);
  };
}

const wrapped = (page) => page.locator("#orizon-section");

// ------------------------------------------------------------ JSON boxes ---

const CONTRACTS = {
  agent_registry: "CAPHXWU53UZUZJGV7IAE57NNMH3YYB5MTWO6YA53KKMXSFVLOITBJ3GQ",
  reputation_ledger: "CDCSOBEVZUPQZV5GV4D6KYHZCLNGW2KXY74RUHSZ3EZUXF34DPW422ZT",
  payment_escrow: "CCNO5TENCK3EK532I3OZLZ63323FEEULPAKJ74CUP3JZK3XQINRQ5VC4",
  attestation_registry:
    "CBYUZKOET43UXTBXZUJIBBJW5ODGD2J2AZVVXCR3QONGOCAHOXQQHEGK",
};
const ASSET_SAC = "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC";
const SIGNER = "GDB4N25UYM3YNTTAWX7LSGI2P7OR62QZQXRNQWAGF5TFVENDKCTTCDHP";
const SC_BLOB = (p) =>
  `${GH}/Orizon-Agents-Smart-Contract-Stellar/blob/main/${p}`;

function manilaNow() {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Manila",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })
      .formatToParts(new Date())
      .map((x) => [x.type, x.value]),
  );
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute} PHT`;
}

function assertEq(actual, expected, what) {
  if (actual !== expected)
    throw new Error(
      `${what}: expected ${JSON.stringify(expected)}, live value ${JSON.stringify(actual)}`,
    );
}

// The stylesheet and frame shared by the three rendered boxes below. Each one
// prints a live response — nothing is composed from memory — and each carries
// the address it came from and the moment it was fetched.
const BOX_CSS = `
  html,body{margin:0}
  body{padding:24px;background:#fff;color:#172033;font:15px/1.6 'DejaVu Sans Mono',ui-monospace,Menlo,Consolas,monospace}
  #json{display:inline-block;min-width:max-content;border:1px solid #d5dbe6;border-radius:4px;overflow:hidden}
  #json .hd{min-width:760px}
  #json .hd{padding:10px 16px;background:#f3f6fb;border-bottom:1px solid #d5dbe6;font-weight:700}
  #json .hd .sub{font-weight:400;color:#5b6475;font-size:12px;margin-top:2px}
  #json .body{padding:12px 0}
  #json .ln{padding:0 16px;white-space:pre}
  #json .hi{background:#fff4dc;box-shadow:inset 3px 0 #d99100}
  #json table{border-collapse:collapse;margin:0}
  #json td{padding:4px 16px;vertical-align:top;font-size:14px;border-top:1px solid #edf1f7}
  #json td.q{color:#5b6475;white-space:pre}
  #json td.v{font-weight:700}
  #json tr.hi td{background:#fff4dc}
  #json tr.hi td.q{box-shadow:inset 3px 0 #d99100}
  #json .st{font-weight:700;color:#8a2b12}`;

async function frame(page, title, sub, inner) {
  await page.evaluate(
    ({ css, title, sub, inner }) => {
      document.head.innerHTML = `<style>${css}</style>`;
      document.body.innerHTML = `<div id="json"><div class="hd">${title}<div class="sub">${sub}</div></div><div class="body">${inner}</div></div>`;
    },
    { css: BOX_CSS, title, sub, inner },
  );
  await page.waitForTimeout(150);
}

const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// A bare JSON body prints as one long line. Re-print the same parsed body
// indented (JSON.stringify of the live response, so no value is touched) and
// tint the lines whose key the PDF's text refers to. `verify` checks the
// values the text quotes, so a changed deployment fails the capture instead
// of contradicting the document.
function formattedJson(keys, verify) {
  return async (page) => {
    const raw = await page.evaluate(
      () => (document.querySelector("pre") ?? document.body).innerText,
    );
    const body = JSON.parse(raw);
    verify(body);
    const url = page.url();
    const lines = JSON.stringify(body, null, 2)
      .split("\n")
      .map((line) => {
        const key = line.match(/^\s*"([^"]+)":/)?.[1];
        return `<div class="ln${key && keys.includes(key) ? " hi" : ""}">${esc(line)}</div>`;
      })
      .join("");
    await frame(
      page,
      `GET ${esc(url)}`,
      `fetched ${manilaNow()} · response body, formatted · tinted lines are the fields the text refers to`,
      lines,
    );
  };
}

const jsonBox = (page) => rectOf(page.locator("#json"), "rendered box");

// Stellar Expert: the page from its header (which names the network) down to
// the last content segment, or to the last segment holding `upTo` — for a
// transaction, its invocation; the signatures below it are left out, as is
// the footer.
function expertPage(upTo) {
  return async (page) => {
    const bottom = await page.evaluate(
      (sel) =>
        Math.max(
          ...[...document.querySelectorAll(".segment")]
            .filter((s) => !sel || s.querySelector(sel))
            .map((s) => s.getBoundingClientRect().bottom),
        ),
      upTo ?? null,
    );
    if (!Number.isFinite(bottom) || bottom < 200)
      throw new Error("Stellar Expert content did not render");
    return {
      x: 0,
      y: 0,
      width: page.viewportSize().width,
      height: bottom + 20,
    };
  };
}

// ----------------------------------------------------------------- scenes ---
// A scene loads one URL once and takes its shots in order; a shot's `act`
// runs first, then `expect` (strings that must be on the page — the PDF's
// text relies on them), then the region and the marks are measured. A shot
// with `el` is an element screenshot instead of a viewport clip.
const MD = { width: 1280, height: 2600 };

const SCENES = [
  // ------------------------------------------- the design, as documented ---
  {
    url: SC_BLOB("docs/escrow-v2-interface.md"),
    viewport: MD,
    scale: 2,
    ready: "PaymentEscrow v2",
    shots: [
      {
        file: "b1-escrow-v2-why.png",
        act: wrapSection("Why v2 exists", "Entry points", 1400),
        el: wrapped,
      },
    ],
  },
  {
    url: BE_BLOB("docs/decisions/0010-escrow-v2-custody-settlement.md"),
    viewport: MD,
    scale: 2,
    ready: "0010",
    shots: [
      {
        file: "b2-adr-0010-escrow-v2.png",
        act: wrapSection("Context", null, 1500),
        el: wrapped,
      },
    ],
  },
  // ------------------------------------------------- the live API, at 2x ---
  {
    url: `${BE}/api/stellar/network`,
    viewport: { width: 1000, height: 1300 },
    scale: 2,
    settle: 800,
    shots: [
      {
        file: "c1-api-network.png",
        act: formattedJson(["network", "asset", "payment_escrow"], (b) => {
          assertEq(b.network, "testnet", "network");
          assertEq(b.asset, "native", "asset");
          assertEq(b.asset_sac, ASSET_SAC, "asset_sac");
          for (const [k, v] of Object.entries(CONTRACTS))
            assertEq(b.contracts?.[k], v, `contracts.${k}`);
        }),
        region: jsonBox,
      },
    ],
  },
  {
    url: `${BE}/readiness`,
    viewport: { width: 1000, height: 1500 },
    scale: 2,
    settle: 800,
    shots: [
      {
        file: "c2-api-readiness.png",
        act: formattedJson(
          ["escrow", "version", "contract", "store", "enabled", "writer"],
          (b) => {
            assertEq(b.status, "ready", "status");
            assertEq(b.escrow?.version, 2, "escrow.version");
            assertEq(
              b.escrow?.contract,
              CONTRACTS.payment_escrow,
              "escrow.contract",
            );
            assertEq(b.disputes?.store, "postgres", "disputes.store");
            assertEq(
              b.disputes?.reconcile?.enabled,
              true,
              "disputes.reconcile.enabled",
            );
            assertEq(b.ratings?.writer, "scorer", "ratings.writer");
            assertEq(b.ratings?.scorer, SIGNER, "ratings.scorer");
          },
        ),
        region: jsonBox,
      },
    ],
  },
  // ------------------------------------------------- independent QA ---
  {
    url: UAT_BLOB("docs/uat/signoff-report.md"),
    viewport: MD,
    scale: 2,
    ready: "UAT sign-off report",
    settle: 3000,
    shots: [
      {
        file: "d1-qa-epic-6-status.png",
        act: wrapSection("Epic 6 status, 2026-10-02", null, 1500),
        el: wrapped,
      },
    ],
  },
];

// ----------------------------------------------------------------- runner ---

const only = process.argv.slice(2);
const wanted = (file) => !only.length || only.some((p) => file.startsWith(p));
const todo = SCENES.filter((s) => s.shots.some((shot) => wanted(shot.file)));

const manifest = existsSync(MANIFEST)
  ? JSON.parse(readFileSync(MANIFEST, "utf8"))
  : {};

// Render's free tier sleeps; wake the backend before anything needs it.
for (let attempt = 1; attempt <= 2; attempt++) {
  try {
    const t0 = Date.now();
    const res = await fetch(`${BE}/health`, {
      signal: AbortSignal.timeout(90000),
    });
    console.log(
      `warm backend: ${res.status} in ${((Date.now() - t0) / 1000).toFixed(1)}s`,
    );
    if (res.ok) break;
  } catch (e) {
    console.warn(`warm backend (try ${attempt}) failed: ${e.message}`);
  }
}

async function assertHealthy(page) {
  const text = await page.locator("body").innerText();
  const hit = FAILURE_TEXT.find((t) => text.includes(t));
  if (hit) throw new Error(`page shows "${hit}"`);
}

const browser = await chromium.launch();
let failed = 0;
for (const scene of todo) {
  // `scale` is the device pixel ratio: 2 for the light, text-dense pages
  // (GitHub, Stellar Expert, the API) so their small type stays sharp when
  // the PDF is zoomed. Marks and region sizes stay in CSS pixels.
  const {
    url,
    viewport = MD,
    scale = 1,
    waitUntil = "load",
    settle = 3000,
    ready,
    prepare,
  } = scene;
  // Manila time, so any local timestamps on the pages read as PHT.
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: scale,
    locale: "en-US",
    timezoneId: "Asia/Manila",
  });
  let lastErr;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const page = await context.newPage();
    const taken = [];
    try {
      await page.goto(url, { waitUntil, timeout: 60000 * attempt });
      await page.waitForTimeout(settle * attempt); // let SPA content settle
      if (ready)
        await page
          .getByText(ready, { exact: false })
          .first()
          .waitFor({ timeout: 30000 });
      if (prepare) await prepare(page);
      for (const shot of scene.shots) {
        if (shot.act) await shot.act(page);
        await assertHealthy(page);
        // innerText applies CSS text-transform, so compare case-insensitively.
        const body = (await page.locator("body").innerText()).toLowerCase();
        for (const t of shot.expect ?? [])
          if (!body.includes(t.toLowerCase()))
            throw new Error(`${shot.file}: "${t}" not on the page`);
        if (shot.check) await shot.check(page);
        if (!wanted(shot.file)) continue;
        let region;
        if (shot.el) {
          // Element screenshot: Playwright scrolls it into view, so the
          // marks are measured after that scroll and relative to its box.
          const el = shot.el(page).first();
          await el.waitFor({ state: "visible", timeout: 20000 });
          // Clamp a very long element so the PDF shows it from the top at a
          // readable size rather than shrinking the whole thing to fit.
          if (shot.maxH)
            await el.evaluate((n, h) => {
              n.style.maxHeight = h + "px";
              n.style.overflow = "hidden";
            }, shot.maxH);
          await el.scrollIntoViewIfNeeded();
          await page.waitForTimeout(400);
          await el.screenshot({ path: join(OUT, shot.file) });
          region = snap(await rectOf(el, shot.file));
        } else {
          region = snap(await shot.region(page));
          await page.screenshot({ path: join(OUT, shot.file), clip: region });
        }
        const marks = [];
        for (const m of shot.marks ?? [])
          marks.push(relativeTo(await m(page), region));
        taken.push([
          shot.file,
          {
            url: shot.url ?? url,
            ...(shot.via ? { via: shot.via } : {}),
            capturedAt: new Date().toISOString(),
            width: region.width,
            height: region.height,
            scale,
            marks,
          },
        ]);
      }
      for (const [file, entry] of taken) {
        manifest[file] = entry;
        console.log(
          `ok   ${file} ${entry.width}×${entry.height}${attempt > 1 ? " (retry)" : ""}`,
        );
      }
      lastErr = null;
      await page.close();
      break;
    } catch (e) {
      lastErr = e;
      console.warn(`try${attempt} ${url}: ${e.message.split("\n")[0]}`);
      await page.close();
    }
  }
  await context.close();
  if (lastErr) {
    failed++;
    console.error(`FAIL ${url}: ${lastErr.message.split("\n")[0]}`);
  }
}
await browser.close();

const sorted = Object.fromEntries(
  Object.entries(manifest).sort(([a], [b]) => a.localeCompare(b)),
);
writeFileSync(MANIFEST, JSON.stringify(sorted, null, 2) + "\n");
process.exitCode = failed ? 1 : 0;
