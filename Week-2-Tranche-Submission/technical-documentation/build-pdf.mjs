// Build Week-2-Tranche-Submission/Technical-Documentation-and-Demo-Evidence.pdf
// from the screenshots in this folder, the same way the Proof of Deliverables
// PDF is made: write an HTML document, then print it with Chromium
// (Playwright `page.pdf`, A4), in the same typography and colours.
// Run from the frontend repo root, after capture.mjs:
//   node Week-2-Tranche-Submission/technical-documentation/build-pdf.mjs
// Writes Technical-Documentation-and-Demo-Evidence.html next to this script
// (kept for inspection) and ../Technical-Documentation-and-Demo-Evidence.pdf.
//
// Screenshots are placed unaltered. The numbered outlines on them are drawn
// by this document from the rectangles capture.mjs measured (shots.json). A
// screenshot missing from this folder is skipped with a warning and its step
// stays text-only — never replaced by anything else.
import { chromium } from "playwright";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const NAME = "Technical-Documentation-and-Demo-Evidence";
const HTML = join(HERE, `${NAME}.html`);
const PDF = join(HERE, "..", `${NAME}.pdf`);
const TITLE = "Orizon Agents — Week 2 · Technical Documentation & Demo Evidence";

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// PNG width/height from the IHDR chunk, so every <img> carries its aspect
// ratio before it loads and the fit pass measures real heights.
function pngSize(file) {
  const b = readFileSync(file);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

const MANIFEST = existsSync(join(HERE, "shots.json")) ? JSON.parse(readFileSync(join(HERE, "shots.json"), "utf8")) : {};

// Capture time in Manila time, from the manifest (falls back to the file).
function capturedAt(file) {
  const d = MANIFEST[file]?.capturedAt ? new Date(MANIFEST[file].capturedAt) : statSync(join(HERE, file)).mtime;
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false })
      .formatToParts(d)
      .map((x) => [x.type, x.value]),
  );
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute} PHT`;
}

// ------------------------------------------------------------- constants ---

const SITE = "https://orizons.xyz";
const APP = `${SITE}/app`;
const BE = "https://orizon-agents-be-stellar.onrender.com";
const GH = "https://github.com/Bl0cksmiths";
const BE_DOC = (path) => `${GH}/Orizon-Agents-BE-Stellar/blob/main/${path}`;
const EXPERT = "https://stellar.expert/explorer/testnet";
const XPOST = "https://x.com/OrizonAgents402/status/2101103657043255772";
const XEMBED = "https://platform.twitter.com/embed/Tweet.html?id=2101103657043255772";

const CONTRACTS = [
  ["AgentRegistry", "CAPHXWU53UZUZJGV7IAE57NNMH3YYB5MTWO6YA53KKMXSFVLOITBJ3GQ", "agents, owners, delisting"],
  ["ReputationLedger", "CDCSOBEVZUPQZV5GV4D6KYHZCLNGW2KXY74RUHSZ3EZUXF34DPW422ZT", "on-chain ratings"],
  ["PaymentEscrow", "CBJPTMAPMGODGZCZ2IMEQSRUX3WGUXNMKDTNN2KMJ3NFGYZ5OJ5525PI", "x402 workflow caps"],
  ["AttestationRegistry", "CBYUZKOET43UXTBXZUJIBBJW5ODGD2J2AZVVXCR3QONGOCAHOXQQHEGK", "sealed run attestations"],
  ["Asset SAC (native XLM)", "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC", "the escrow asset"],
];
const contractUrl = (id) => `${EXPERT}/contract/${id}`;

const TXS = [
  ["2026-09-17", "AgentRegistry.set_active", "delists dan_w1_probe", "a710b6776042d810fa1a41ec17cc0b299c606fc2a7f54bd28c129e20bbe6e8e4"],
  ["2026-09-17", "AgentRegistry.register", "registers calculatorai", "0741a0822b6976f88a4582ffc65f1528004a9a5c3c544171e4be7ba099b1c8aa"],
  ["2026-09-17", "PaymentEscrow.authorize", "0.168 XLM workflow cap", "67701b46ef60bf488481464cf527aeadb01bb407cf294efc120c5f4ecc31e56d"],
  ["2026-09-17", "AgentRegistry.register", "registers algorex", "7e3b6c02731906ddb685b080f11c63e0c1c2665a7bad0f0836bfa7ee5d83c872"],
  ["2026-09-19", "ReputationLedger.set_scorer", "production key writes ratings", "216e1b5f6ade4d75ec671bcda27b462bfd373d041b1ba2150d76002ee8d201f8"],
  ["2026-09-19", "AttestationRegistry.set_sealer", "production key seals attestations", "c965980fd06d5917bfa46fdefc72898422a3f50136e0ac4f487e4ed0f7a19a3c"],
];
const txUrl = (hash) => `${EXPERT}/tx/${hash}`;
const tx = (hash, text) => `<a href="${txUrl(hash)}">${text}</a>`;

// A number that matches an outline on the screenshot.
const m = (n) => `<span class="mref">${n}</span>`;
const a = (url, text = url) => `<a href="${esc(url)}">${text}</a>`;

// ------------------------------------------------------------ the pages ---
// Each content block below pushes its pages; the cover's contents table is
// built from them. A walkthrough page lists the steps it carries.

const PAGES = [{ kind: "cover" }];
const STEPS = {}; // id -> step, filled by walkthrough()

function walkthrough(w, layout) {
  for (const s of w.steps) STEPS[s.id] = { ...s, walk: w.id };
  layout.forEach((ids, i) => PAGES.push({ kind: "walk", w, first: i === 0, steps: ids }));
}

// ----------------------------------------------------- render: figures ---

function shot(s) {
  if (!s.shot) return "";
  const path = join(HERE, s.shot);
  if (!existsSync(path)) {
    console.warn(`skip ${s.shot}: not captured — step ${s.id} is text-only`);
    return "";
  }
  const { w, h } = pngSize(path);
  const entry = MANIFEST[s.shot] ?? {};
  const url = entry.url ?? s.open;
  // Marks are in CSS pixels of the captured region; a 2x capture has twice
  // as many PNG pixels, so place them against the region's CSS size. The
  // outline is drawn outside the box (outline-offset), so it frames what it
  // marks rather than covering its edge.
  const W = entry.width ?? w;
  const H = entry.height ?? h;
  const pct = (v, of) => ((v / of) * 100).toFixed(3) + "%";
  const marks = (entry.marks ?? [])
    .map((r, i) => {
      const x = Math.max(0, r.x - 1), y = Math.max(0, r.y - 1);
      const x2 = Math.min(W, r.x + r.width + 1), y2 = Math.min(H, r.y + r.height + 1);
      // A box on the image's top or left edge is outlined inside itself, with
      // its number inside, so neither spills past the screenshot.
      const edge = x < W * 0.02 || y < H * 0.03 ? " in" : "";
      return `<span class="mk${edge}" style="left:${pct(x, W)};top:${pct(y, H)};width:${pct(x2 - x, W)};height:${pct(y2 - y, H)}"><i>${i + 1}</i></span>`;
    })
    .join("");
  const via = entry.via ? ` · rendered via ${a(entry.via)}` : "";
  return `
  <div class="shot" data-max="${s.max ?? 100}">
    <a class="fig${s.light ? " light" : ""}" href="${esc(url)}" style="aspect-ratio:${w} / ${h}"><img src="${esc(s.shot)}" width="${w}" height="${h}" alt="${esc(s.title)}">${marks}</a>
    <div class="src">${esc(s.what ?? "screenshot")} · ${a(url)}${via} · captured ${esc(capturedAt(s.shot))}</div>
  </div>`;
}

function step(s) {
  return `
