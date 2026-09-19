// Capture the screenshots for the Week-2 "Technical Documentation & Demo
// Evidence" PDF. Run from the frontend repo root:
//   node Week-2-Tranche-Submission/technical-documentation/capture.mjs
// Recapture only some shots by passing filename prefixes:
//   node Week-2-Tranche-Submission/technical-documentation/capture.mjs a3 d1
//
// Read-only: nothing here connects a wallet, signs, authorizes, simulates,
// pays or submits a form. The orchestrator scene stops at the plan card
// (a preset button, then Decompose) and opens one <details> panel.
//
// Every shot is a clip of one region of the page, taken with a viewport tall
// enough that the page never scrolls, so the region, the marks and the PNG
// share one coordinate system. Console pages are clipped to the main content
// column (main#main), never the sidebar. The region's size and the marks
// (rectangles the PDF outlines and numbers, relative to the PNG) are written
// to shots.json; the PNGs themselves are never drawn on.
import { chromium } from "playwright";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const OUT = dirname(fileURLToPath(import.meta.url));
const MANIFEST = join(OUT, "shots.json");
const APP = "https://orizons.xyz/app";
const BE = "https://orizon-agents-be-stellar.onrender.com";

const CONSOLE = { width: 1440, height: 2400 };

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

const pad = (r, p) => ({ x: r.x - p, y: r.y - p, width: r.width + 2 * p, height: r.height + 2 * p });

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
  return { x, y, width: Math.ceil(r.x + r.width) - x, height: Math.ceil(r.y + r.height) - y };
}

const relativeTo = (m, region) => ({
  x: +(m.x - region.x).toFixed(1),
  y: +(m.y - region.y).toFixed(1),
  width: +m.width.toFixed(1),
  height: +m.height.toFixed(1),
});

const main = (page) => rectOf(page.locator("main#main"), "main content column");

// ------------------------------------------------------ orchestrator acts ---

// The plan card: the console Card (.glow-card) holding the "Execution plan"
// heading, border included.
const planCard = (page) =>
  page.locator("main#main .glow-card").filter({ has: page.getByRole("heading", { name: "Execution plan" }) }).last();

// The payment panel at the foot of the plan card.
const payPanel = (page) =>
  page.getByText("wallet required", { exact: false }).first().locator("xpath=ancestor::div[contains(@class,'clip-cyber-sm')][1]");

async function choosePreset(page) {
  await page.getByRole("button", { name: /tetris game in html/i }).click();
  const intent = await page.locator("#intent").inputValue();
  if (intent !== "tetris game in html") throw new Error(`preset did not fill the intent box (got "${intent}")`);
  await page.waitForTimeout(500);
}

// The curated demo path holds the plan back ~1.4–2.4 s by design, so the wait
// is on the rendered steps, not on a timer.
async function decompose(page) {
  await page.getByRole("button", { name: /Decompose/ }).click();
  await page.getByRole("heading", { name: "Execution plan" }).waitFor({ timeout: 60000 });
  await page.locator("main#main ol > li").first().waitFor({ timeout: 30000 });
  await page.waitForTimeout(2500); // step entrance animations
}

async function openFloorPanel(page) {
  await page.locator("main#main details > summary").first().click();
  await page.locator("main#main details[open]").first().waitFor({ timeout: 5000 });
  await page.waitForTimeout(600);
}

