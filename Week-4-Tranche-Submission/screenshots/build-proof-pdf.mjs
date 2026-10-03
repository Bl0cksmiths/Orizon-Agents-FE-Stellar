// Build Week-4-Tranche-Submission/Proof-of-Deliverables.pdf from the
// screenshots in this folder, the same way the Week-1 PDF was made: write an
// HTML document, then print it with Chromium (Playwright `page.pdf`).
// Run from the frontend repo root, after capture-screenshots.mjs:
//   node Week-4-Tranche-Submission/screenshots/build-proof-pdf.mjs
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

const esc = (s) =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

// PNG width/height from the IHDR chunk, so every <img> carries its aspect
// ratio before it loads and the fit pass measures real heights.
function pngSize(file) {
  const b = readFileSync(file);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

// Capture date in Manila time, from capture-meta.json (written by the capture
// script), falling back to the file's own time. The frames captured for the
// evidence index on 2026-09-30 are not in the meta file, and carry a
// `capturedNote` instead.
const META = existsSync(join(HERE, "capture-meta.json"))
  ? JSON.parse(readFileSync(join(HERE, "capture-meta.json"), "utf8"))
  : {};
function capturedAt(file) {
  const name = file.split("/").pop();
  const d = META[name]?.capturedAt
    ? new Date(META[name].capturedAt)
    : statSync(file).mtime;
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Manila",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })
      .formatToParts(d)
      .map((p) => [p.type, p.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute} PHT`;
}

// Tall pages are shown as vertical slices of the full-page PNG ([y0, y1] in
// source pixels, measured on the 1440-wide capture) so the text stays legible
// at A4 width. The gap label between two slices says what was left out; the
// full-page PNG is always named on the page.
const TOP = (h) => ({
  slices: [[0, h]],
  cropNote: `Top ${h.toLocaleString("en-US")} px of the capture shown; the full capture is the PNG named here.`,
});
const SHOTS = [
  {
    file: "01-contracts-pr-4-escrow-v2.png",
    short: "5.01 · contracts",
    title: "PaymentEscrow v2 — the contract that fixed the money path",
    tag: "Story 5.01 · contracts PR #4 · merged 2026-09-28",
    url: "https://github.com/Bl0cksmiths/Orizon-Agents-Smart-Contract-Stellar/pull/4",
    ...TOP(1500),
    caption: [
      "The v1 escrow could never settle a payment between two wallets: its <code>charge</code> moved the buyer's funds without the buyer's signature, so the network refused every one (defect D-039). <b>Escrow v2</b> takes custody of the buyer's authorized amount at <code>authorize</code>, under the buyer's own signature, then pays each delivered step's on-chain owner and returns the rest at <code>settle</code> — in one transaction.",
      "It also adds <code>reclaim</code> for a buyer whose authorization expired unsettled, and <code>set_settler</code> so the settling key can be rotated. The contracts carry 47 tests, none of them mocking authorization, so every signature is checked the way the network checks it.",
    ],
  },
  {
    file: "02-contracts-pr-6-escrow-v2-deployed.png",
    short: "5.01 · deploy",
    title: "Escrow v2 recorded as deployed on testnet",
    tag: "Story 5.01 · contracts PR #6 · merged 2026-09-30",
    url: "https://github.com/Bl0cksmiths/Orizon-Agents-Smart-Contract-Stellar/pull/6",
    caption: [
      'The contracts repository\'s address book now names escrow v2, <span class="mono">CCNO5TEN…5VC4</span>, with its settler and admin; the v1 id is kept as history. The deploy script read back <code>version = 2</code>, the settler and the admin before the record was written.',
      "The frontend pins the same id and checks it against this address book in CI, so the app and the contracts cannot silently disagree about which escrow is live.",
    ],
  },
  {
    file: "03-be-pr-88-settle-through-escrow-v2.png",
    short: "5.01 · backend",
    title: "Every paid run settles through escrow v2",
    tag: "Story 5.01 · backend PR #88 · merged 2026-09-28",
    url: "https://github.com/Bl0cksmiths/Orizon-Agents-BE-Stellar/pull/88",
    ...TOP(1500),
    caption: [
      "Each run now ends in one <code>settle</code> that pays only the steps that delivered and releases custody on every path that does not settle. Only a confirmed transaction counts, and each run reports its settlement state — settled, released, skipped, unconfirmed or failed — rather than a bare success flag.",
      "An authorization is bound to the caller and the plan it was signed for, so one signature buys one task. A testnet lifecycle harness drives whole runs and writes every transaction it sees, read back from the network, into the evidence files this bundle cites.",
    ],
  },
  {
    file: "04-fe-pr-89-escrow-v2-console.png",
    short: "5.01 · console",
    title: "The console says what the signature does",
    tag: "Story 5.01 · frontend PR #89 · merged 2026-09-28",
    url: "https://github.com/Bl0cksmiths/Orizon-Agents-FE-Stellar/pull/89",
    ...TOP(1500),
    caption: [
      "The Authorize step tells the buyer that the plan's maximum moves into escrow and the unused part comes back at settlement, checks their balance first, and shows the cap exactly. The receipt shows the settlement state and each step's payout with its Stellar Expert link, and offers Reclaim once an authorization has expired.",
    ],
  },
  {
    file: "05-fe-pr-97-guide-evidence-litepaper.png",
    short: "5.03–5.06",
    title: "The guide, the demo page, the evidence index and the litepaper",
    tag: "Stories 5.03–5.06 · frontend PR #97 · merged 2026-09-29",
    url: "https://github.com/Bl0cksmiths/Orizon-Agents-FE-Stellar/pull/97",
    ...TOP(1500),
    caption: [
      "The public face of Deliverable D4 in one integration PR: the <b>List your agent on Orizon</b> guide with every sample checked against the live API's schema, the demo page, the public evidence index with build-time validation and a live link checker, the litepaper published in four formats, and the MIT licence.",
      "It is large because it consolidates six story lanes and imports the litepaper with its own history; the per-PR figures and why are in the written bundle.",
    ],
  },
  {
    file: "06-example-agent-pr-6-fault-injection.png",
    short: "5.01 AC5",
    title: "A reference agent that can be told to fail",
    tag: "Story 5.01 AC5 · reference agent PR #6 · merged 2026-09-28",
    url: "https://github.com/Bl0cksmiths/Orizon-Agents-Example-Agent-Stellar/pull/6",
    ...TOP(1500),
    caption: [
      "Opt-in, off by default: <code>FAULT_MODE</code> makes the copyable reference agent hang, answer slowly or return errors after a set number of dispatches, so the failure paths — no payment for undelivered work, partial delivery, the reputation consequence — can be proven on testnet. It refuses to start in fault mode on any network but testnet, and announces itself when active. 85 tests; 23 deliberate mutations all caught.",
    ],
  },
  {
    file: "07-be-pull-requests-week4.png",
    short: "PR list · BE",
    title: "Backend: fourteen pull requests merged in the window",
    tag: "GitHub · merged 2026-09-27..10-03",
    url: "https://github.com/Bl0cksmiths/Orizon-Agents-BE-Stellar/pulls?q=is%3Apr+is%3Amerged+merged%3A2026-09-27..2026-10-03",
    caption: [
      "From #87 — Week-3 work merged at 02:04 on Monday in Manila — to #113, each with a green check. The table in the written bundle gives each one's branch, commits and diff size.",
    ],
  },
  {
    file: "08-fe-pull-requests-week4.png",
    short: "PR list · FE",
    title: "Frontend: twenty-three pull requests merged in the window",
    tag: "GitHub · merged 2026-09-27..10-03",
    url: "https://github.com/Bl0cksmiths/Orizon-Agents-FE-Stellar/pulls?q=is%3Apr+is%3Amerged+merged%3A2026-09-27..2026-10-03",
    caption: [
      "From #88 (Week-3 carry-over) to #122, the demo's publication, each with a green 5/5 check.",
    ],
  },
  {
    file: "09-uat-pr-5-rie-commits.png",
    short: "QA · commits",
    title: "Independent QA: 403 commits, every one by rie-hash14",
    tag: "UAT PR #5 · merged 2026-10-03",
    url: "https://github.com/Bl0cksmiths/Orizon-Agents-UAT-Stellar/pull/5/commits",
    ...TOP(1400),
    caption: [
      "Rie's Week-4 QA, in her own public repository: independent verification of every on-chain claim (6.04), the 6.02 re-check, the 6.03 re-run on escrow v2, 6.08 and 6.09, eight new Playwright specs, four tools that re-derive the evidence from the chain, and defects D-077 to D-092. 401 of the 403 commits touch exactly one file.",
    ],
  },
  {
    file: "10-orizons-home-live-stats.png",
    short: "live · home",
    title: "The home page shows measured figures only",
    tag: "orizons.xyz · live, 2026-10-03 08:08 UTC",
    url: "https://orizons.xyz/",
    caption: [
      "<b>590 registered agents, 565 external agents, 560 operator wallets</b>, read from the Stellar testnet registry. The placeholder statistics the page used to show are gone: every figure now comes from a source that can be checked, and the hero shows all three or none, never a partial count while the registry mirror refills.",
      "These are the live counter's figures. The registry contract's own event log records 22 registrations on 2026-10-01, 428 on 2026-10-02 and 104 by 05:25 UTC on 2026-10-03; the evidence index's wallet-by-wallet audit covers the registrations up to 2026-10-01.",
    ],
  },
  {
    file: "19-be-metrics-overview.png",
    short: "live · API",
    title: "The same figures from the API, read the same minute",
    tag: "GET /api/metrics/overview · live, 2026-10-03 08:08 UTC",
    url: "https://orizon-agents-be-stellar.onrender.com/api/metrics/overview",
    ...TOP(1100),
    caption: [
      "The response behind the hero: <code>registered 590</code>, <code>external 565</code>, <code>external_wallets 560</code>, and five workflows settled on 2026-09-30. Anything the service cannot read is returned as <code>null</code> with <code>degraded: true</code> rather than guessed.",
    ],
  },
  {
    file: "11-orizons-evidence-checklist.png",
    short: "live · evidence",
    title: "The public evidence index: every deliverable present",
    tag: "orizons.xyz/evidence · SOW §6.2 checklist",
    url: "https://orizons.xyz/evidence",
    caption: [
      "The index follows the SOW section by section and suggests a §6.2 marking for each deliverable from its items: D1 3 of 3, D2 3 of 3, D3 3 of 3, D4 5 of 5, Repositories &amp; Deployments 6 of 6 — all <b>Present</b>. The Chapter Lead decides; the page only suggests.",
    ],
  },
  {
    file: "12-orizons-evidence-metrics.png",
    short: "live · metrics",
    title: "Ten of ten success metrics met",
    tag: "orizons.xyz/evidence · SOW §6.3 metrics",
    url: "https://orizons.xyz/evidence",
    caption: [
      "Measured from the chain by a read-only generator. The SOW lists eleven metrics; metric m03 was removed from the sprint's requirements on 2026-09-30, and the index states that removal under its Disclosures. Each row's note says what it rests on — including that the three settlements are the team's own test runs and that the credit was the step's full charge.",
      'To fit the ten rows on one page, the "How measured" notes and the Proof column were hidden in the browser for this capture; both are on the live page.',
    ],
  },
  {
    file: "13-orizons-demo.png",
    short: "D4 · demo",
    title: "The demo, published in two parts",
    tag: "orizons.xyz/demo · Deliverable D4",
    url: "https://orizons.xyz/demo",
    ...TOP(1500),
    caption: [
      "4 min 20 s together: the operator's side (3 min 9 s, published 2026-10-02), registering an agent from a Freighter wallet, and the buyer's side (1 min 11 s), ordering, authorizing and receiving a workflow — <b>recorded on 2026-07-24 on an earlier console</b>, as the page says. Chapters are tagged with the deliverable they show, with captions and transcripts.",
    ],
  },
  {
    file: "14-orizons-demo-transactions.png",
    short: "D4 · tx list",
    title: "The demo's 14 verified sprint transactions",
    tag: "orizons.xyz/demo · On-chain evidence",
    url: "https://orizons.xyz/demo",
    caption: [
      "Neither video shows an escrow v2 settlement or a dispute on screen, so the page lists the sprint's own transactions beside them: three escrow v2 runs, each an authorization, a rating, a settlement and a seal, plus the dispute credit and the dispute rating — each re-read on the network on 2026-10-02 at 16:43 UTC. The Limitations below it state the rest plainly.",
    ],
  },
  {
    file: "15-orizons-guide-list-your-agent.png",
    short: "D4 · guide",
    title: "List your agent on Orizon",
    tag: "orizons.xyz/guide/list-your-agent · Deliverable D4",
    url: "https://orizons.xyz/guide/list-your-agent",
    ...TOP(1300),
    caption: [
      "From nothing to a routed, paid agent on testnet: wallet, friendbot, register, deploy, bind, readiness, reputation. Version 1.1.0, verified against the backend that runs escrow v2. It is labelled a draft until someone new to Orizon has followed it end to end.",
    ],
  },
  {
    file: "16-orizons-litepaper.png",
    short: "D4 · litepaper",
    title: "The litepaper, version 0.5",
    tag: "orizons.xyz/litepaper · SOW §5.1",
    url: "https://orizons.xyz/litepaper",
    ...TOP(1300),
    caption: [
      "Public as PDF, web page, Word and Markdown, with no account needed. §6, operations and governance, is rewritten for open registration and escrow v2, and the running-cost section is re-priced from the v2 runs.",
    ],
  },
  {
    file: "17-be-stellar-network.png",
    short: "live · network",
    title: "The live API is on testnet, with escrow v2",
    tag: "GET /api/stellar/network · live",
    url: "https://orizon-agents-be-stellar.onrender.com/api/stellar/network",
    caption: [
      '<code>network: testnet</code>, and <code>payment_escrow</code> is now <span class="mono">CCNO5TEN…5VC4</span>, escrow v2. The other three contracts are unchanged. <code>asset: native</code>: testnet settles in native XLM.',
    ],
  },
  {
    file: "18-be-readiness.png",
    short: "live · readiness",
    title: "Escrow version 2, refunds on, disputes durable",
    tag: "GET /readiness · live",
    url: "https://orizon-agents-be-stellar.onrender.com/readiness",
    caption: [
      "<code>escrow.version: 2</code>; the dispute store is Postgres, so a dispute survives a restart; the refund reconcile sweep is enabled and running; the platform's key is the ledger's authorized scorer; and the registry mirror is synced. In Week 3 the same deployment answered every uphold with <code>503 dispute_refunds_disabled</code>.",
    ],
  },
  {
    file: "20-escrow-v2-contract-stellar-expert.png",
    short: "chain · escrow",
    title: "Escrow v2 on Stellar Expert",
    tag: "Stellar Expert · testnet",
    url: "https://stellar.expert/explorer/testnet/contract/CCNO5TENCK3EK532I3OZLZ63323FEEULPAKJ74CUP3JZK3XQINRQ5VC4",
    ...TOP(1500),
    caption: [
      "Created 2026-09-30 08:31:12 UTC. Its history shows every <code>authorize</code> and <code>settle</code> in order, including the per-agent payouts of the team's runs that afternoon.",
    ],
  },
  {
    file: "21-settlement-tx-stellar-expert.png",
    short: "chain · settle",
    title: "The first settlement through escrow v2",
    tag: "Deliverable D4 · team run 1 · 2026-09-30",
    url: "https://stellar.expert/explorer/testnet/tx/f0674419992bdf30cf730139e54e4cdd985e32b43ee15c91733e08424a8d1235",
    caption: [
      "The platform's settler pays 0.01 XLM from custody to the agent's on-chain owner — the flow v1 could never complete. One of three settlements D4 asks for; the other two are linked in the written bundle, each with its authorization and attestation seal.",
      "<b>A team test run</b>: a team buyer key paid an agent the team operates. No outside operator has been paid yet.",
    ],
  },
  {
    file: "d2a-plan-card-onchain-score-desktop-1440.png",
    short: "D2 · live",
    title: "D2 live: on-chain reputation on the plan card",
    tag: "Deliverable D2 · orizons.xyz · captured 2026-09-30",
    capturedNote: "2026-09-30, from the live site, for the evidence index",
    url: "https://github.com/Bl0cksmiths/Orizon-Agents-FE-Stellar/blob/main/Week-4-Tranche-Submission/screenshots/d2a-plan-card-onchain-score-desktop-1440.png",
    ...TOP(1300),
    caption: [
      "Before the buyer pays, the plan card shows each agent's reputation read from the ReputationLedger. Captured from the live site on 2026-09-30 for the public evidence index, with no wallet connected.",
    ],
  },
  {
    file: "d2b-routing-exclusion-desktop-1440.png",
    short: "D2 · live",
    title: "D2 live: a sub-floor agent left out of the plan",
    tag: "Deliverable D2 · orizons.xyz · captured 2026-09-30",
    capturedNote: "2026-09-30, from the live site, for the evidence index",
    url: "https://github.com/Bl0cksmiths/Orizon-Agents-FE-Stellar/blob/main/Week-4-Tranche-Submission/screenshots/d2b-routing-exclusion-desktop-1440.png",
    ...TOP(1300),
    caption: [
      "A deliberately faulty test agent failed three paid runs on 2026-09-30; nothing was charged, and each failure wrote a 20/100 rating on-chain. Its lower-bound score, computed from those ratings, fell from 5,677 to 5,443 bps, below the 5,500 floor, and the next live plan left it out — saying so to the buyer.",
    ],
  },
  {
    file: "22-refund-tx-stellar-expert.png",
    short: "D3 · credit",
    title: "D3 live: the dispute credit",
    tag: "Deliverable D3 · 2026-09-30 15:25 UTC",
    url: "https://stellar.expert/explorer/testnet/tx/cb2c57929006470f9f554989dd8071e8539d245df529df956693944a78e1e25f",
    caption: [
      "The platform upheld a dispute on team run 3 and its signing key paid the buyer 0.01 XLM — the step's full charge, because the live credit share is set to 100%. A dispute credit is a separate transfer from the platform's own funds, not taken back from the agent's owner.",
    ],
  },
  {
    file: "23-dispute-rating-tx-stellar-expert.png",
    short: "D3 · rating",
    title: "D3 live: the dispute rating",
    tag: "Deliverable D3 · 2026-09-30 15:26 UTC",
    url: "https://stellar.expert/explorer/testnet/tx/b512135ffade2d6518fd8cf1628f20787846ed0e311750043b87723dee453a49",
    caption: [
      'The matching <code>kind="dispute"</code> rating on the ReputationLedger, which lowered the agent\'s score — the consequence that feeds the routing floor in D2. Together with the credit, the dispute transaction and its partial-refund transaction D3 asks for.',
    ],
  },
  {
    file: "d3c-dispute-refunded-desktop-1440.png",
    short: "D3 · receipt",
    title: "D3 live: the buyer's receipt, refunded",
    tag: "Deliverable D3 · orizons.xyz · captured 2026-09-30",
    capturedNote: "2026-09-30, from the live site, for the evidence index",
    url: "https://github.com/Bl0cksmiths/Orizon-Agents-FE-Stellar/blob/main/Week-4-Tranche-Submission/screenshots/d3c-dispute-refunded-desktop-1440.png",
    ...TOP(1400),
    caption: [
      "The live receipt for team run 3: settled, the dispute window, and the step's dispute receipt reading refunded, with the credit and the dispute rating each linked to Stellar Expert. A recording of the same receipt flipping from under review to refunded is beside this still in the folder.",
      "The dispute was opened by the team's test harness through the API, not with the receipt's Dispute button; QA keeps story 6.03 open until a recording uses the button.",
    ],
  },
  {
    file: "27-partial-delivery-settle-tx-stellar-expert.png",
    short: "5.01 AC5",
    title: "Partial delivery: only the delivered step is paid",
    tag: "Story 5.01 AC5 · 2026-09-30 17:47 UTC",
    url: "https://stellar.expert/explorer/testnet/tx/0ada07084b5aa1c196fb8e45b15d3712dcbefaf320a315a84e8cf2ab7adc556b",
    caption: [
      "A two-step plan authorized 0.21 XLM. One agent delivered; the other hung. This one settlement paid 0.01 XLM for the delivered step and returned 0.2 XLM to the buyer, and the seal carries only the delivered step's receipt — per-operator settlement, including the case where an operator fails.",
    ],
  },
  {
    file: "26-restart-dispute-refund-tx-stellar-expert.png",
    short: "5.01 AC4",
    title: "A dispute that survived a backend restart",
    tag: "Story 5.01 AC4 · 2026-09-30 18:03 UTC",
    url: "https://stellar.expert/explorer/testnet/tx/01c3175a881658808e15dc9a284439f2fbce4091a3566bfe3894ecedc1efa5be",
    caption: [
      "A run settled at 17:48; the backend was restarted and the task was gone from its memory. At 18:03 the buyer opened a dispute from the durable settlement record, and it was upheld and credited — this transfer. A buyer's 24-hour window does not end at the next restart, which a free-tier host performs whenever it idles.",
    ],
  },
  {
    file: "24-outside-registration-tx-stellar-expert.png",
    short: "D1 · D4",
    title: "An outside operator's registration",
    tag: "Deliverables D1 and D4 · 2026-09-29",
    url: "https://stellar.expert/explorer/testnet/tx/8a049b05dbf59956b2dc6cea96bd50baf4926a58d258ce66be8e74b4f1193bad",
    caption: [
      "<code>AgentRegistry.register</code> signed by the owner's own wallet, with no admin involved — the first of eleven outside registrations from seven wallets on 2026-09-29 and 2026-09-30 that the evidence index lists and links, two more than D4's minimum. None of the outside agents has yet run or been paid.",
    ],
  },
  {
    file: "25-contracts-issue-3-resolved.png",
    short: "Week 3 blocker",
    title: "Week 3's blocker, closed",
    tag: "Contracts issue #3 · D-039 · closed 2026-09-28",
    url: "https://github.com/Bl0cksmiths/Orizon-Agents-Smart-Contract-Stellar/issues/3",
    ...TOP(1300),
    caption: [
      "QA filed it on 2026-09-24: the v1 escrow's <code>charge</code> could not move a buyer's funds. It was closed by escrow v2 (contracts #4), and QA's register records it resolved on 2026-10-01, together with the other Week-3 blocker, refunds switched off on the deployment.",
    ],
  },
  {
    file: "28-uat-epic-6-status.png",
    short: "QA · verdict",
    title: "Independent QA's status, in her words",
    tag: "UAT sign-off report · 2026-10-02",
    url: "https://github.com/Bl0cksmiths/Orizon-Agents-UAT-Stellar/blob/main/docs/uat/signoff-report.md",
    caption: [
      '6.02 is GO, 6.03 is GO on its criteria, 6.04 is NO-GO, and "the epic is not ready to submit." <b>QA sign-off is pending</b>, and this submission does not claim it.',
      "Since this was written, the missing demo video (OV-05) was published and the outside registration hashes were linked on the evidence index, both awaiting her re-check. Still open: an outside operator's agent bound to a live endpoint (D-077), and the rest of her register, which the written bundle quotes in full.",
    ],
  },
];

const COVER = {
  programme: "Stellar Instawards (Cohort 2026)",
  milestone:
    "M4 · Week 4 — Ecosystem Validation Package (Deliverable D4, Epic 5)",
  week: "Mon 2026-09-28 → Fri 2026-10-02 (evidence assembled 2026-10-03)",
  network: "Stellar testnet only",
  team: [
    ["Danielle Bagaforo Meer", "lead engineer", "ALGOREX-PH"],
    ["Rieselle Saure (“Rie”)", "PM + QA", "rie-hash14"],
  ],
  contracts: [
    [
      "AgentRegistry",
      "CAPHXWU53UZUZJGV7IAE57NNMH3YYB5MTWO6YA53KKMXSFVLOITBJ3GQ",
    ],
    [
      "ReputationLedger",
      "CDCSOBEVZUPQZV5GV4D6KYHZCLNGW2KXY74RUHSZ3EZUXF34DPW422ZT",
    ],
    [
      "PaymentEscrow v2",
      "CCNO5TENCK3EK532I3OZLZ63323FEEULPAKJ74CUP3JZK3XQINRQ5VC4",
    ],
    [
      "AttestationRegistry",
      "CBYUZKOET43UXTBXZUJIBBJW5ODGD2J2AZVVXCR3QONGOCAHOXQQHEGK",
    ],
    ["Asset SAC", "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC"],
  ],
};

const SUMMARY = [
  {
    eyebrow: "Summary · Week-4 delivery",
    title: "What we shipped in Week 4",
    html: `
  <p class="lead">Week 4 is the week the money path came alive. A new payment escrow was written, deployed to Stellar testnet on 2026-09-30 and switched on — and the same day the live deployment settled paid runs, upheld a dispute and paid the credit, settled a partial delivery, and credited a dispute raised after a backend restart. On top of it, all six stories of <b>Deliverable D4 — the ecosystem validation package</b> shipped.</p>
  <h3>Escrow v2 — the fix for Week 3's blocker</h3>
  <p>The v1 escrow could never settle a payment between two wallets (defect D-039). Escrow v2 takes custody of the buyer's authorized amount under the buyer's own signature, pays each delivered step's on-chain owner and returns the rest in one transaction, lets a buyer reclaim an expired authorization, and lets the settling key be rotated. 47 contract tests, none mocking authorization.</p>
  <h3>The six Epic 5 stories, all merged to <code>main</code></h3>
  <ul>
    <li><b>5.01 — the settlement path on escrow v2</b>, end to end: contract, backend, console, and a reference agent that can be told to fail, so partial delivery could be proven live.</li>
    <li><b>5.02 — adoption metrics and operator onboarding</b>, computed from the chain with every team wallet excluded through a public register.</li>
    <li><b>5.03 — the "List your agent on Orizon" guide</b>, every sample checked against the live API.</li>
    <li><b>5.04 — the demo</b>, published in two parts, 4 min 20 s, beside the sprint's 14 verified transactions.</li>
    <li><b>5.05 — the public evidence index</b> at orizons.xyz/evidence: every deliverable item present, 10 of 10 metrics met.</li>
    <li><b>5.06 — the litepaper</b>, version 0.5, with §6 rewritten for open registration and escrow v2.</li>
  </ul>
  <h3>The week in numbers</h3>
  <ul>
    <li><b>42 pull requests</b> merged across the five public repositories; 2,718 commits landed on <code>main</code>.</li>
    <li><b>1,801 authored commits</b> by the lead engineer in the sprint week, 1,573 of them touching exactly one file; <b>403 authored commits</b> of independent QA work, 401 touching one file.</li>
    <li>Backend <b>4,038 tests</b> at 94.26% coverage; frontend <b>2,969 unit</b> and <b>446 end-to-end</b> tests; CI green on <code>main</code>. Every repository MIT-licensed.</li>
  </ul>`,
  },
  {
    eyebrow: "Summary · Deliverable D4 and D1–D3",
    title: "Where D4 stands, and D1–D3 now live",
    html: `
  <p class="lead">Every item SOW §6.1 asks of D4 is published and linked, and D1, D2 and D3 now have evidence produced by the deployed service itself.</p>
  <table class="tx">
    <tr><th>SOW item</th><th>Status</th></tr>
    <tr><td>3–5 min demo video, operator + buyer</td><td>Published — orizons.xyz/demo, two parts, 4 min 20 s</td></tr>
    <tr><td>"List your agent on Orizon" guide</td><td>Published — orizons.xyz/guide/list-your-agent, v1.1.0</td></tr>
    <tr><td>≥ 2 external registration tx hashes</td><td>11, from 7 outside wallets, each on Stellar Expert</td></tr>
    <tr><td>≥ 3 settlement tx hashes</td><td>3 team runs through escrow v2, plus 2 acceptance runs</td></tr>
    <tr><td>Litepaper, §6 updated (§5.1)</td><td>Published — orizons.xyz/litepaper, v0.5</td></tr>
  </table>
  <h3>D1–D3 on escrow v2</h3>
  <ul>
    <li><b>D1</b> — eleven registrations signed by outside operators' own wallets, no admin involved.</li>
    <li><b>D2</b> — the live plan card shows on-chain reputation; a faulty test agent failed three runs, fell below the floor and was left out of the next live plan.</li>
    <li><b>D3</b> — a dispute upheld on the deployment, its credit and its dispute rating on Stellar Expert, and a recording of the live receipt flipping to refunded.</li>
  </ul>
  <h3>Stated plainly</h3>
  <p>The settlements and dispute credits are <b>the team's own test runs</b> — team keys buying from agents the team operates, in testnet's native XLM — because no outside operator's agent is yet bound to a live endpoint that a paid run can reach. The SOW lists eleven metrics; metric m03 was removed from the sprint's requirements on 2026-09-30, and the evidence index says so. And <b>independent QA has not signed off</b>: her verdict on the evidence card is no-go; two of her blockers have been addressed since and await her re-check, and the rest of her register is open and public.</p>
  <p class="small">The written bundle sets all of this out with links: <span class="mono">Week-4-Tranche-Submission/03-deliverable-D4-ecosystem-validation.md</span>.</p>`,
  },
  {
    eyebrow: "Summary · Verification",
    title: "How to check any of this without trusting us",
    html: `
  <p class="lead">Every claim in this document resolves to something public: a merged pull request, a GitHub issue, a transaction on Stellar Expert, a live page or a live endpoint you can call yourself.</p>
  <h3>Live pages and endpoints</h3>
  <table class="tx">
    <tr><th>Check</th><th>Where</th></tr>
    <tr><td>Every deliverable item and metric, linked</td><td class="mono">orizons.xyz/evidence</td></tr>
    <tr><td>The demo and its 14 transactions</td><td class="mono">orizons.xyz/demo</td></tr>
    <tr><td>Network and contract ids, escrow v2</td><td class="mono">GET orizon-agents-be-stellar.onrender.com/api/stellar/network</td></tr>
    <tr><td>Escrow version, refunds, dispute store</td><td class="mono">GET orizon-agents-be-stellar.onrender.com/readiness</td></tr>
    <tr><td>The home page's live figures</td><td class="mono">GET orizon-agents-be-stellar.onrender.com/api/metrics/overview</td></tr>
  </table>
  <p class="small">The API runs on a free tier and sleeps; the first request can take up to a minute.</p>
  <h3>Key testnet transactions in this document</h3>
  <table class="tx">
    <tr><th>Artifact</th><th>Transaction hash</th></tr>
    <tr><td>First escrow v2 settlement</td><td class="mono">f0674419992bdf30cf730139e54e4cdd985e32b43ee15c91733e08424a8d1235</td></tr>
    <tr><td>Dispute credit</td><td class="mono">cb2c57929006470f9f554989dd8071e8539d245df529df956693944a78e1e25f</td></tr>
    <tr><td>Dispute rating</td><td class="mono">b512135ffade2d6518fd8cf1628f20787846ed0e311750043b87723dee453a49</td></tr>
    <tr><td>Partial-delivery settlement</td><td class="mono">0ada07084b5aa1c196fb8e45b15d3712dcbefaf320a315a84e8cf2ab7adc556b</td></tr>
    <tr><td>Credit after a backend restart</td><td class="mono">01c3175a881658808e15dc9a284439f2fbce4091a3566bfe3894ecedc1efa5be</td></tr>
    <tr><td>First outside registration</td><td class="mono">8a049b05dbf59956b2dc6cea96bd50baf4926a58d258ce66be8e74b4f1193bad</td></tr>
  </table>
  <p class="small">Each opens at <span class="mono">stellar.expert/explorer/testnet/tx/&lt;hash&gt;</span>.</p>
  <h3>Independent QA</h3>
  <p>QA works in its own public repository, <span class="mono">Bl0cksmiths/Orizon-Agents-UAT-Stellar</span>, with tools that re-derive our claims from the chain rather than from our API. This week it logged <b>16 defects</b> (D-077 to D-092), 15 as public GitHub issues. Its verdict on the evidence card is <b>no-go</b>, and this submission reports it as no-go.</p>
  <p class="small">Backend <span class="mono">github.com/Bl0cksmiths/Orizon-Agents-BE-Stellar</span> · frontend <span class="mono">…/Orizon-Agents-FE-Stellar</span> · contracts <span class="mono">…/Orizon-Agents-Smart-Contract-Stellar</span> · reference agent <span class="mono">…/Orizon-Agents-Example-Agent-Stellar</span> · QA <span class="mono">…/Orizon-Agents-UAT-Stellar</span>.</p>`,
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
  kept.push({
    ...s,
    size: pngSize(path),
    at: s.capturedNote ?? capturedAt(path),
  });
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
    if (i < s.slices.length - 1)
      parts.push(
        `<div class="gap">⋯ ${esc(s.gaps?.[i] ?? "omitted — see the full-page PNG")} ⋯</div>`,
      );
  });
  return `<div class="fig sliced" data-max="100%">${parts.join("")}</div>`;
}

function evidencePage(s, i) {
  const n = String(i + 1).padStart(2, "0");
  const crop = s.slices
    ? (s.cropNote ??
      `Shown in excerpts (slices of the full-page capture, ${s.size.w} × ${s.size.h} px); nothing inside a slice is altered.`)
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
  <h1>Orizon Agents — Week 4 Tranche Submission</h1>
  <div class="sub">Proof of Deliverables</div>
  <table class="facts">
    <tr><th>Programme</th><td>${esc(COVER.programme)}</td></tr>
    <tr><th>Milestone</th><td>${esc(COVER.milestone)}</td></tr>
    <tr><th>Sprint week</th><td>${esc(COVER.week)}</td></tr>
    <tr><th>Network</th><td><b>${esc(COVER.network)}</b></td></tr>
    <tr><th>Team</th><td>${COVER.team.map(([n, r, g]) => `${esc(n)} — ${esc(r)} (GitHub <span class="mono">${esc(g)}</span>)`).join("<br>")}</td></tr>
    <tr><th>Evidence captured</th><td>2026-10-03 — from the live site, the live testnet API, and public GitHub and Stellar Expert pages; four frames of the live receipt and plan card were captured from the live site on 2026-09-30 for the public evidence index. Every page states its source URL and when it was captured.</td></tr>
  </table>
  <h3>Deployed testnet contract ids</h3>
  <table class="ids">
    ${COVER.contracts.map(([k, v]) => `<tr><th>${esc(k)}</th><td class="mono">${esc(v)}</td></tr>`).join("\n    ")}
  </table>
  <h3>Evidence in this document</h3>
  <table class="toc">
    ${SUMMARY.map((s, i) => `<tr><td class="n">—</td><td>${esc(s.title)}</td><td class="t">summary</td><td class="p">p. ${i + 2}</td></tr>`).join("\n    ")}
    ${kept.map((s, i) => `<tr><td class="n">${String(i + 1).padStart(2, "0")}</td><td>${esc(s.title)}</td><td class="t">${esc(s.short)}</td><td class="p">p. ${i + 2 + SUMMARY.length}</td></tr>`).join("\n    ")}
  </table>
  <p class="note">Every page names the public URL it was captured from, so each claim can be checked live. Pages 21–26 are the shipped interface rendered locally against test fixtures, because the dispute path cannot be reached on the deployment yet; the transaction hashes in them exist on no ledger. The two Stellar Expert pages are real testnet transactions from QA's drill, not from the deployed service. Both limits are stated again on the pages themselves.</p>
  <style>.cover .toc td{padding:1.1px 4px;font-size:8.1px}.cover .toc .t{color:#7a8394}.cover .ids td,.cover .ids th{padding:1.6px 4px;font-size:8.2px}.cover .facts th,.cover .facts td{padding:2.4px 4px}.cover h3{margin:7px 0 3px}.cover .note{font-size:8px;line-height:1.35}</style>
</section>`;

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Orizon Agents — Week 4 Proof of Deliverables</title>
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
await page.goto(pathToFileURL(HTML).href, {
  waitUntil: "networkidle",
  timeout: 60000,
});
await page.evaluate(() => document.fonts.ready);
await page.evaluate(() =>
  Promise.all([...document.images].map((im) => im.decode().catch(() => {}))),
);
const widths = await page.evaluate(() => window.fitFigures());
console.log(`figure widths (% of text column): ${widths.join(", ")}`);
// A page whose text alone overflows would be clipped by overflow:hidden.
const overflow = await page.evaluate(() =>
  [...document.querySelectorAll(".page")]
    .map((p, i) => (p.scrollHeight > p.clientHeight + 1 ? i + 1 : 0))
    .filter(Boolean),
);
if (overflow.length)
  console.warn(`WARNING overflowing pages: ${overflow.join(", ")}`);
await page.pdf({
  path: PDF,
  format: "A4",
  printBackground: true,
  preferCSSPageSize: true,
  displayHeaderFooter: true,
  headerTemplate: "<span></span>",
  footerTemplate: `<div style="width:100%;font-family:Inter,'DejaVu Sans',sans-serif;font-size:7.5px;color:#7a8394;padding:0 15mm;display:flex;justify-content:space-between"><span>Orizon Agents — Week 4 Tranche Submission · Proof of Deliverables · Stellar testnet</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`,
});
await browser.close();
const pages = (
  readFileSync(PDF)
    .toString("latin1")
    .match(/\/Type\s*\/Page[^s]/g) || []
).length;
console.log(
  `wrote ${PDF} — ${pages} pages, ${(statSync(PDF).size / 1024 / 1024).toFixed(2)} MB (cover + ${SUMMARY.length} summary pages + ${kept.length} evidence pages)`,
);