<div class="step">
  <div class="step-head"><span class="sn">${esc(s.id)}</span><h3>${s.title}</h3>${s.open ? `<a class="go" href="${esc(s.open)}">${esc(s.go ?? s.open.replace(/^https:\/\//, ""))} ↗</a>` : ""}</div>
  ${s.text.map((p) => `<p>${p}</p>`).join("\n  ")}
  ${shot(s)}
  ${s.after ?? ""}
</div>`;
}

// ------------------------------------------------------- render: pages ---

function eyebrow(num, label) {
  return `<div class="eyebrow"><span class="num">${esc(num)}</span><span>${esc(label)}</span></div>`;
}

function walkPage(p) {
  const { w } = p;
  return `
<section class="page walk">
  ${eyebrow(`Walkthrough ${w.id}`, w.eyebrow)}
  ${p.first ? `<h2>${esc(w.title)}</h2>\n  <p class="lead">${w.intro}</p>` : ""}
  ${p.steps.map((id) => step(STEPS[id])).join("\n")}
</section>`;
}

function linksPage(p) {
  const rows = (items) =>
    items
      .map(([label, note, url, text]) => `<tr><th>${label}${note ? ` <span>· ${note}</span>` : ""}</th><td>${a(url, esc(text ?? url))}</td></tr>`)
      .join("\n      ");
  return `
