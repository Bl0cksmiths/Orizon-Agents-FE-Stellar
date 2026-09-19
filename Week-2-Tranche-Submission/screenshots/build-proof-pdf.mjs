// Build Week-2-Tranche-Submission/Proof-of-Deliverables.pdf from the
// screenshots in this folder, the same way the Week-1 PDF was made: write an
// HTML document, then print it with Chromium (Playwright `page.pdf`).
// Run from the frontend repo root, after capture-screenshots.mjs:
//   node Week-2-Tranche-Submission/screenshots/build-proof-pdf.mjs
// Writes screenshots/Proof-of-Deliverables.html (kept for inspection) and
// ../Proof-of-Deliverables.pdf. A screenshot missing from this folder is
// skipped with a warning, never replaced by anything else.
import { chromium } from "playwright";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const HTML = join(HERE, "Proof-of-Deliverables.html");
const PDF = join(HERE, "..", "Proof-of-Deliverables.pdf");

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// PNG width/height from the IHDR chunk, so every <img> carries its aspect
// ratio before it loads and the fit pass measures real heights.
function pngSize(file) {
  const b = readFileSync(file);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

// Capture date in Manila time, from the file itself — a recapture updates it.
function capturedAt(file) {
  const d = statSync(file).mtime;
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false })
      .formatToParts(d)
      .map((p) => [p.type, p.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute} PHT`;
}

// Tall pages are shown as vertical slices of the full-page PNG ([y0, y1] in
// source pixels, measured on the 1440-wide capture) so the text stays legible
// at A4 width. The gap label between two slices says what was left out; the
// full-page PNG is always named on the page.
const SHOTS = [
  {
    file: "01-orizons-plan-card.png",
    short: "3.04 · D2",
    title: "Plan card: each step’s reputation and the routing floor, before payment",
    tag: "Story 3.04 · Deliverable D2 — Reputation-Gated Routing",
    url: "https://orizons.xyz/app/orchestrator",
    caption: [
      "The live orchestrator decomposed the demo intent <b>“tetris game in html”</b> (chosen with the page’s own preset button, then <i>Decompose</i>) into a six-step plan. Before the buyer is asked to authorize anything, the card states the routing floor that was applied (<b>floor 2.75 · applied</b>, checked against each agent’s reputation lower bound) and shows every step’s agent with its reputation and that reputation’s source: the <b>≈★ 3.50</b> chip, where <b>≈</b> marks a prior estimate rather than settled on-chain ratings.",
      "Agents on the live registry carry the <b>≈3.50 starting estimate</b>, which clears the 2.75 floor, so the floor summary reads “the floor acted on no agents”. The five agents it lists as having no endpoint bound are not candidates because there is nothing to dispatch a step to. Nothing was authorized, simulated or paid for this capture.",
    ],
  },
  {
    file: "02-orizons-agents-standing.png",
    short: "3.05 · D2",
    title: "Marketplace standing: floor stated once, provenance and standing marks",
    tag: "Story 3.05 · Deliverable D2",
    url: "https://orizons.xyz/app/agents",
    caption: [
      "The Agent Registry states the selection floor <b>once</b>, above the table (<b>floor 2.75</b>, checked against each agent’s reputation lower bound, never the headline score). Agents registered on-chain against the public registry carry an <b>“external”</b> provenance mark; the seeded first-party catalog rows carry none. Standing marks sit beside the agent: <b>“not yet operational”</b> (registered, no endpoint bound) and <b>“delisted by operator”</b>.",
      "A third mark, <b>“below floor · not eligible”</b>, flags any agent whose lower bound falls under the floor; every agent on the live registry currently clears it.",
    ],
    slices: [[0, 672], [1338, 2057]],
    gaps: ["seeded catalog rows agt_03d9 → agt_12r0 omitted here (no marks) — all rows are in the full-page PNG"],
  },
  {
    file: "03-orizons-operator-dashboard.png",
    short: "2.06 · Epic 2",
    title: "Operator dashboard (“My Agents”), no wallet connected",
    tag: "Story 2.06 · Epic 2 — External Agent Execution Path",
    url: "https://orizons.xyz/app/operator",
    caption: [
      "The operator dashboard as a visitor sees it with <b>no wallet connected</b>. Agent ownership is read from the chain, so the page shows only a prompt to connect; connecting reads public registry data and signs nothing.",
      "Once the owner connects their wallet, the same page lists every agent that wallet owns on-chain, with its reputation and routing standing, its endpoint binding, and a <i>Settlement</i> panel of what it has been paid (read from the escrow’s on-chain charge events).",
    ],
  },
  {
    file: "04-orizons-bind.png",
    short: "2.01 / 2.05 · Epic 2",
    title: "Bind an endpoint to an on-chain agent, by wallet signature",
    tag: "Stories 2.01 / 2.05 · Epic 2",
    url: "https://orizons.xyz/app/bind",
    caption: [
      "The operator endpoint-binding page. An operator enters the id of the agent they registered on-chain and the HTTPS endpoint that runs its work; the registry issues a one-time challenge naming the agent, the endpoint and a nonce, and the <b>wallet that owns the agent signs it</b> — nothing else can authorize the binding. Ownership stays on-chain; the endpoint is an off-chain service record that can be re-bound.",
      "Captured with no wallet connected, so the button reads “connect the owner wallet to sign”. <code>weather_bot</code> and <code>https://agent.example.com/run</code> are the form’s placeholders, not a real binding.",
    ],
  },
  {
    file: "05-be-readiness.png",
    short: "BE #58 / #59 · D2",
    title: "Backend /readiness: cold-start headroom and whether ratings can be written",
    tag: "BE #58 / #59 · Deliverable D2",
    after: "Captured 2026-09-19",
    url: "https://orizon-agents-be-stellar.onrender.com/readiness",
    caption: [
      "The production backend’s readiness probe. <code>cold_start</code> shows that a brand-new agent clears the routing floor: its reputation lower bound is <b>5677 bps against a 5500 bps floor — a 177 bps margin</b> (2.84 vs 2.75 on the dApp’s 5-point scale), so <code>routable: true</code>. <code>ratings.writer</code> reports whether production can write ratings; it reads <code>scorer</code>: the backend’s signer is the ReputationLedger’s authorized scorer (<code>GDB4N25…</code>), so every paid run’s ratings are written on-chain.",
      "The JSON body was re-indented in the browser for legibility; its content is unchanged.",
    ],
    slices: [[0, 520]],
    gaps: [],
    cropNote: "Shown: the top 520 px of the 1440 × 900 frame; the rest of it is blank.",
  },
  {
    file: "06-be-pr-59.png",
    short: "BLO-121 · backend",
    title: "Backend PR #59 — planner-outage fallback, observable ratings, log redaction",
    tag: "Week-2 branch feat/week-2-dan · BLO-121",
    url: "https://github.com/Bl0cksmiths/Orizon-Agents-BE-Stellar/pull/59",
    caption: [
      "The backend half of the Week-2 branch <code>feat/week-2-dan</code> (124 commits, merged 2026-09-18). <b>BLO-121:</b> when the planner (LLM) fails, the buyer now gets a fallback plan built from agents that passed the routing checks, flagged <code>planner_fallback: true</code>, instead of a 502. <b>Observable ratings:</b> <code>/readiness</code> gains the <code>ratings</code> field, the service logs at boot whether it can write ratings, and a failed rating names its cause. <b>Log redaction:</b> configured secrets and key-shaped strings are masked on every log line.",
    ],
    slices: [[0, 1618], [4450, 4530]],
    gaps: ["test-hygiene and verification notes and the 124-commit timeline omitted — all in the full-page PNG"],
  },
  {
    file: "07-fe-pr-62.png",
    short: "BLO-121 · frontend",
    title: "Frontend PR #62 — the plan card says when a plan is the planner fallback",
    tag: "Week-2 branch feat/week-2-dan · BLO-121",
    url: "https://github.com/Bl0cksmiths/Orizon-Agents-FE-Stellar/pull/62",
    caption: [
      "The frontend half of BLO-121 (34 commits, merged 2026-09-18). When the backend serves a fallback plan, the plan card shows a calm notice above Authorize and Simulate saying the planner was unavailable and the plan was built only from agents that passed the routing checks, with <b>“Ask the planner again”</b>, which re-runs the intent the buyer actually submitted. The description lists its own verification (unit, Playwright and axe checks); the merge commit shows 5 checks passed.",
    ],
    slices: [[0, 1268], [2945, 3030]],
    gaps: ["the 34-commit timeline and the Vercel preview comment omitted — both in the full-page PNG"],
  },
  {
    file: "08-uat-pr-3-rie-commits.png",
    short: "QA · rie-hash14",
    title: "UAT PR #3 — Rie’s Week-2 QA commits",
    tag: "QA · multi-contributor visibility",
    url: "https://github.com/Bl0cksmiths/Orizon-Agents-UAT-Stellar/pull/3/commits",
    caption: [
      "Rie’s Week-2 QA work in the public UAT repository, merged as PR #3 on 2026-09-17: <b>142 commits, 141 of them by <code>rie-hash14</code></b> (21 on 12 Sep, 50 on 16 Sep, 70 on 17 Sep) plus one merge of <code>main</code> by ALGOREX-PH. They add the UAT coverage for <b>6.02</b> (reputation floor), <b>6.05</b> (external dispatch) and <b>6.06</b> (operator surfaces), and the defect log entries <b>D-036 → D-049</b>.",
    ],
    slices: [[0, 790], [1760, 1998], [5056, 5298], [9587, 9725]],
    gaps: [
      "remaining 15 commits of 12 Sep omitted",
      "remaining 47 commits of 16 Sep omitted",
      "the 17 Sep commits in between omitted — every commit is in the full-page PNG",
    ],
  },
  {
    file: "09-be-pull-requests.png",
    short: "backend delivery",
    title: "Backend PRs merged 13–18 Sep 2026 (13)",
    tag: "Week-2 delivery · backend",
    url: "https://github.com/Bl0cksmiths/Orizon-Agents-BE-Stellar/pulls?q=is%3Apr+is%3Amerged+merged%3A2026-09-13..2026-09-18",
    caption: [
      "GitHub’s own search for backend PRs merged 13–18 Sep 2026 returns <b>13</b>, numbered #41 to #59, covering Epic 2 (2.01 endpoint binding, 2.02 verifiable bounded dispatch, 2.03 external step failure semantics, 2.04 reference-agent contract, 2.06 settlement evidence), Epic 3 (3.02 excluded agents and the floor, 3.03 routing-time reads) and the Week-2 branch.",
    ],
  },
  {
    file: "10-fe-pull-requests.png",
    short: "frontend delivery",
    title: "Frontend PRs merged 13–18 Sep 2026 (10)",
    tag: "Week-2 delivery · frontend",
    url: "https://github.com/Bl0cksmiths/Orizon-Agents-FE-Stellar/pulls?q=is%3Apr+is%3Amerged+merged%3A2026-09-13..2026-09-18",
    caption: [
      "The same search on the frontend returns <b>10</b>, numbered #48 to #62, including the 2.01 binding UI (#50), the 2.05 binding step in registration (#51), the 2.06 operator dashboard (#52), the 3.02 floor visibility contract (#54), the 3.04 plan card (#56) and the Week-2 branch (#62).",
    ],
  },
  {
    file: "11-contracts-pr-2.png",
    short: "3.07",
    title: "Contracts PR #2 — the deployed address book is tracked in git",
    tag: "Story 3.07",
    url: "https://github.com/Bl0cksmiths/Orizon-Agents-Smart-Contract-Stellar/pull/2",
    caption: [
      "Merged 2026-09-16. The contract repo’s record of what is deployed (<code>addresses.json</code> for testnet, <code>addresses.mainnet.json</code>) was git-ignored, so it existed only on the machine that last deployed. It is now <b>tracked in git</b>, giving story 3.07’s contract-id drift check a canonical file to compare the backend configuration against. The PR records that all five contract ids on both networks matched the backend’s <code>.env.example</code> when committed.",
    ],
  },
  {
    file: "12-reference-agent-repo.png",
    short: "2.04 · Epic 2",
    title: "The public reference external agent",
    tag: "Story 2.04 · Epic 2",
    url: "https://github.com/Bl0cksmiths/Orizon-Agents-Example-Agent-Stellar",
    caption: [
      "<code>Orizon-Agents-Example-Agent-Stellar</code>, created 2026-09-15: a copyable external agent in one file (<code>agent.py</code>, one dependency) that <b>verifies the signature on Orizon’s signed dispatches</b> before doing any work and answers with the response contract. Its README walks an operator through five steps — run, expose, bind, route, verify.",
    ],
    slices: [[0, 1460]],
    gaps: [],
    cropNote: "Shown: the top of the repository page; the rest of the README is in the full-page PNG.",
  },
  {
    file: "13-set-scorer-tx-stellar-expert.png",
    short: "on-chain ratings enabled",
    title: "set_scorer on the ReputationLedger — on-chain rating writes enabled for production",
    tag: "Deliverable D2 · verified by the BE #59 readiness check",
    after: "2026-09-19",
    url: "https://stellar.expert/explorer/testnet/tx/216e1b5f6ade4d75ec671bcda27b462bfd373d041b1ba2150d76002ee8d201f8",
    caption: [
      "A testnet admin transaction on <b>2026-09-19</b> (06:16:57 UTC, ledger 4755006, Successful), invoked by <code>GA7AI5…6R5OQV</code>: <code>set_scorer(GDB4…CDHP)</code> on the ReputationLedger (<code>CDCS…22ZT</code>).",
      "It makes the production backend’s key (<code>GDB4N25…</code>) the ledger’s authorized scorer, so <b>every paid run’s ratings are written on-chain</b> by production. The <code>ratings</code> check shipped in <code>/readiness</code> (BE #59, Evidence 05) verifies that match on every boot.",
    ],
  },
  {
    file: "14-week-2-x-post.png",
    short: "7.02 · published 2026-09-19",
    title: "Week-2 public build post on X",
    tag: "Story 7.02 · weekly public post",
    after: "Published 2026-09-19, 08:18 PHT",
    url: "https://x.com/OrizonAgents402/status/2101103657043255772",
    viaUrl: "https://platform.twitter.com/embed/Tweet.html?id=2101103657043255772",
    caption: [
      "The Week-2 build thread from <b>@OrizonAgents402</b>, published <b>2026-09-19 at 08:18 PHT</b> (00:18 UTC), with a 40-second video: “This week, we focused on making external agents actually work safely and making reputation part of the routing”.",
      "x.com shows a blank page to a logged-out automated browser, so this capture is X’s own embed view of the same post id (the second URL below).",
    ],
    maxWidth: "62%",
    bare: true, // the embed card draws its own border
  },
];

const COVER = {
  programme: "Stellar Community Fund — Blue Belt Instawards (Cohort 2026)",
  milestone: "M2 · Week 2 — Reputation-Gated Routing (Deliverable D2) + External Agent Execution Path (Epic 2)",
  week: "Mon 2026-09-14 → Fri 2026-09-18",
  network: "Stellar testnet only",
  team: [
    ["Danielle Bagaforo Meer", "lead engineer", "ALGOREX-PH"],
    ["Rieselle Saure (“Rie”)", "PM + QA", "rie-hash14"],
  ],
  contracts: [
    ["AgentRegistry", "CAPHXWU53UZUZJGV7IAE57NNMH3YYB5MTWO6YA53KKMXSFVLOITBJ3GQ"],
    ["ReputationLedger", "CDCSOBEVZUPQZV5GV4D6KYHZCLNGW2KXY74RUHSZ3EZUXF34DPW422ZT"],
    ["PaymentEscrow", "CBJPTMAPMGODGZCZ2IMEQSRUX3WGUXNMKDTNN2KMJ3NFGYZ5OJ5525PI"],
    ["AttestationRegistry", "CBYUZKOET43UXTBXZUJIBBJW5ODGD2J2AZVVXCR3QONGOCAHOXQQHEGK"],
    ["Asset SAC", "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC"],
  ],
};

// Written summary pages, placed between the cover and the evidence — the same
// role the write-up plays in the Week-1 PDF. Each entry is one A4 page.
const SUMMARY = [
  {
    eyebrow: "Summary · Week-2 delivery",
    title: "What we shipped in Week 2",
    html: `
  <p class="lead">This week we shipped the <b>external agent execution path</b> and <b>reputation-gated routing (Deliverable D2)</b>, both live on Stellar testnet at <a href="https://orizons.xyz">orizons.xyz</a>.</p>
  <h3>External agent execution path — Epic 2</h3>
  <ul>
    <li><b>Endpoint binding by wallet signature</b> (2.01, 2.05) — an operator attaches their service URL to their on-chain agent by signing a one-time challenge with the wallet that owns it, on its own or inside registration.</li>
    <li><b>Signed, bounded dispatch</b> (2.02) — every workflow step sent to an external agent is signed so the operator can verify it came from Orizon; unsafe URLs are refused and every step has a deadline and a size cap.</li>
    <li><b>Fair failure rules</b> (2.03) — a step that times out or returns unusable output is not charged and counts against the agent's reputation.</li>
    <li><b>Reference agent</b> (2.04) — a public, copyable example agent that runs from its README.</li>
    <li><b>Operator dashboard</b> (2.06) — each operator's agents, earnings and reputation in one place, with transaction links.</li>
  </ul>
  <h3>Reputation-gated routing — Epic 3 · Deliverable D2</h3>
  <ul>
    <li><b>A reputation floor on every plan</b> (3.01, 3.02) — every planning path reads each agent's on-chain reputation and applies the floor on its conservative lower bound.</li>
    <li><b>The trust signal before payment</b> (3.04) — the plan card shows each agent's reputation and its source, the floor applied, and any agent the floor acted on, with the reason.</li>
    <li><b>Honest reads</b> (3.03) — if reputation cannot be read from chain, the plan and the card say so.</li>
    <li><b>Marketplace standing</b> (3.05) — the floor stated once, on-chain agents marked, standing marks per agent.</li>
    <li><b>New agents are hireable on day one</b> (3.06) — a brand-new agent clears the floor by 177 bps, guaranteed by a test and a startup check.</li>
    <li><b>Contract addresses kept in agreement</b> (3.07) — checked daily and against the live deployment.</li>
    <li><b>On-chain ratings from production</b> — every paid run is rated, and <code>/readiness</code> verifies production is the ledger's authorized scorer.</li>
  </ul>
  <h3>Fixes and hardening</h3>
  <ul>
    <li>A planning-service outage now returns a fallback plan instead of an error (BLO-121).</li>
    <li>The floor holds after planning: a step survives only if its agent was offered to the planner.</li>
    <li>Secrets are masked in every log line; prices show the network's real currency (XLM); accessibility and mobile fixes across the app.</li>
  </ul>
  <h3>QA — Rie</h3>
  <ul>
    <li>End-to-end QA on testnet of the external execution path (6.05) and the operator surfaces (6.06), a reputation-floor test suite, and 14 defects logged and handed to engineering.</li>
  </ul>
  <div class="stats">
    <div><b>27</b><span>pull requests merged</span></div>
    <div><b>5</b><span>public repositories</span></div>
    <div><b>1,217</b><span>authored commits (Dan 1,080 · Rie 137)</span></div>
    <div><b>1,534</b><span>backend tests passing</span></div>
    <div><b>1,086</b><span>frontend tests passing</span></div>
  </div>`,
  },
  {
    eyebrow: "Summary · Stellar integration",
    title: "Stellar integration this week",
    html: `
  <p class="lead">All work runs on <b>Stellar testnet</b>.</p>
  <h3>SDKs and libraries</h3>
  <ul>
    <li><b>Backend</b> — Python <code>stellar-sdk</code> 13.2.1: builds unsigned XDR for wallets to sign, simulates, prepares and submits Soroban transactions, reads contract storage, verifies SEP-53 message signatures.</li>
    <li><b>Frontend</b> — <code>@stellar/stellar-sdk</code> 15.0.1 and <code>@creit.tech/stellar-wallets-kit</code> 2.1.0 for wallet connection and transaction / message signing.</li>
    <li><b>Reference agent</b> — verifies Orizon's SEP-53 dispatch signatures with PyNaCl (ed25519) and hand-rolled StrKey decoding, so operators need no Stellar SDK.</li>
  </ul>
  <h3>Soroban contracts</h3>
  <ul>
    <li><b>AgentRegistry</b> — <code>owner_of</code> gates endpoint binding; <code>set_active</code> delisting is honoured by routing; <code>register</code> for new agents.</li>
    <li><b>ReputationLedger</b> — batched, time-bounded <code>rep_state</code> reads feed the routing floor; <code>submit</code> records ratings; <code>/readiness</code> reads its storage via <code>getLedgerEntries</code> to confirm the authorized scorer.</li>
    <li><b>PaymentEscrow</b> — the buyer authorizes a workflow cap from their own wallet; the operator dashboard reads the escrow's on-chain events.</li>
    <li><b>AttestationRegistry</b> — sealer role assigned to the production key. <b>Native XLM SAC</b> — the escrow asset.</li>
  </ul>
  <h3>Wallet integration</h3>
  <ul>
    <li><b>Binding by signature</b> — the owner wallet signs a SEP-53 challenge naming the agent, endpoint and a nonce; a separately signed message revokes it.</li>
    <li><b>Signed dispatch</b> — every step is signed over SEP-53 by a dedicated keypair published as <code>dispatch_signer</code> (<code>GB5MKHDF…KCMR</code>).</li>
  </ul>
  <h3>Transactions (testnet)</h3>
  <table class="tx">
    <tr><th>Date</th><th>Call</th><th>Transaction hash</th></tr>
    <tr><td>09-17</td><td>AgentRegistry.set_active (delist)</td><td class="mono">a710b6776042d810fa1a41ec17cc0b299c606fc2a7f54bd28c129e20bbe6e8e4</td></tr>
    <tr><td>09-17</td><td>AgentRegistry.register (calculatorai)</td><td class="mono">0741a0822b6976f88a4582ffc65f1528004a9a5c3c544171e4be7ba099b1c8aa</td></tr>
    <tr><td>09-17</td><td>PaymentEscrow.authorize (0.168 XLM)</td><td class="mono">67701b46ef60bf488481464cf527aeadb01bb407cf294efc120c5f4ecc31e56d</td></tr>
    <tr><td>09-17</td><td>AgentRegistry.register (algorex)</td><td class="mono">7e3b6c02731906ddb685b080f11c63e0c1c2665a7bad0f0836bfa7ee5d83c872</td></tr>
    <tr><td>09-19</td><td>ReputationLedger.set_scorer</td><td class="mono">216e1b5f6ade4d75ec671bcda27b462bfd373d041b1ba2150d76002ee8d201f8</td></tr>
    <tr><td>09-19</td><td>AttestationRegistry.set_sealer</td><td class="mono">c965980fd06d5917bfa46fdefc72898422a3f50136e0ac4f487e4ed0f7a19a3c</td></tr>
  </table>
  <p class="small">Each hash opens at <span class="mono">stellar.expert/explorer/testnet/tx/&lt;hash&gt;</span>.</p>
  <h3>APIs</h3>
  <ul>
    <li><b>Soroban RPC</b> (<code>soroban-testnet.stellar.org</code>) — <code>simulateTransaction</code>, <code>sendTransaction</code>, <code>getLedgerEntries</code>, <code>getEvents</code>. <b>Horizon</b> testnet for transaction verification.</li>
    <li>The contract address book is tracked in git; a daily check and a 6-hourly production smoke test compare the live <code>/api/stellar/network</code> ids with it.</li>
  </ul>`,
  },
];

// ---------------------------------------------------------------- render ---

const kept = [];
for (const s of SHOTS) {
  const path = join(HERE, s.file);
  if (!existsSync(path)) {
    console.warn(`skip ${s.file}: not captured`);
    continue;
  }
  kept.push({ ...s, size: pngSize(path), at: capturedAt(path) });
}

function figure(s) {
  const { w, h } = s.size;
  const style = s.maxWidth ? ` style="max-width:${s.maxWidth}"` : "";
  if (!s.slices) {
    return `<div class="fig${s.bare ? " bare" : ""}" data-max="${s.maxWidth ?? "100%"}"${style}><img src="${esc(s.file)}" width="${w}" height="${h}" alt="${esc(s.title)}"></div>`;
  }
  const parts = [];
  s.slices.forEach(([y0, y1], i) => {
    const sh = y1 - y0;
    parts.push(
      `<div class="slice" style="aspect-ratio:${w} / ${sh}"><img src="${esc(s.file)}" width="${w}" height="${h}" alt="" style="top:${(-y0 / sh) * 100}%"></div>`,
    );
    if (i < s.slices.length - 1) parts.push(`<div class="gap">⋯ ${esc(s.gaps?.[i] ?? "omitted — see the full-page PNG")} ⋯</div>`);
  });
  return `<div class="fig sliced" data-max="100%">${parts.join("")}</div>`;
}

function evidencePage(s, i) {
  const n = String(i + 1).padStart(2, "0");
  const crop = s.slices
    ? s.cropNote ?? `Shown in excerpts (slices of the full-page capture, ${s.size.w} × ${s.size.h} px); nothing inside a slice is altered.`
    : "";
  return `
<section class="page">
  <div class="eyebrow"><span class="num">Evidence ${n}</span><span>${esc(s.tag)}</span></div>
  <h2>${esc(s.title)}</h2>
  ${s.after ? `<div class="after">${esc(s.after)}</div>` : ""}
  ${s.caption.map((p) => `<p>${p}</p>`).join("\n  ")}
  <dl class="meta">
    <dt>Source</dt><dd><a href="${esc(s.url)}">${esc(s.url)}</a></dd>
    ${s.viaUrl ? `<dt>Rendered via</dt><dd><a href="${esc(s.viaUrl)}">${esc(s.viaUrl)}</a></dd>` : ""}
    <dt>Captured</dt><dd>${esc(s.at)} · <span class="mono">screenshots/${esc(s.file)}</span>${crop ? ` · ${esc(crop)}` : ""}</dd>
  </dl>
  ${figure(s)}
</section>`;
}

function summaryPage(s) {
  return `
<section class="page summary">
  <div class="eyebrow"><span class="num">Summary</span><span>${esc(s.eyebrow)}</span></div>
  <h2>${esc(s.title)}</h2>
  ${s.html}
</section>`;
}

const cover = `
<section class="page cover">
  <div class="kicker">${esc(COVER.programme)}</div>
  <h1>Orizon Agents — Week 2 Tranche Submission</h1>
  <div class="sub">Proof of Deliverables</div>
  <table class="facts">
    <tr><th>Programme</th><td>${esc(COVER.programme)}</td></tr>
    <tr><th>Milestone</th><td>${esc(COVER.milestone)}</td></tr>
    <tr><th>Sprint week</th><td>${esc(COVER.week)}</td></tr>
    <tr><th>Network</th><td><b>${esc(COVER.network)}</b></td></tr>
    <tr><th>Team</th><td>${COVER.team.map(([n, r, g]) => `${esc(n)} — ${esc(r)} (GitHub <span class="mono">${esc(g)}</span>)`).join("<br>")}</td></tr>
    <tr><th>Evidence captured</th><td>2026-09-19, from the live testnet deployment and public GitHub / Stellar Expert pages. Each page states its source URL and capture time.</td></tr>
  </table>
  <h3>Deployed testnet contract ids</h3>
  <table class="ids">
    ${COVER.contracts.map(([k, v]) => `<tr><th>${esc(k)}</th><td class="mono">${esc(v)}</td></tr>`).join("\n    ")}
  </table>
  <h3>Evidence in this document</h3>
  <table class="toc">
    ${kept.map((s, i) => `<tr><td class="n">${String(i + 1).padStart(2, "0")}</td><td>${esc(s.title)}</td><td class="t">${esc(s.short)}</td><td class="p">p. ${i + 2}</td></tr>`).join("\n    ")}
  </table>
  <p class="note">Every page names the public URL it was captured from, so each claim can be checked live. On the plan-card and marketplace pages every agent carries the ≈3.50 starting estimate and clears the 2.75 routing floor, which each page states and applies.</p>
</section>`;

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Orizon Agents — Week 2 Proof of Deliverables</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
  @page { size: A4; margin: 12mm 15mm 16mm 15mm; }
  :root { --ink: #172033; --muted: #5b6475; --rule: #d5dbe6; --accent: #1d3f8f; --soft: #f3f6fb; --amber: #8a5300; --amber-bg: #fff4dc; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; }
  body { font-family: "Inter", "Ubuntu Sans", "DejaVu Sans", sans-serif; color: var(--ink); font-size: 9.6pt; line-height: 1.45; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .mono, code, .ids td { font-family: "JetBrains Mono", "Ubuntu Sans Mono", "DejaVu Sans Mono", monospace; }
  code { font-size: 0.9em; background: var(--soft); border: 1px solid #e3e8f1; border-radius: 3px; padding: 0 0.25em; white-space: nowrap; }
  a { color: var(--accent); text-decoration: none; }
  .page { width: 180mm; height: 268mm; overflow: hidden; display: flex; flex-direction: column; break-after: page; }
  .page:last-child { break-after: auto; }
  .eyebrow { display: flex; gap: 3mm; align-items: baseline; font-size: 7.6pt; letter-spacing: 0.06em; text-transform: uppercase; color: var(--muted); margin-bottom: 1.5mm; }
  .eyebrow .num { color: #fff; background: var(--accent); padding: 0.4mm 1.8mm; border-radius: 2px; font-weight: 600; }
  h2 { font-size: 15pt; line-height: 1.25; margin: 0 0 2.5mm; color: var(--accent); font-weight: 700; }
  p { margin: 0 0 2mm; }
  .after { align-self: flex-start; background: var(--amber-bg); color: var(--amber); border: 1px solid #f0d9a8; border-radius: 3px; font-weight: 600; font-size: 8.4pt; padding: 0.8mm 2.4mm; margin: 0 0 2.5mm; }
  .meta { display: grid; grid-template-columns: 20mm 1fr; gap: 0.6mm 3mm; margin: 1mm 0 3.5mm; padding: 2mm 3mm; background: var(--soft); border-radius: 3px; font-size: 7.8pt; color: var(--muted); }
  .meta dt { font-weight: 600; color: var(--ink); }
  .meta dd { margin: 0; overflow-wrap: anywhere; }
  .fig { margin: 0 auto; width: 100%; border: 1px solid var(--rule); border-radius: 3px; overflow: hidden; flex: none; }
  .fig > img { display: block; width: 100%; height: auto; }
  .fig.bare { border: 0; border-radius: 0; }
  .slice { position: relative; overflow: hidden; width: 100%; }
  .slice > img { position: absolute; left: 0; width: 100%; height: auto; display: block; }
  .gap { font-size: 7.2pt; color: var(--muted); text-align: center; padding: 1mm 2mm; background: repeating-linear-gradient(135deg, #f6f7fa 0 6px, #eceff5 6px 12px); border-top: 1px dashed #b9c2d3; border-bottom: 1px dashed #b9c2d3; }
  /* cover */
  .cover .kicker { font-size: 8pt; letter-spacing: 0.08em; text-transform: uppercase; color: var(--muted); margin-top: 2mm; }
  .cover h1 { font-size: 23pt; line-height: 1.15; margin: 3mm 0 1.5mm; color: var(--accent); font-weight: 700; }
  .cover .sub { font-size: 15pt; color: var(--ink); font-weight: 500; margin-bottom: 4mm; padding-bottom: 4mm; border-bottom: 2px solid var(--accent); }
  .cover h3 { font-size: 9.5pt; text-transform: uppercase; letter-spacing: 0.06em; color: var(--accent); margin: 4.5mm 0 1.5mm; }
  table { border-collapse: collapse; width: 100%; }
  .facts th, .ids th { text-align: left; vertical-align: top; font-weight: 600; white-space: nowrap; padding: 1mm 4mm 1mm 0; width: 34mm; }
  .facts td, .ids td { padding: 1mm 0; vertical-align: top; }
  .facts tr + tr th, .facts tr + tr td, .ids tr + tr th, .ids tr + tr td { border-top: 1px solid #e7ebf2; }
  .ids td { font-size: 8.3pt; }
  .toc td { padding: 0.75mm 0; vertical-align: baseline; border-top: 1px solid #eef1f6; font-size: 8.2pt; line-height: 1.3; }
  .toc .n { width: 7mm; color: var(--muted); font-family: "JetBrains Mono", monospace; }
  .toc .t { width: 44mm; padding-left: 3mm; font-size: 7.2pt; color: var(--muted); }
  .toc .p { width: 10mm; text-align: right; color: var(--muted); white-space: nowrap; }
  .note { margin-top: 3.5mm; font-size: 8pt; color: var(--muted); }
  /* summary pages */
  .summary { font-size: 8.9pt; line-height: 1.42; }
  .summary .lead { font-size: 10pt; margin: 0 0 1.5mm; }
  .summary h3 { font-size: 9.6pt; color: var(--accent); margin: 3.2mm 0 1mm; padding-bottom: 0.6mm; border-bottom: 1px solid var(--rule); }
  .summary ul { margin: 0; padding-left: 4.5mm; }
  .summary li { margin: 0 0 0.9mm; }
  .summary .small { font-size: 7.6pt; color: var(--muted); margin: 1mm 0 0; }
  .summary .tx th { text-align: left; font-size: 7.4pt; color: var(--muted); font-weight: 600; padding: 0.6mm 2mm 0.6mm 0; }
  .summary .tx td { font-size: 7.6pt; padding: 0.7mm 2mm 0.7mm 0; border-top: 1px solid #e7ebf2; vertical-align: top; }
  .summary .tx td.mono { font-size: 6.9pt; overflow-wrap: anywhere; }
  .stats { display: grid; grid-template-columns: repeat(5, 1fr); gap: 2mm; margin-top: 4mm; }
  .stats div { background: var(--soft); border-radius: 3px; padding: 2mm; text-align: center; }
  .stats b { display: block; font-size: 14pt; color: var(--accent); line-height: 1.1; }
  .stats span { display: block; font-size: 7pt; color: var(--muted); margin-top: 0.6mm; }
</style>
</head>
<body>
${cover}
${SUMMARY.map(summaryPage).join("\n")}
${kept.map(evidencePage).join("\n")}
<script>
  // Shrink each figure (keeping its aspect) until it fits the space left on
  // its page. Runs before printing; widths are in the same mm geometry as print.
  window.fitFigures = function () {
    const report = [];
    for (const page of document.querySelectorAll(".page")) {
      const fig = page.querySelector(".fig");
      if (!fig) continue;
      const max = parseFloat(fig.dataset.max) || 100;
      fig.style.width = max + "%";
      for (let i = 0; i < 6; i++) {
        const avail = page.getBoundingClientRect().bottom - fig.getBoundingClientRect().top - 2;
        const h = fig.getBoundingClientRect().height;
        if (h <= avail) break;
        const cur = (fig.getBoundingClientRect().width / page.clientWidth) * 100;
        fig.style.width = Math.max(20, cur * (avail / h) - 0.4) + "%";
      }
      report.push(Math.round((fig.getBoundingClientRect().width / page.clientWidth) * 100));
    }
    return report;
  };
</script>
</body>
</html>`;

writeFileSync(HTML, html);
console.log(`wrote ${HTML}`);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 900, height: 1200 } });
await page.goto(pathToFileURL(HTML).href, { waitUntil: "networkidle", timeout: 60000 });
await page.evaluate(() => document.fonts.ready);
await page.evaluate(() => Promise.all([...document.images].map((im) => im.decode().catch(() => {}))));
const widths = await page.evaluate(() => window.fitFigures());
console.log(`figure widths (% of text column): ${widths.join(", ")}`);
// A page whose text alone overflows would be clipped by overflow:hidden.
const overflow = await page.evaluate(() =>
  [...document.querySelectorAll(".page")].map((p, i) => (p.scrollHeight > p.clientHeight + 1 ? i + 1 : 0)).filter(Boolean),
);
if (overflow.length) console.warn(`WARNING overflowing pages: ${overflow.join(", ")}`);
await page.pdf({
  path: PDF,
  format: "A4",
  printBackground: true,
  preferCSSPageSize: true,
  displayHeaderFooter: true,
  headerTemplate: "<span></span>",
  footerTemplate: `<div style="width:100%;font-family:Inter,'DejaVu Sans',sans-serif;font-size:7.5px;color:#7a8394;padding:0 15mm;display:flex;justify-content:space-between"><span>Orizon Agents — Week 2 Tranche Submission · Proof of Deliverables · Stellar testnet</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`,
});
await browser.close();
const pages = (readFileSync(PDF).toString("latin1").match(/\/Type\s*\/Page[^s]/g) || []).length;
console.log(`wrote ${PDF} — ${pages} pages, ${(statSync(PDF).size / 1024 / 1024).toFixed(2)} MB (${kept.length} evidence pages + cover)`);