// ----------------------------------------------------------------- scenes ---
// A scene loads one URL once and takes its shots in order; a shot's `act`
// runs first, then `expect` (strings that must be on the page — the PDF's
// text relies on them), then the region and the marks are measured.
const SCENES = [
  {
    url: `${APP}/orchestrator`,
    ready: "tetris game in html",
    shots: [
      {
        file: "a1-orchestrator-intent.png",
        region: main,
        marks: [
          (page) => rectOf(page.locator("#intent"), "intent box"),
          async (page) =>
            union(
              await rectOf(page.getByRole("button", { name: /tetris game in html/i }), "first preset"),
              await rectOf(page.getByRole("button", { name: /pomodoro timer with sound/i }), "last preset"),
            ),
        ],
      },
      {
        file: "a2-preset-selected.png",
        act: choosePreset,
        region: main,
        marks: [
          (page) => rectOf(page.getByRole("button", { name: /tetris game in html/i }), "tetris preset"),
          (page) => rectOf(page.getByRole("button", { name: /Decompose/ }), "Decompose"),
        ],
      },
      {
        file: "a3-plan-card.png",
        act: decompose,
        expect: ["floor 2.75 · applied", "the floor acted on no agents"],
        region: (page) => rectOf(planCard(page), "plan card"),
        marks: [
          (page) => rectOf(page.getByText("floor 2.75 · applied"), "floor badge"),
          (page) => rectOf(page.locator("main#main ol > li").first().locator("span[title^='prior estimate']"), "first reputation chip"),
        ],
        check: async (page) => {
          // The text says every step carries the ≈3.50 starting estimate.
          const chips = await page.locator("main#main ol > li span[title]").evaluateAll((els) =>
            els.map((e) => e.getAttribute("title")).filter((t) => /reputation|estimate/.test(t)),
          );
          if (!chips.length || !chips.every((t) => t.startsWith("prior estimate 3.50"))) {
            throw new Error(`plan chips are not all the 3.50 starting estimate: ${JSON.stringify(chips)}`);
          }
        },
      },
      {
        file: "a5-payment-actions.png",
        region: async (page) => pad(await rectOf(payPanel(page), "payment panel"), 10),
        marks: [
          (page) => rectOf(payPanel(page).getByRole("button", { name: /connect wallet/i }), "Connect wallet"),
          (page) => rectOf(payPanel(page).getByRole("button", { name: /pay with fiat/i }), "Pay with fiat"),
          (page) => rectOf(payPanel(page).getByRole("button", { name: /simulate/i }), "Simulate"),
        ],
      },
      {
        file: "a4-reputation-floor-panel.png",
        act: openFloorPanel,
        expect: ["Reputation floor", "never candidates"],
        region: (page) => rectOf(page.locator("main#main details[open]"), "floor panel"),
        marks: [(page) => rectOf(page.locator("main#main details[open] > summary"), "panel summary")],
      },
    ],
  },

  // Walkthrough B — the operator's side. Forms are shown, never submitted.
  {
    url: `${APP}/register`,
    ready: "Register an Agent",
    settle: 5000,
    shots: [
      {
        file: "b1-register-agent.png",
        expect: ["two signatures, one at a time", "connect a wallet to register"],
        region: main,
        marks: [
          async (page) => union(await rectOf(page.locator("label[for='reg-agent-id']"), "agent id label"), await rectOf(page.locator("#reg-price"), "price field")),
          (page) => rectOf(page.getByText("two signatures, one at a time").locator("xpath=ancestor::div[contains(@class,'clip-cyber-sm')][1]"), "two-signatures note"),
          (page) => rectOf(page.getByRole("button", { name: /Register agent/ }), "Register agent"),
        ],
      },
    ],
  },
  {
    url: `${APP}/bind`,
    ready: "Bind an Endpoint",
    settle: 5000,
    shots: [
      {
        file: "b2-bind-endpoint.png",
        expect: ["one-time challenge naming your agent, the endpoint and a nonce", "connect the owner wallet to sign"],
        region: main,
        marks: [
          (page) => rectOf(page.locator("#bind-agent-id"), "agent id"),
          (page) => rectOf(page.locator("#bind-endpoint"), "endpoint url"),
          (page) => rectOf(page.getByRole("button", { name: /Bind endpoint/ }), "Bind endpoint"),
          (page) => rectOf(page.getByText("how binding works").locator("xpath=ancestor::div[contains(@class,'glow-card')][1]"), "how binding works"),
        ],
      },
    ],
  },
  {
    url: "https://github.com/Bl0cksmiths/Orizon-Agents-Example-Agent-Stellar",
    viewport: { width: 1280, height: 2400 },
    ready: "Five commands. Do them in order.",
    shots: [
      {
        file: "b3-reference-agent-readme.png",
        expect: ["Orizon reference agent", "Verifying an Orizon dispatch"],
        // The README from its title to the link to the operator guide: the
        // five-step table is what an operator follows.
        region: async (page) => {
          const article = await rectOf(page.locator("article.markdown-body"), "README");
          const title = await rectOf(page.getByRole("heading", { name: "Orizon reference agent" }), "README title");
          const link = await rectOf(page.locator("article.markdown-body p").filter({ hasText: "Verifying an Orizon dispatch →" }), "guide link");
          return { x: article.x - 20, y: title.y - 20, width: article.width + 40, height: link.y + link.height + 20 - (title.y - 20) };
        },
        marks: [(page) => rectOf(page.locator("article.markdown-body table"), "five-step table")],
      },
    ],
  },
  {
    url: "https://github.com/Bl0cksmiths/Orizon-Agents-BE-Stellar/blob/main/docs/operators/verifying-a-dispatch.md",
    viewport: { width: 1280, height: 2400 },
    ready: "The five steps",
    shots: [
      {
        file: "b4-verifying-a-dispatch.png",
        expect: ["Fetch our signer once, and pin it", "Check freshness and replay"],
        // "The five steps" section, from its heading to the next one.
        region: async (page) => {
          const article = await rectOf(page.locator("article.markdown-body"), "document");
          const start = await rectOf(page.getByRole("heading", { name: "The five steps" }), "section heading");
          const next = await rectOf(page.getByRole("heading", { name: "What we expect back" }), "next heading");
          return { x: article.x - 20, y: start.y - 16, width: article.width + 40, height: next.y - 12 - (start.y - 16) };
        },
      },
    ],
  },
  {
    url: `${APP}/operator`,
    ready: "My Agents",
    settle: 5000,
    shots: [
      {
        file: "b5-operator-dashboard.png",
        expect: ["Connect a wallet", "it signs nothing and moves no funds"],
        region: main,
        marks: [(page) => rectOf(page.locator("main#main .glow-card"), "connect prompt")],
      },
    ],
  },

  // Walkthrough C — marketplace standing. Two regions of the one page: the
  // floor stated once above the table, then the on-chain-registered rows
  // with their marks (the seeded catalog rows between carry none).
  {
    url: `${APP}/agents`,
    ready: "Selection floor",
    settle: 6000,
    shots: [
      {
        file: "c1-marketplace-floor.png",
        expect: ["Selection floor", "floor 2.75", "never against the headline score"],
        region: async (page) => {
          const m = await main(page);
          const card = await rectOf(page.locator("main#main .glow-card").first(), "selection floor card");
          return { x: m.x, y: m.y, width: m.width, height: card.y + card.height + 14 - m.y };
        },
        marks: [(page) => rectOf(page.locator("main#main .glow-card").first().getByText(/floor 2\.75/), "floor badge")],
      },
      {
        file: "c2-marketplace-standing.png",
        expect: ["external", "not yet operational", "delisted by operator"],
        region: async (page) => {
          const rows = page.locator("main#main tbody tr");
          const table = await rectOf(page.locator("main#main table"), "registry table");
          const first = await rectOf(rows.filter({ has: page.getByText(/^\W*external\s*$/i) }), "first on-chain row");
          const last = await rectOf(rows.last(), "last row");
          return { x: table.x - 12, y: first.y - 12, width: table.width + 24, height: last.y + last.height + 12 - (first.y - 12) };
        },
        marks: [
          (page) => rectOf(page.locator("main#main tbody").getByText(/^\W*external\s*$/i), "external mark"),
          (page) => rectOf(page.locator("main#main tbody").getByText(/^\W*not yet operational\s*$/i), "not yet operational mark"),
          (page) => rectOf(page.locator("main#main tbody").getByText(/^\W*delisted by operator\s*$/i), "delisted mark"),
        ],
      },
    ],
  },
];