<section class="page links">
  ${eyebrow("Links", p.eyebrow)}
  <h2>${esc(p.title)}</h2>
  ${p.lead ? `<p class="lead">${p.lead}</p>` : ""}
  ${p.groups
    .map(
      (g) => `
  <h3>${esc(g.title)}</h3>
  ${g.note ? `<p class="gnote">${g.note}</p>` : ""}
  ${g.html ?? `<table class="lt">\n      ${rows(g.rows)}\n  </table>`}`,
    )
    .join("\n")}
</section>`;
}

function htmlPage(p) {
  return `
<section class="page walk">
  ${eyebrow(p.num, p.eyebrow)}
  <h2>${esc(p.title)}</h2>
  ${p.html}
</section>`;
}

// Page numbers: the cover is page 1.
const pageOf = (pred) => PAGES.findIndex(pred) + 1;

function cover() {
  const toc = [];
  const linkPages = PAGES.map((p, i) => (p.kind === "links" ? i + 1 : 0)).filter(Boolean);
  if (linkPages.length) toc.push(`<tr class="grp"><td colspan="2">Links at a glance — the live app, API, documentation, video, contracts and transactions</td><td class="p">p. ${linkPages[0]}${linkPages.length > 1 ? `–${linkPages.at(-1)}` : ""}</td></tr>`);
  const walks = [...new Map(PAGES.filter((p) => p.kind === "walk").map((p) => [p.w.id, p.w])).values()];
  for (const w of walks) {
    toc.push(`<tr class="grp"><td colspan="2">Walkthrough ${esc(w.id)} — ${esc(w.title)}</td><td class="p">p. ${pageOf((p) => p.kind === "walk" && p.w.id === w.id)}</td></tr>`);
    for (const s of w.steps) toc.push(`<tr><td class="n">${esc(s.id)}</td><td>${s.title}</td><td class="p">p. ${pageOf((p) => p.kind === "walk" && p.steps.includes(s.id))}</td></tr>`);
  }
  for (const [i, p] of PAGES.entries()) if (p.kind === "html") toc.push(`<tr class="grp"><td colspan="2">${esc(p.toc)}</td><td class="p">p. ${i + 1}</td></tr>`);
  return `
<section class="page cover">
  <div class="kicker">Stellar Instawards (Cohort 2026)</div>
  <h1>${esc(TITLE)}</h1>
  <div class="sub">A step-by-step guide to what shipped in Week 2 on Stellar testnet, with every link needed to check it live.</div>
  <table class="facts">
    <tr><th>Programme</th><td>Stellar Instawards (Cohort 2026)</td></tr>
    <tr><th>Milestone</th><td>M2 · Week 2 — Reputation-Gated Routing (Deliverable D2) + External Agent Execution Path (Epic 2)</td></tr>
    <tr><th>Sprint week</th><td>Mon 2026-09-14 → Fri 2026-09-18</td></tr>
    <tr><th>Network</th><td><b>Stellar testnet only</b></td></tr>
    <tr><th>Team</th><td>Danielle Bagaforo Meer — lead engineer (GitHub <span class="mono">ALGOREX-PH</span>)<br>Rieselle Saure (“Rie”) — PM + QA (GitHub <span class="mono">rie-hash14</span>)</td></tr>
    <tr><th>Live application</th><td>${a(SITE)} · API ${a(`${BE}/docs`)}</td></tr>
  </table>
  <h3>Contents</h3>
  <table class="toc">
    ${toc.join("\n    ")}
  </table>
  <p class="note">How to read the walkthroughs: each step names the page to open (top right of the step) and what to look for. Numbered orange outlines on a screenshot ${m(1)} match the numbers in the text; they are drawn by this document over the unaltered screenshot. Every URL in this document is a live link. Screenshots were captured on 2026-09-19 from the live testnet deployment and public GitHub, Stellar Expert and X pages; no wallet was connected and nothing was signed, paid or submitted for them.</p>
