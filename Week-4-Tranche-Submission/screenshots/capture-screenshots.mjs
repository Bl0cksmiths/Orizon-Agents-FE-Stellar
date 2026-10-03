// Capture the Week-3 tranche evidence screenshots (public web only).
// Adapted from Week-2-Tranche-Submission/screenshots/capture-screenshots.mjs.
// Prereq: `npx playwright install-deps chromium` (needs sudo, once).
// Run from the frontend repo root:
//   node Week-3-Tranche-Submission/screenshots/capture-screenshots.mjs
// Recapture only some shots by passing filename prefixes:
//   node Week-3-Tranche-Submission/screenshots/capture-screenshots.mjs 01 15
//
// Read-only: no wallet is connected, nothing is signed, authorized, paid or
// submitted. The one POST the script makes (#15) is a request the deployment
// refuses with 503 before it touches money — that refusal *is* the evidence.
//
// Every shot is written next to this file, and a sidecar `capture-meta.json`
// records each PNG's pixel size, byte size and whether it was cropped or
// downscaled, so the README manifest can state that without guessing.
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

// Swagger UI lists all twelve tag sections plus a ~90-entry Schemas block, so
// the disputes block sits ~3200 px down a 6262-px page. Hide the other eleven
// sections and the Schemas block in the browser so the six dispute routes sit
// directly under the page's own title bar and the frame carries its own
// provenance. Nothing is expanded, rewritten or re-ordered — only the unrelated
// blocks are given `display:none`, which the manifest says.
async function disputesSectionOnly(page) {
  await page.locator("#operations-tag-disputes").waitFor({ timeout: 60000 });
  await page.waitForTimeout(2000);
  const section = page
    .locator("div.opblock-tag-section")
    .filter({ has: page.locator("#operations-tag-disputes") });
  const routes = await section
    .locator(".opblock .opblock-summary-path")
    .allInnerTexts();
  if (routes.length !== 6)
    throw new Error(
      `expected 6 dispute routes, saw ${routes.length}: ${routes.join(", ")}`,
    );
  await page.evaluate(() => {
    for (const sec of document.querySelectorAll("div.opblock-tag-section")) {
      if (!sec.querySelector("#operations-tag-disputes"))
        sec.style.display = "none";
    }
    for (const models of document.querySelectorAll("section.models"))
      models.style.display = "none";
    const note = document.createElement("div");
    note.style.cssText =
      "margin:10px 28px 0;font:13px/1.5 ui-monospace,monospace;color:#555";
    note.textContent = `Interactive docs at ${location.href} — the other eleven tag sections and the Schemas block are hidden so the six dispute routes fit one frame.`;
    document
      .querySelector("div.opblock-tag-section")
      ?.parentElement?.prepend(note);
  });
  await page.waitForTimeout(800);
}

// The honest live state of the dispute money path: ask the deployment to uphold
// a dispute and show what it answers. The POST is made from the page with
// fetch() so the frame is a real browser round-trip, status line and body.
//
// No dispute can exist on the deployment (BE #67: the settlement record a
// dispute hangs off is never written), so the id is a syntactically valid
// placeholder. The 503 comes from the route's feature gate, which answers
// before any id lookup — every id gets the same body.
async function upholdRefused(page) {
  const DISPUTE_ID = "00000000-0000-0000-0000-000000000000";
  const result = await page.evaluate(
    async ({ base, id }) => {
      const path = `/api/disputes/${id}/uphold`;
      const res = await fetch(base + path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "evidence capture — refusal expected" }),
      });
      return {
        path,
        status: res.status,
        statusText: res.statusText,
        body: await res.text(),
      };
    },
    { base: BE, id: DISPUTE_ID },
  );

  if (
    result.status !== 503 ||
    !result.body.includes("dispute_refunds_disabled")
  ) {
    throw new Error(
      `expected 503 dispute_refunds_disabled, got ${result.status}: ${result.body.slice(0, 200)}`,
    );
  }
  let pretty = result.body;
  try {
    pretty = JSON.stringify(JSON.parse(result.body), null, 2);
  } catch {
    /* keep raw */
  }

  await page.evaluate(
    ({ base, r, pretty, at }) => {
      document.body.innerHTML = "";
      document.body.style.cssText =
        "margin:24px;font:15px/1.6 ui-monospace,Menlo,Consolas,monospace;background:#fff;color:#111";
      const mk = (tag, css, text) => {
        const e = document.createElement(tag);
        e.style.cssText = css;
        e.textContent = text;
        return e;
      };
      const box =
        "margin:0 0 14px;padding:14px 16px;border:1px solid #ddd;background:#fafafa;white-space:pre-wrap";
      document.body.append(
        mk(
          "div",
          "font:600 17px/1.4 ui-monospace,monospace;margin-bottom:4px",
          "Live state of the dispute money path",
        ),
        mk(
          "div",
          "color:#555;margin-bottom:16px",
          `fetch() from the browser against ${base} — captured ${at}`,
        ),
        mk(
          "pre",
          box,
          `REQUEST\nPOST ${base}${r.path}\nContent-Type: application/json\n\n{"reason": "evidence capture — refusal expected"}`,
        ),
        mk(
          "pre",
          box + ";border-color:#c66;background:#fff5f5",
          `RESPONSE\n${r.status} ${r.statusText}\n\n${pretty}`,
        ),
        mk(
          "div",
          "color:#555;margin-top:4px;white-space:pre-wrap",
          "The deployment refuses to uphold a dispute: refunds are switched off, so no buyer credit is\n" +
            "attempted. The gate answers before the dispute id is looked up, so any id returns this same\n" +
            "body. The id above is a placeholder — no dispute can exist on the deployment, because the\n" +
            "settlement record a dispute hangs off is never written (BE issue #67).\n" +
            "This is the current live state, not a fault staged for the screenshot.",
        ),
      );
    },
    { base: BE, r: result, pretty, at: new Date().toISOString() },
  );
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
const BE_PR = (n) => `${GH}/Orizon-Agents-BE-Stellar/pull/${n}`;
const FE_PR = (n) => `${GH}/Orizon-Agents-FE-Stellar/pull/${n}`;
const MERGED = "pulls?q=is%3Apr+is%3Amerged+merged%3A2026-09-21..2026-09-26";

