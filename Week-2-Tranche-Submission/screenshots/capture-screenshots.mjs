// Capture the Week-2 tranche evidence screenshots.
// Prereq: `npx playwright install-deps chromium` (needs sudo, once).
// Run from the frontend repo root:
//   node Week-2-Tranche-Submission/screenshots/capture-screenshots.mjs
// Recapture only some shots by passing filename prefixes:
//   node Week-2-Tranche-Submission/screenshots/capture-screenshots.mjs 01 05
//
// Read-only: nothing here connects a wallet, signs, authorizes, simulates or
// pays. The orchestrator shot stops at the plan card (Decompose only).
import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const OUT = dirname(fileURLToPath(import.meta.url));
const BE = "https://orizon-agents-be-stellar.onrender.com";

// Orchestrator: pick the "tetris game in html" preset with the page's own
// button, press Decompose, and wait for the plan card's steps. The curated
// demo path holds the plan back ~1.4–2.4 s by design, so the wait is on the
// rendered steps, not on a timer.
async function decomposeTetris(page) {
  await page.getByRole("button", { name: /tetris game in html/i }).click();
  await page.locator("#intent").waitFor();
  const intent = await page.locator("#intent").inputValue();
  if (intent !== "tetris game in html") throw new Error(`preset did not fill the intent box (got "${intent}")`);
  await page.getByRole("button", { name: /Decompose/ }).click();
  await page.getByRole("heading", { name: "Execution plan" }).waitFor({ timeout: 60000 });
  await page.locator("ol > li").first().waitFor({ timeout: 30000 });
  await page.waitForTimeout(2500); // step entrance animations
}

// /readiness is a bare JSON body; Chromium prints it as one long line.
// Re-print the same parsed body indented so the fields are legible. The
// content is unchanged — only whitespace.
async function prettyJson(page) {
  const raw = await page.locator("body").innerText();
  const parsed = JSON.parse(raw);
  if (!("cold_start" in parsed) || !("ratings" in parsed)) {
    throw new Error("readiness body lacks cold_start / ratings");
  }
  await page.evaluate(
    ({ text, url, at }) => {
      document.body.innerHTML = "";
      document.body.style.cssText = "margin:24px;font:15px/1.5 ui-monospace,Menlo,Consolas,monospace;background:#fff;color:#111";
      const head = document.createElement("div");
      head.style.cssText = "color:#555;margin-bottom:12px";
      head.textContent = `GET ${url}  —  fetched ${at}  (response body, indented for legibility)`;
      const pre = document.createElement("pre");
      pre.style.cssText = "margin:0;padding:16px;border:1px solid #ddd;background:#fafafa";
      pre.textContent = text;
      document.body.append(head, pre);
    },
    { text: JSON.stringify(parsed, null, 2), url: page.url(), at: new Date().toISOString() },
  );
}

// [filename, url, options]
//   waitUntil  — goto lifecycle event (default "networkidle")
//   settle     — extra ms after load for SPA content (default 3000)
//   timeout    — goto timeout ms (default 45000)
//   ready      — selector or text that must appear before capture
//   action     — async (page) => {} run before capture
//   viewport   — per-shot viewport override
//   element    — (page) => Locator; capture that element instead of the full page
const SHOTS = [
  ["01-orizons-plan-card.png", "https://orizons.xyz/app/orchestrator", { waitUntil: "load", action: decomposeTetris }],
  ["02-orizons-agents-standing.png", "https://orizons.xyz/app/agents", { waitUntil: "load", settle: 6000 }],
  ["03-orizons-operator-dashboard.png", "https://orizons.xyz/app/operator", { waitUntil: "load", settle: 5000 }],
  ["04-orizons-bind.png", "https://orizons.xyz/app/bind", { waitUntil: "load", settle: 5000 }],
  ["05-be-readiness.png", `${BE}/readiness`, { waitUntil: "load", timeout: 90000, settle: 500, action: prettyJson }],
  ["06-be-pr-59.png", "https://github.com/Bl0cksmiths/Orizon-Agents-BE-Stellar/pull/59"],
  ["07-fe-pr-62.png", "https://github.com/Bl0cksmiths/Orizon-Agents-FE-Stellar/pull/62"],
  ["08-uat-pr-3-rie-commits.png", "https://github.com/Bl0cksmiths/Orizon-Agents-UAT-Stellar/pull/3/commits"],
  ["09-be-pull-requests.png", "https://github.com/Bl0cksmiths/Orizon-Agents-BE-Stellar/pulls?q=is%3Apr+is%3Amerged+merged%3A2026-09-13..2026-09-18"],
  ["10-fe-pull-requests.png", "https://github.com/Bl0cksmiths/Orizon-Agents-FE-Stellar/pulls?q=is%3Apr+is%3Amerged+merged%3A2026-09-13..2026-09-18"],
  ["11-contracts-pr-2.png", "https://github.com/Bl0cksmiths/Orizon-Agents-Smart-Contract-Stellar/pull/2"],
  ["12-reference-agent-repo.png", "https://github.com/Bl0cksmiths/Orizon-Agents-Example-Agent-Stellar"],
  ["13-set-scorer-tx-stellar-expert.png", "https://stellar.expert/explorer/testnet/tx/216e1b5f6ade4d75ec671bcda27b462bfd373d041b1ba2150d76002ee8d201f8", { settle: 5000 }],
  // x.com/OrizonAgents402/status/2101103657043255772 renders a blank page to
  // a logged-out headless browser (no <article> after 15 s). X's own embed
  // renderer draws the same post id without a login, so that is what is
  // captured; the manifest and the PDF name both URLs. The shot is the
  // embed's bordered card (the <article>'s parent, 550 px wide), not a
  // 1440 px frame that would be almost all white margin.
  ["14-week-2-x-post.png", "https://platform.twitter.com/embed/Tweet.html?id=2101103657043255772&theme=light&lang=en", {
    settle: 6000, ready: "article", viewport: { width: 560, height: 900 },
    element: (page) => page.locator("article").first().locator("xpath=.."),
  }],
];

const only = process.argv.slice(2);
const todo = only.length ? SHOTS.filter(([name]) => only.some((p) => name.startsWith(p))) : SHOTS;

// Render's free tier sleeps; wake the backend before the dApp pages need it.
try {
  const t0 = Date.now();
  const res = await fetch(`${BE}/readiness`, { signal: AbortSignal.timeout(90000) });
  console.log(`warm backend: ${res.status} in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
} catch (e) {
  console.warn(`warm backend failed: ${e.message}`);
}

const browser = await chromium.launch();
// Manila time, so relative/local timestamps (e.g. the X post's) read as PHT.
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "en-US", timezoneId: "Asia/Manila" });
let failed = 0;
for (const [name, url, opts = {}] of todo) {
  const { waitUntil = "networkidle", settle = 3000, timeout = 45000, ready, action, viewport, element } = opts;
  let lastErr;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const page = await context.newPage();
    if (viewport) await page.setViewportSize(viewport);
    try {
      await page.goto(url, { waitUntil, timeout: attempt === 1 ? timeout : timeout * 2 });
      await page.waitForTimeout(attempt === 1 ? settle : settle * 2); // let SPA content settle
      if (ready) await page.locator(ready).first().waitFor({ timeout: 20000 });
      if (action) await action(page);
      if (element) await element(page).screenshot({ path: join(OUT, name) });
      else await page.screenshot({ path: join(OUT, name), fullPage: true });
      console.log(`ok   ${name}${attempt > 1 ? " (retry)" : ""}`);
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
process.exitCode = failed ? 1 : 0;