// ----------------------------------------------------------------- runner ---

const only = process.argv.slice(2);
const wanted = (file) => !only.length || only.some((p) => file.startsWith(p));
const todo = SCENES.filter((s) => s.shots.some((shot) => wanted(shot.file)));

const manifest = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, "utf8")) : {};

// Render's free tier sleeps; wake the backend before the dApp pages need it.
for (let attempt = 1; attempt <= 2; attempt++) {
  try {
    const t0 = Date.now();
    const res = await fetch(`${BE}/health`, { signal: AbortSignal.timeout(60000) });
    console.log(`warm backend: ${res.status} in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
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
// Manila time, so any local timestamps on the pages read as PHT.
const context = await browser.newContext({ viewport: CONSOLE, locale: "en-US", timezoneId: "Asia/Manila" });
let failed = 0;
for (const scene of todo) {
  const { url, viewport = CONSOLE, waitUntil = "load", settle = 3000, ready, prepare } = scene;
  let lastErr;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const page = await context.newPage();
    await page.setViewportSize(viewport);
    const taken = [];
    try {
      await page.goto(url, { waitUntil, timeout: 60000 * attempt });
      await page.waitForTimeout(settle * attempt); // let SPA content settle
      if (ready) await page.getByText(ready, { exact: false }).first().waitFor({ timeout: 30000 });
      if (prepare) await prepare(page);
      for (const shot of scene.shots) {
        if (shot.act) await shot.act(page);
        await assertHealthy(page);
        // innerText applies CSS text-transform, so compare case-insensitively.
        const body = (await page.locator("body").innerText()).toLowerCase();
        for (const t of shot.expect ?? []) if (!body.includes(t.toLowerCase())) throw new Error(`${shot.file}: "${t}" not on the page`);
        if (shot.check) await shot.check(page);
        if (!wanted(shot.file)) continue;
        const region = snap(await shot.region(page));
        const marks = [];
        for (const m of shot.marks ?? []) marks.push(relativeTo(await m(page), region));
        await page.screenshot({ path: join(OUT, shot.file), clip: region });
        taken.push([shot.file, { url: shot.url ?? url, ...(shot.via ? { via: shot.via } : {}), capturedAt: new Date().toISOString(), width: region.width, height: region.height, marks }]);
      }
      for (const [file, entry] of taken) {
        manifest[file] = entry;
        console.log(`ok   ${file} ${entry.width}×${entry.height}${attempt > 1 ? " (retry)" : ""}`);
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
  if (lastErr) {
    failed++;
    console.error(`FAIL ${url}: ${lastErr.message.split("\n")[0]}`);
  }
}
await browser.close();

const sorted = Object.fromEntries(Object.entries(manifest).sort(([a], [b]) => a.localeCompare(b)));
writeFileSync(MANIFEST, JSON.stringify(sorted, null, 2) + "\n");
process.exitCode = failed ? 1 : 0;