</section>`;
}

function render(p) {
  if (p.kind === "cover") return cover();
  if (p.kind === "links") return linksPage(p);
  if (p.kind === "walk") return walkPage(p);
  return htmlPage(p);
}

// ------------------------------------------------------------- document ---

function documentHtml() {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${esc(TITLE)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
  @page { size: A4; margin: 12mm 15mm 16mm 15mm; }
  :root { --ink: #172033; --muted: #5b6475; --rule: #d5dbe6; --accent: #1d3f8f; --soft: #f3f6fb; --amber: #8a5300; --amber-bg: #fff4dc; --mark: #f76707; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; }
  body { font-family: "Inter", "Ubuntu Sans", "DejaVu Sans", sans-serif; color: var(--ink); font-size: 9.6pt; line-height: 1.45; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .mono, code, .lt td, .ids td { font-family: "JetBrains Mono", "Ubuntu Sans Mono", "DejaVu Sans Mono", monospace; }
  code { font-size: 0.9em; background: var(--soft); border: 1px solid #e3e8f1; border-radius: 3px; padding: 0 0.25em; white-space: nowrap; }
  a { color: var(--accent); text-decoration: none; }
  .page { width: 180mm; height: 268mm; overflow: hidden; display: flex; flex-direction: column; break-after: page; }
  .page:last-child { break-after: auto; }
  .eyebrow { display: flex; gap: 3mm; align-items: baseline; font-size: 7.6pt; letter-spacing: 0.06em; text-transform: uppercase; color: var(--muted); margin-bottom: 1.5mm; }
  .eyebrow .num { color: #fff; background: var(--accent); padding: 0.4mm 1.8mm; border-radius: 2px; font-weight: 600; }
  h2 { font-size: 15pt; line-height: 1.25; margin: 0 0 2mm; color: var(--accent); font-weight: 700; }
  p { margin: 0 0 1.6mm; }
  .lead { font-size: 9.8pt; margin: 0 0 1mm; }
  /* steps */
  .step { flex: none; margin-top: 3.2mm; }
  .step-head { display: flex; align-items: baseline; gap: 2.5mm; margin-bottom: 1.2mm; padding-bottom: 0.8mm; border-bottom: 1px solid var(--rule); }
  .step-head .sn { flex: none; font-weight: 700; font-size: 8.4pt; color: #fff; background: var(--accent); border-radius: 2px; padding: 0.3mm 1.6mm; }
  .step-head h3 { margin: 0; font-size: 11pt; color: var(--ink); font-weight: 650; flex: 1; min-width: 0; }
  .step-head .go { flex: 0 1 auto; max-width: 48%; text-align: right; font-size: 7.6pt; font-family: "JetBrains Mono", monospace; overflow-wrap: anywhere; }
  .step p { font-size: 9.1pt; line-height: 1.42; }
  .mref { display: inline-block; min-width: 3.9mm; height: 3.9mm; line-height: 3.9mm; border-radius: 2mm; background: var(--mark); color: #fff; font-size: 6.8pt; font-weight: 700; text-align: center; vertical-align: 0.2mm; padding: 0 0.6mm; }
  /* screenshots */
  .shot { flex: none; margin: 1.8mm auto 0; width: 100%; }
  .fig { position: relative; display: block; width: 100%; border: 1px solid #0f0a1f; background: #0b0716; }
  .fig.light { border-color: var(--rule); background: #fff; }
  .fig > img { display: block; width: 100%; height: auto; }
  .mk { position: absolute; outline: 2px solid var(--mark); outline-offset: 1.5px; border-radius: 3px; box-shadow: 0 0 0 1.5px rgba(255,255,255,0.6); }
  .mk i { position: absolute; left: -3.4mm; top: -3.1mm; width: 4.2mm; height: 4.2mm; line-height: 4mm; border-radius: 50%; background: var(--mark); color: #fff; border: 1px solid #fff; font-style: normal; font-weight: 700; font-size: 7pt; text-align: center; }
  .mk.in { outline-offset: -3.5px; box-shadow: none; }
  .mk.in i { left: 1mm; top: 1mm; }
  .src { font-size: 6.9pt; color: var(--muted); margin-top: 0.8mm; line-height: 1.35; overflow-wrap: anywhere; }
  /* cover */
  .cover .kicker { font-size: 8pt; letter-spacing: 0.08em; text-transform: uppercase; color: var(--muted); margin-top: 2mm; }
  .cover h1 { font-size: 21pt; line-height: 1.18; margin: 3mm 0 2mm; color: var(--accent); font-weight: 700; }
  .cover .sub { font-size: 11.5pt; color: var(--ink); font-weight: 500; margin-bottom: 4mm; padding-bottom: 4mm; border-bottom: 2px solid var(--accent); }
  .cover h3, .links h3 { font-size: 9.5pt; text-transform: uppercase; letter-spacing: 0.06em; color: var(--accent); margin: 4.5mm 0 1.5mm; }
  table { border-collapse: collapse; width: 100%; }
  .facts th { text-align: left; vertical-align: top; font-weight: 600; white-space: nowrap; padding: 1mm 4mm 1mm 0; width: 34mm; }
  .facts td { padding: 1mm 0; vertical-align: top; }
  .facts tr + tr th, .facts tr + tr td { border-top: 1px solid #e7ebf2; }
  .toc td { padding: 0.45mm 0; vertical-align: baseline; border-top: 1px solid #eef1f6; font-size: 8.1pt; line-height: 1.28; }
  .toc tr.grp td { font-weight: 600; color: var(--accent); padding-top: 1.3mm; border-top: 1px solid var(--rule); }
  .toc .n { width: 9mm; color: var(--muted); font-family: "JetBrains Mono", monospace; padding-left: 2mm; }
  .toc .p { width: 14mm; text-align: right; color: var(--muted); white-space: nowrap; font-weight: 400; }
  .note { margin-top: 3.5mm; font-size: 8pt; color: var(--muted); }
  /* link tables */
  .links .lead { color: var(--muted); font-size: 8.8pt; }
  .gnote { font-size: 7.6pt; color: var(--muted); margin: -0.6mm 0 1mm; }
  .lt th { text-align: left; vertical-align: top; font-weight: 600; font-size: 8.3pt; padding: 1mm 3mm 1mm 0; width: 64mm; }
  .lt th span { font-weight: 400; color: var(--muted); font-size: 7.6pt; }
  .lt td { vertical-align: top; font-size: 7.4pt; padding: 1.15mm 0 1mm; overflow-wrap: anywhere; }
  .lt tr + tr th, .lt tr + tr td { border-top: 1px solid #e7ebf2; }
  .txs th { text-align: left; font-size: 7.4pt; color: var(--muted); font-weight: 600; padding: 0.6mm 3mm 0.6mm 0; }
  .txs td { font-size: 8pt; padding: 1mm 3mm 1mm 0; border-top: 1px solid #e7ebf2; vertical-align: top; }
  .txs td.h { font-family: "JetBrains Mono", monospace; font-size: 7.1pt; overflow-wrap: anywhere; padding-right: 0; }
  .txs td.d { white-space: nowrap; width: 20mm; }
  .txs td span { display: block; color: var(--muted); font-size: 7.3pt; }
  /* boxes */
  .callout { flex: none; margin-top: 3.2mm; padding: 2.4mm 3mm; background: var(--soft); border-left: 3px solid var(--accent); border-radius: 2px; font-size: 8.6pt; }
  .callout h4 { margin: 0 0 1.2mm; font-size: 9pt; color: var(--accent); }
  .callout pre { margin: 1mm 0; font-family: "JetBrains Mono", monospace; font-size: 7.6pt; line-height: 1.5; white-space: pre-wrap; overflow-wrap: anywhere; }
  .flow td, .flow th { font-size: 8.3pt; padding: 1mm 2.5mm 1mm 0; vertical-align: top; text-align: left; border-top: 1px solid #e7ebf2; }
  .flow th { font-size: 7.4pt; color: var(--muted); font-weight: 600; border-top: 0; }
  .flow td.k { font-weight: 600; white-space: nowrap; }
  .flow td.r { white-space: nowrap; color: var(--muted); font-family: "JetBrains Mono", monospace; font-size: 7.6pt; }
  .small { font-size: 7.6pt; color: var(--muted); margin: 1.2mm 0 0; }
</style>
</head>
<body>
${PAGES.map(render).join("\n")}
<script>
  // Shrink the screenshots on each page (keeping their aspect) until the page
  // fits: all shots on a page lose the same share of their height, so a
  // small one is never sacrificed for a tall one. Runs before printing.
  window.fitPages = function () {
    const report = [];
    for (const [n, page] of [...document.querySelectorAll(".page")].entries()) {
      const shots = [...page.querySelectorAll(".shot")];
      if (!shots.length) continue;
      for (const s of shots) s.style.width = (parseFloat(s.dataset.max) || 100) + "%";
      for (let i = 0; i < 16; i++) {
        const over = page.scrollHeight - page.clientHeight;
        if (over <= 1) break;
        const total = shots.reduce((t, s) => t + s.querySelector(".fig").getBoundingClientRect().height, 0);
        const k = Math.max(0.3, (total - over - 3) / total);
        for (const s of shots) {
          const cur = (s.getBoundingClientRect().width / s.parentElement.clientWidth) * 100;
          s.style.width = Math.max(18, cur * k) + "%";
        }
      }
      report.push("p" + (n + 1) + ":" + shots.map((s) => Math.round((s.getBoundingClientRect().width / s.parentElement.clientWidth) * 100)).join("/"));
    }
    return report;
  };
</script>
</body>
</html>`;
}

