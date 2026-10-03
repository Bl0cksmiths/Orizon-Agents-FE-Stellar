// Capture the Week-4 tranche evidence screenshots (public web only).
// Adapted from Week-3-Tranche-Submission/screenshots/capture-screenshots.mjs.
// Prereq: `npx playwright install-deps chromium` (needs sudo, once).
// Run from the frontend repo root:
//   node Week-4-Tranche-Submission/screenshots/capture-screenshots.mjs
// Recapture only some shots by passing filename prefixes:
//   node Week-4-Tranche-Submission/screenshots/capture-screenshots.mjs 01 15
//
// Read-only: no wallet is connected, nothing is signed, authorized, paid or
// submitted. Every request the script makes is a GET.
//
// Every shot is written next to this file, and a sidecar `capture-meta.json`
// records each PNG's pixel size, byte size and whether it was cropped or
// downscaled, so the README manifest can state that without guessing.
//
// The files in this folder prefixed `d2a-`, `d2b-` and `d3c-` are NOT made by
// this script. They were captured from the live site on 2026-09-30 for the
// public evidence index (orizons.xyz/evidence links them by commit), and are
// left exactly as they were.
import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { statSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";

const OUT = dirname(fileURLToPath(import.meta.url));
const BE = "https://orizon-agents-be-stellar.onrender.com";
const GH = "https://github.com/Bl0cksmiths";
const BUDGET = 700 * 1024; // per-PNG ceiling, so the assembled PDF stays <10 MB

// ---------------------------------------------------------------- page actions

// A bare JSON body prints as one long line in Chromium. Re-print the same
// parsed body indented so the fields are legible. Content unchanged — only
// whitespace. `require` names keys that must be present, so a rate-limited or
// error body can never be shipped as if it were the real response.
const prettyJson =
  (require = []) =>
  async (page) => {
    const raw = await page.locator("body").innerText();
    const parsed = JSON.parse(raw);
    for (const key of require) {
      if (!(key in parsed))
        throw new Error(`response body lacks "${key}": ${raw.slice(0, 200)}`);
    }
    await page.evaluate(
      ({ text, url, at }) => {
        document.body.innerHTML = "";
        document.body.style.cssText =
          "margin:24px;font:15px/1.5 ui-monospace,Menlo,Consolas,monospace;background:#fff;color:#111";
        const head = document.createElement("div");
        head.style.cssText = "color:#555;margin-bottom:12px";
        head.textContent = `GET ${url}  —  fetched ${at}  (response body, indented for legibility)`;
        const pre = document.createElement("pre");
        pre.style.cssText =
          "margin:0;padding:16px;border:1px solid #ddd;background:#fafafa";
        pre.textContent = text;
        document.body.append(head, pre);
      },
      {
        text: JSON.stringify(parsed, null, 2),
        url: page.url(),
        at: new Date().toISOString(),
      },
    );
  };

// Several live pages run for tens of thousands of pixels and the evidence is
// one section in the middle of them. `fromText` scrolls nothing and rewrites
// nothing: it measures where the named heading sits on the full page so the
// shot can be clipped from just above it, for `maxHeight` px. The manifest
// records the offset, so the crop is stated rather than hidden.
const fromText = (text) => async (page) => {
  // A RegExp names a heading by how it starts (a defect's long title).
  const el = (
    text instanceof RegExp
      ? page.getByRole("heading", { name: text })
      : page.getByText(text, { exact: true })
  ).first();
  await el.waitFor({ timeout: 30000 });
  const y = await el.evaluate(
    (n) => n.getBoundingClientRect().top + window.scrollY,
  );
  return Math.max(0, Math.floor(y) - 24);
};

// The evidence index's metrics table carries, per row, how it was measured and
// every proof link — dozens of links in the adoption rows — so the ten rows run
// to ~9,000 px. To show all ten in one frame, the "How measured" notes and the
// Proof column are given `display:none` in the browser. Nothing is rewritten or
// re-ordered, the status notes stay in, and a line at the top of the frame says
// what was hidden. Every hidden link is at the URL.
async function metricsAtAGlance(page) {
  const section = page.locator('section[aria-labelledby="success-metrics"]');
  await section.waitFor({ timeout: 30000 });
  const rows = await section.locator("tbody tr").count();
  if (rows !== 10) throw new Error(`expected 10 metric rows, saw ${rows}`);
  await section.evaluate((sec) => {
    for (const row of sec.querySelectorAll("tr")) {
      const last = row.lastElementChild;
      if (last) last.style.display = "none";
    }
    for (const span of sec.querySelectorAll("span"))
      if (span.textContent.startsWith("How measured:"))
        span.style.display = "none";
    const note = document.createElement("p");
    note.style.cssText =
      "margin:0 0 14px;font:13px/1.5 ui-monospace,monospace;color:#9aa3b5";
    note.textContent = `${location.href} — the "How measured" notes and the Proof column are hidden here so all ten rows fit one frame; both are on the live page.`;
    sec.prepend(note);
    sec.style.padding = "16px";
    // The site header is sticky; an element screenshot scrolls, so it would
    // be painted across the middle of the frame. Take it out of the flow.
    for (const el of document.querySelectorAll("body *")) {
      const pos = getComputedStyle(el).position;
      if ((pos === "sticky" || pos === "fixed") && !sec.contains(el))
        el.style.display = "none";
    }
  });
  await page.waitForTimeout(500);
}

// ------------------------------------------------------------------- shot list
// [filename, url, options]
//   waitUntil  — goto lifecycle event (default "networkidle")
//   settle     — extra ms after load for SPA content (default 3000)
//   timeout    — goto timeout ms (default 45000)
//   ready      — selector or text that must appear before capture
//   action     — async (page) => {} run before capture
//   viewport   — per-shot viewport override
//   element    — (page) => Locator; capture that element instead of the full page
//   maxHeight  — clip the full-page shot to this many px from the top (a crop,
//                declared in the manifest); used where a GitHub page runs on
//                for tens of thousands of px below the panel that is evidence
//   clipFrom   — async (page) => y; start the clip there instead of at the top
//                (with maxHeight, the clip is that tall from y)
const BE_PR = (n) => `${GH}/Orizon-Agents-BE-Stellar/pull/${n}`;
const FE_PR = (n) => `${GH}/Orizon-Agents-FE-Stellar/pull/${n}`;
const SC_PR = (n) => `${GH}/Orizon-Agents-Smart-Contract-Stellar/pull/${n}`;
const EA_PR = (n) => `${GH}/Orizon-Agents-Example-Agent-Stellar/pull/${n}`;
const SITE = "https://orizons.xyz";
const EXPERT = "https://stellar.expert/explorer/testnet";
const MERGED = "pulls?q=is%3Apr+is%3Amerged+merged%3A2026-09-27..2026-10-03";
const ESCROW_V2 = "CCNO5TENCK3EK532I3OZLZ63323FEEULPAKJ74CUP3JZK3XQINRQ5VC4";
const TX = {
  settle1: "f0674419992bdf30cf730139e54e4cdd985e32b43ee15c91733e08424a8d1235",
  refund: "cb2c57929006470f9f554989dd8071e8539d245df529df956693944a78e1e25f",
  disputeRating:
    "b512135ffade2d6518fd8cf1628f20787846ed0e311750043b87723dee453a49",
  outsideReg: "8a049b05dbf59956b2dc6cea96bd50baf4926a58d258ce66be8e74b4f1193bad",
  ac4Refund: "01c3175a881658808e15dc9a284439f2fbce4091a3566bfe3894ecedc1efa5be",
  ac5Settle: "0ada07084b5aa1c196fb8e45b15d3712dcbefaf320a315a84e8cf2ab7adc556b",
};
const LIVE_JSON = { waitUntil: "load", timeout: 120000, settle: 500 };
const EXPERT_PAGE = { settle: 6000 };

const SHOTS = [
  // ---- the week's pull requests: escrow v2, its deployment, the switch
  ["01-contracts-pr-4-escrow-v2.png", SC_PR(4), { maxHeight: 2600 }],
  ["02-contracts-pr-6-escrow-v2-deployed.png", SC_PR(6), { maxHeight: 2600 }],
  ["03-be-pr-88-settle-through-escrow-v2.png", BE_PR(88), { maxHeight: 2600 }],
  ["04-fe-pr-89-escrow-v2-console.png", FE_PR(89), { maxHeight: 2600 }],
  ["05-fe-pr-97-guide-evidence-litepaper.png", FE_PR(97), { maxHeight: 2600 }],
  ["06-example-agent-pr-6-fault-injection.png", EA_PR(6), { maxHeight: 2600 }],
  ["07-be-pull-requests-week4.png", `${GH}/Orizon-Agents-BE-Stellar/${MERGED}`],
  ["08-fe-pull-requests-week4.png", `${GH}/Orizon-Agents-FE-Stellar/${MERGED}`],
  [
    "09-uat-pr-5-rie-commits.png",
    `${GH}/Orizon-Agents-UAT-Stellar/pull/5/commits`,
    { maxHeight: 3200 },
  ],
  // ---- the live site
  [
    "10-orizons-home-live-stats.png",
    `${SITE}/`,
    { maxHeight: 1100, ready: "text=REGISTERED AGENTS" },
  ],
  [
    "11-orizons-evidence-checklist.png",
    `${SITE}/evidence`,
    { clipFrom: fromText("Checklist summary (SOW §6.2)"), maxHeight: 1100 },
  ],
  [
    "12-orizons-evidence-metrics.png",
    `${SITE}/evidence`,
    {
      action: metricsAtAGlance,
      element: (page) =>
        page.locator('section[aria-labelledby="success-metrics"]'),
    },
  ],
  ["13-orizons-demo.png", `${SITE}/demo`, { maxHeight: 2600 }],
  [
    "14-orizons-demo-transactions.png",
    `${SITE}/demo`,
    { clipFrom: fromText("On-chain evidence"), maxHeight: 1500 },
  ],
  [
    "15-orizons-guide-list-your-agent.png",
    `${SITE}/guide/list-your-agent`,
    { maxHeight: 2000 },
  ],
  ["16-orizons-litepaper.png", `${SITE}/litepaper`, { maxHeight: 1800 }],
  // ---- the live API
  [
    "17-be-stellar-network.png",
    `${BE}/api/stellar/network`,
    { ...LIVE_JSON, action: prettyJson(["network", "contracts", "asset_sac"]) },
  ],
  [
    "18-be-readiness.png",
    `${BE}/readiness`,
    { ...LIVE_JSON, action: prettyJson(["escrow", "disputes", "ratings"]) },
  ],
  [
    "19-be-metrics-overview.png",
    `${BE}/api/metrics/overview`,
    { ...LIVE_JSON, action: prettyJson(["agents", "operators", "workflows"]) },
  ],
  // ---- the chain
  [
    "20-escrow-v2-contract-stellar-expert.png",
    `${EXPERT}/contract/${ESCROW_V2}`,
    EXPERT_PAGE,
  ],
  [
    "21-settlement-tx-stellar-expert.png",
    `${EXPERT}/tx/${TX.settle1}`,
    EXPERT_PAGE,
  ],
  ["22-refund-tx-stellar-expert.png", `${EXPERT}/tx/${TX.refund}`, EXPERT_PAGE],
  [
    "23-dispute-rating-tx-stellar-expert.png",
    `${EXPERT}/tx/${TX.disputeRating}`,
    EXPERT_PAGE,
  ],
  [
    "24-outside-registration-tx-stellar-expert.png",
    `${EXPERT}/tx/${TX.outsideReg}`,
    EXPERT_PAGE,
  ],
  [
    "25-contracts-issue-3-resolved.png",
    `${GH}/Orizon-Agents-Smart-Contract-Stellar/issues/3`,
    { maxHeight: 3000 },
  ],
  // ---- story 5.01's two acceptance runs (backend docs/evidence/5.01/)
  [
    "26-restart-dispute-refund-tx-stellar-expert.png",
    `${EXPERT}/tx/${TX.ac4Refund}`,
    EXPERT_PAGE,
  ],
  [
    "27-partial-delivery-settle-tx-stellar-expert.png",
    `${EXPERT}/tx/${TX.ac5Settle}`,
    EXPERT_PAGE,
  ],
  // ---- independent QA
  [
    "28-uat-epic-6-status.png",
    `${GH}/Orizon-Agents-UAT-Stellar/blob/main/docs/uat/signoff-report.md`,
    { clipFrom: fromText("Epic 6 status, 2026-10-02"), maxHeight: 1800 },
  ],
];

// ------------------------------------------------------------------ size guard
// The assembled PDF has to stay under 10 MB, so every frame is re-encoded with
// a 256-colour adaptive palette and no dithering. A browser screenshot of a UI
// is flat colour and antialiased text: 256 entries cover it, every pixel keeps
// its position, and the file lands near a third of the size. Resolution is
// never traded away for bytes unless a frame is still over BUDGET after that —
// then it is downscaled in steps, never below 0.70, so body text stays legible
// when the PDF prints the frame at A4 width.
function shrink(path) {
  const py = `
import json, os, sys
from PIL import Image
p = sys.argv[1]; budget = int(sys.argv[2])
im = Image.open(p).convert("RGB")
w0, h0 = im.size
note = {"scale": 1.0, "palette": 256}
for scale in (1.0, 0.88, 0.80, 0.72):
    out = im if scale == 1.0 else im.resize((round(w0 * scale), round(h0 * scale)), Image.LANCZOS)
    out.quantize(colors=256, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).save(p, "PNG", optimize=True)
    note["scale"] = scale
    if os.path.getsize(p) <= budget:
        break
note["w"] = round(w0 * note["scale"]); note["h"] = round(h0 * note["scale"])
print(json.dumps(note))
`;
  const out = execFileSync("python3", ["-c", py, path, String(BUDGET)], {
    encoding: "utf8",
  });
  const note = JSON.parse(out.trim().split("\n").pop());
  return {
    bytes: statSync(path).size,
    scale: note.scale,
    palette: note.palette,
    w: note.w,
    h: note.h,
  };
}

// ----------------------------------------------------------------------- drive
const only = process.argv.slice(2);
const todo = only.length
  ? SHOTS.filter(([name]) => only.some((p) => name.startsWith(p)))
  : SHOTS;

// Render's free tier sleeps; a cold start is 30–60 s. Wake it before any shot
// needs it, so #12–#15 photograph a served response and not a spinner.
try {
  const t0 = Date.now();
  const res = await fetch(`${BE}/readiness`, {
    signal: AbortSignal.timeout(120000),
  });
  console.log(
    `warm backend: ${res.status} in ${((Date.now() - t0) / 1000).toFixed(1)}s`,
  );
} catch (e) {
  console.warn(`warm backend failed: ${e.message}`);
}

const metaPath = join(OUT, "capture-meta.json");
const meta = existsSync(metaPath)
  ? JSON.parse(readFileSync(metaPath, "utf8"))
  : {};

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  locale: "en-US",
  timezoneId: "Asia/Manila",
});
let failed = 0;
for (const [name, url, opts = {}] of todo) {
  const {
    waitUntil = "networkidle",
    settle = 3000,
    timeout = 45000,
    ready,
    action,
    viewport,
    element,
    maxHeight,
    clipFrom,
  } = opts;
  let lastErr;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const page = await context.newPage();
    if (viewport) await page.setViewportSize(viewport);
    try {
      await page.goto(url, {
        waitUntil,
        timeout: attempt === 1 ? timeout : timeout * 2,
      });
      if (settle)
        await page.waitForTimeout(attempt === 1 ? settle : settle * 2);
      if (ready) await page.locator(ready).first().waitFor({ timeout: 20000 });
      if (action) await action(page);

      const full = await page.evaluate(() => ({
        w: document.documentElement.scrollWidth,
        h: document.documentElement.scrollHeight,
      }));
      const shot = { path: join(OUT, name), fullPage: true };
      let cropped = false;
      const top = clipFrom ? await clipFrom(page) : 0;
      if (top > 0 || (maxHeight && full.h > maxHeight)) {
        const height = Math.min(maxHeight ?? full.h, full.h - top);
        shot.clip = { x: 0, y: top, width: full.w, height };
        cropped = true;
      }
      if (element) await element(page).screenshot({ path: join(OUT, name) });
      else await page.screenshot(shot);

      const sized = shrink(join(OUT, name));
      meta[name] = {
        url,
        capturedAt: new Date().toISOString(),
        pageHeight: full.h,
        pageWidth: full.w,
        cropped,
        cropTop: cropped ? top : null,
        cropHeight: cropped ? shot.clip.height : null,
        element: Boolean(element),
        ...sized,
      };
      console.log(
        `ok   ${name}  ${(sized.bytes / 1024).toFixed(0)} KB  page ${full.w}x${full.h}` +
          `${cropped ? ` cropped ${top}→${top + shot.clip.height}px` : ""}${sized.scale !== 1 ? ` scaled x${sized.scale}` : ""}` +
          `${attempt > 1 ? " (retry)" : ""}`,
      );
      lastErr = null;
      await page.close();
      break;
    } catch (e) {
      lastErr = e;
      console.warn(`try${attempt} ${name}: ${e.message.split("\n")[0]}`);
      await page.close();
    }
  }
  if (lastErr) {
    failed++;
    console.error(`FAIL ${name}: ${lastErr.message.split("\n")[0]}`);
  }
}
await browser.close();
writeFileSync(metaPath, JSON.stringify(meta, null, 2) + "\n");
process.exitCode = failed ? 1 : 0;