const SHOTS = [
  ["01-be-pr-60-dispute-window.png", BE_PR(60), { maxHeight: 2600 }],
  ["02-be-pr-62-partial-credit-refund.png", BE_PR(62), { maxHeight: 2600 }],
  ["03-be-pr-63-dispute-rating.png", BE_PR(63), { maxHeight: 2600 }],
  ["04-be-pr-65-receipt-record.png", BE_PR(65), { maxHeight: 2600 }],
  ["05-fe-pr-68-dispute-action.png", FE_PR(68), { maxHeight: 2600 }],
  ["06-fe-pr-69-dispute-receipt.png", FE_PR(69), { maxHeight: 2600 }],
  ["07-be-pr-75-hardening.png", BE_PR(75), { maxHeight: 2600 }],
  ["08-fe-pr-76-hardening.png", FE_PR(76), { maxHeight: 2600 }],
  ["09-be-pull-requests-week3.png", `${GH}/Orizon-Agents-BE-Stellar/${MERGED}`],
  ["10-fe-pull-requests-week3.png", `${GH}/Orizon-Agents-FE-Stellar/${MERGED}`],
  [
    "11-uat-pr-4-rie-commits.png",
    `${GH}/Orizon-Agents-UAT-Stellar/pull/4/commits`,
    { maxHeight: 3200 },
  ],
  [
    "12-be-stellar-network.png",
    `${BE}/api/stellar/network`,
    {
      waitUntil: "load",
      timeout: 120000,
      settle: 500,
      action: prettyJson(["network", "contracts", "asset_sac"]),
    },
  ],
  [
    "13-be-readiness.png",
    `${BE}/readiness`,
    {
      waitUntil: "load",
      timeout: 120000,
      settle: 500,
      action: prettyJson(["cold_start", "ratings"]),
    },
  ],
  [
    "14-be-dispute-routes-openapi.png",
    `${BE}/docs`,
    {
      waitUntil: "load",
      timeout: 120000,
      settle: 2500,
      action: disputesSectionOnly,
    },
  ],
  // The shell page is the deployment's own /readiness, so the fetch() below is
  // same-origin (a cross-origin shell is refused by CORS before it is answered).
  // Its body is then replaced by the request/response transcript.
  [
    "15-be-refunds-disabled.png",
    `${BE}/readiness`,
    { waitUntil: "load", timeout: 120000, settle: 500, action: upholdRefused },
  ],
  [
    "16-drill-refund-tx-stellar-expert.png",
    "https://stellar.expert/explorer/testnet/tx/a5baac432b582787df0a632b3bc12916c51e12575a8f77bf267fd45b728701b8",
    { settle: 6000 },
  ],
  [
    "17-drill-rating-tx-stellar-expert.png",
    "https://stellar.expert/explorer/testnet/tx/7138e4e36e47f4f4404b2212aad5584d2f8fb941b387da76acae4c3b4cc07184",
    { settle: 6000 },
  ],
  [
    "18-be-issue-67-no-settlement.png",
    `${GH}/Orizon-Agents-BE-Stellar/issues/67`,
    { maxHeight: 3000 },
  ],
  [
    "19-contracts-issue-3-escrow-charge.png",
    `${GH}/Orizon-Agents-Smart-Contract-Stellar/issues/3`,
    { maxHeight: 3000 },
  ],
  [
    "20-uat-defect-register.png",
    `${GH}/Orizon-Agents-UAT-Stellar/blob/main/docs/uat/defects.md`,
    { maxHeight: 3000 },
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
      if (maxHeight && full.h > maxHeight) {
        shot.clip = { x: 0, y: 0, width: full.w, height: maxHeight };
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
        cropHeight: cropped ? maxHeight : null,
        element: Boolean(element),
        ...sized,
      };
      console.log(
        `ok   ${name}  ${(sized.bytes / 1024).toFixed(0)} KB  page ${full.w}x${full.h}` +
          `${cropped ? ` cropped→${maxHeight}px` : ""}${sized.scale !== 1 ? ` scaled x${sized.scale}` : ""}` +
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