// ---------------------------------------------------------------- print ---

const html = documentHtml();
writeFileSync(HTML, html);
console.log(`wrote ${HTML}`);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 900, height: 1200 } });
await page.goto(pathToFileURL(HTML).href, { waitUntil: "networkidle", timeout: 60000 });
await page.emulateMedia({ media: "print" });
await page.evaluate(() => document.fonts.ready);
await page.evaluate(() => Promise.all([...document.images].map((im) => im.decode().catch(() => {}))));
const widths = await page.evaluate(() => window.fitPages());
console.log(`screenshot widths (% of text column): ${widths.join("  ")}`);
// A page whose content overflows would be clipped by overflow:hidden.
const overflow = await page.evaluate(() =>
  [...document.querySelectorAll(".page")].map((p, i) => (p.scrollHeight > p.clientHeight + 1 ? i + 1 : 0)).filter(Boolean),
);
if (overflow.length) {
  console.error(`OVERFLOWING pages: ${overflow.join(", ")}`);
  process.exitCode = 1;
}
await page.pdf({
  path: PDF,
  format: "A4",
  printBackground: true,
  preferCSSPageSize: true,
  displayHeaderFooter: true,
  headerTemplate: "<span></span>",
  footerTemplate: `<div style="width:100%;font-family:Inter,'DejaVu Sans',sans-serif;font-size:7.5px;color:#7a8394;padding:0 15mm;display:flex;justify-content:space-between"><span>Orizon Agents — Week 2 · Technical Documentation &amp; Demo Evidence · Stellar testnet</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`,
});
await browser.close();
const pages = (readFileSync(PDF).toString("latin1").match(/\/Type\s*\/Page[^s]/g) || []).length;
console.log(`wrote ${PDF} — ${pages} pages (${PAGES.length} laid out), ${(statSync(PDF).size / 1024 / 1024).toFixed(2)} MB`);
