// Build Week-4-Tranche-Submission/Technical-Documentation-and-Demo-Evidence.pdf
// from the screenshots in this folder and in ../screenshots/, the same way the
// Week-3 document is made: write an HTML document, then print it with Chromium
// (Playwright `page.pdf`, A4), in the same typography and colours.
// Run from the frontend repo root, after capture.mjs and
// ../screenshots/capture-screenshots.mjs:
//   node Week-4-Tranche-Submission/technical-documentation/build-pdf.mjs
// Writes Technical-Documentation-and-Demo-Evidence.html next to this script
// (kept for inspection) and ../Technical-Documentation-and-Demo-Evidence.pdf.
//
// Screenshots are placed unaltered. A screenshot missing from either folder
// is skipped with a warning and its step stays text-only — never replaced by
// anything else. Every frame in this document is of the live deployment or a
// public page; unlike Week 3, there are no local fixture frames.
import { chromium } from "playwright";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const NAME = "Technical-Documentation-and-Demo-Evidence";
const HTML = join(HERE, `${NAME}.html`);
const PDF = join(HERE, "..", `${NAME}.pdf`);
const TITLE =
  "Orizon Agents — Week 4 · Technical Documentation & Demo Evidence";

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

const readJson = (path) =>
  existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : {};
// This folder's close-ups (shots.json) and the full-page frames the document
// borrows from ../screenshots/ (capture-meta.json), keyed by file name.
const MANIFEST = {
  ...readJson(join(HERE, "..", "screenshots", "capture-meta.json")),
  ...readJson(join(HERE, "shots.json")),
};
const baseName = (file) => file.split("/").pop();

// Capture time in Manila time, from the manifest (falls back to the file).
function capturedAt(file) {
  const entry = MANIFEST[baseName(file)];
  const d = entry?.capturedAt
    ? new Date(entry.capturedAt)
    : statSync(join(HERE, file)).mtime;
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
const BE_REPO = `${GH}/Orizon-Agents-BE-Stellar`;
const FE_REPO = `${GH}/Orizon-Agents-FE-Stellar`;
const UAT_REPO = `${GH}/Orizon-Agents-UAT-Stellar`;
const SC_REPO = `${GH}/Orizon-Agents-Smart-Contract-Stellar`;
const EA_REPO = `${GH}/Orizon-Agents-Example-Agent-Stellar`;
const BE_DOC = (path) => `${BE_REPO}/blob/main/${path}`;
const UAT_DOC = (path) => `${UAT_REPO}/blob/main/${path}`;
const EXPERT = "https://stellar.expert/explorer/testnet";
const SHOTS_DIR = "../screenshots/";
const FE_SHOT = (f) =>
  `${FE_REPO}/blob/main/Week-4-Tranche-Submission/screenshots/${f}`;

const CONTRACTS = [
  [
    "AgentRegistry",
    "CAPHXWU53UZUZJGV7IAE57NNMH3YYB5MTWO6YA53KKMXSFVLOITBJ3GQ",
    "agents and their owners · unchanged",
  ],
  [
    "ReputationLedger",
    "CDCSOBEVZUPQZV5GV4D6KYHZCLNGW2KXY74RUHSZ3EZUXF34DPW422ZT",
    "ratings, including dispute ratings · unchanged",
  ],
  [
    "PaymentEscrow v2",
    "CCNO5TENCK3EK532I3OZLZ63323FEEULPAKJ74CUP3JZK3XQINRQ5VC4",
    "custody, settlement, reclaim · new, live since 2026-09-30",
  ],
  [
    "AttestationRegistry",
    "CBYUZKOET43UXTBXZUJIBBJW5ODGD2J2AZVVXCR3QONGOCAHOXQQHEGK",
    "sealed run attestations · unchanged",
  ],
  [
    "Asset SAC — native XLM",
    "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
    "the escrow's payment asset on testnet",
  ],
];
const contractUrl = (id) => `${EXPERT}/contract/${id}`;
const ESCROW_V2 = CONTRACTS[2][1];

const txUrl = (hash) => `${EXPERT}/tx/${hash}`;
const tx = (hash, text) => `<a href="${txUrl(hash)}">${text}</a>`;
const short = (h) => `${h.slice(0, 8)}…${h.slice(-8)}`;

const TXS = [
  [
    "First escrow v2 settlement",
    "team run 1 · 0.01 XLM · B",
    "2026-09-30",
    "f0674419992bdf30cf730139e54e4cdd985e32b43ee15c91733e08424a8d1235",
  ],
  [
    "Second settlement",
    "team run 2 · 0.2 XLM",
    "2026-09-30",
    "19f3420ddb5232a8328c66ec57c1e34890d09a38350e172fdfd9ce8d04a83397",
  ],
  [
    "Third settlement",
    "team run 3 · 0.01 XLM",
    "2026-09-30",
    "785428bf6552208750b375703556c534da557dccd64df8d1db7f954a04ca554b",
  ],
  [
    "Dispute credit",
    "D3 · 0.01 XLM to the buyer · B",
    "2026-09-30",
    "cb2c57929006470f9f554989dd8071e8539d245df529df956693944a78e1e25f",
  ],
  [
    "Dispute rating",
    "D3 · on the ReputationLedger · B",
    "2026-09-30",
    "b512135ffade2d6518fd8cf1628f20787846ed0e311750043b87723dee453a49",
  ],
  [
    "Partial-delivery settlement",
    "5.01 AC5 · C",
    "2026-09-30",
    "0ada07084b5aa1c196fb8e45b15d3712dcbefaf320a315a84e8cf2ab7adc556b",
  ],
  [
    "Credit after a backend restart",
    "5.01 AC4 · C",
    "2026-09-30",
    "01c3175a881658808e15dc9a284439f2fbce4091a3566bfe3894ecedc1efa5be",
  ],
  [
    "First outside registration",
    "D1 / D4 · A",
    "2026-09-29",
    "8a049b05dbf59956b2dc6cea96bd50baf4926a58d258ce66be8e74b4f1193bad",
  ],
];

const PRS = [
  ["SC #4", "5.01 — PaymentEscrow v2", "2026-09-28", `${SC_REPO}/pull/4`],
  [
    "BE #88",
    "5.01 — settle through escrow v2",
    "2026-09-28",
    `${BE_REPO}/pull/88`,
  ],
  [
    "BE #94",
    "5.03–5.05 — demo tools, SOW metrics, MIT",
    "2026-09-29",
    `${BE_REPO}/pull/94`,
  ],
  [
    "BE #100",
    "5.01 AC4 — a dispute survives a restart",
    "2026-09-30",
    `${BE_REPO}/pull/100`,
  ],
  [
    "BE #101",
    "5.01 AC5 — partial delivery proved",
    "2026-09-30",
    `${BE_REPO}/pull/101`,
  ],
  [
    "FE #89",
    "5.01 — the console on escrow v2",
    "2026-09-28",
    `${FE_REPO}/pull/89`,
  ],
  [
    "FE #97",
    "5.03–5.06 — guide, demo, evidence, litepaper, MIT",
    "2026-09-29",
    `${FE_REPO}/pull/97`,
  ],
  [
    "FE #113",
    "measured figures on the console and home page",
    "2026-10-01",
    `${FE_REPO}/pull/113`,
  ],
  [
    "FE #122",
    "5.04 — the demo published in two parts",
    "2026-10-02",
    `${FE_REPO}/pull/122`,
  ],
  [
    "Agent #6",
    "5.01 AC5 — opt-in fault injection",
    "2026-09-28",
    `${EA_REPO}/pull/6`,
  ],
  [
    "UAT #5",
    "Rie’s Week-4 QA — 6.04, 6.02, 6.03, 6.08, 6.09",
    "2026-10-03",
    `${UAT_REPO}/pull/5`,
  ],
];

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
  layout.forEach((ids, i) =>
    PAGES.push({ kind: "walk", w, first: i === 0, steps: ids }),
  );
}

// The standing note on every page that shows a team test run.
const TEAM_RUN_NOTE = `
  <div class="warn">
    <b>These are the team's own test runs, on Stellar testnet.</b>
    Team buyer keys paid agents the team operates, in native XLM; no outside operator has been paid yet, because no outside operator's agent is yet bound to a live endpoint. Every transaction is real and successful on testnet, and links to Stellar Expert.
  </div>`;

// ---------------------------------------------------- links at a glance ---

PAGES.push({
  kind: "links",
  eyebrow: "At a glance · 1 of 2",
  title: "The live application, the API, the evidence and the repositories",
  lead: "Everything below is public. The application and the API run on Stellar testnet; the documentation lives in the public GitHub repositories. Nothing here needs a login.",
  groups: [
    {
      title: "Deliverable D4 — published, live",
      rows: [
        [
          "Evidence index",
          "every SOW item and metric, linked · E",
          `${SITE}/evidence`,
        ],
        ["Demo", "two parts, 4 min 20 s, 14 transactions · E", `${SITE}/demo`],
        [
          "List your agent on Orizon",
          "the operator guide · A",
          `${SITE}/guide/list-your-agent`,
        ],
        ["Litepaper", "v0.5, four formats", `${SITE}/litepaper`],
        ["Register an Agent", "open to any wallet · A", `${APP}/register`],
      ],
    },
    {
      title: "The live API",
      rows: [
        [
          "Network and contracts",
          "testnet, escrow v2 · C1",
          `${BE}/api/stellar/network`,
        ],
        [
          "Readiness",
          "escrow version, refunds, dispute store · C2",
          `${BE}/readiness`,
        ],
        [
          "Overview",
          "the home page's live figures · C3",
          `${BE}/api/metrics/overview`,
        ],
        ["Interactive API docs", "every route", `${BE}/docs`],
      ],
    },
    {
      title: "The five public repositories",
      rows: [
        ["Frontend", "the dApp (Next.js) · MIT", FE_REPO],
        ["Backend", "FastAPI + Soroban integration · MIT", BE_REPO],
        ["Smart contracts", "Soroban contracts, escrow v2 · MIT", SC_REPO],
        ["Reference agent", "for outside operators · MIT", EA_REPO],
        ["UAT suite", "independent QA · D", UAT_REPO],
      ],
    },
    {
      title: "Design records for escrow v2",
      rows: [
        [
          "Escrow v2 interface",
          "why v2, entry points · B",
          `${SC_REPO}/blob/main/docs/escrow-v2-interface.md`,
          "…/docs/escrow-v2-interface.md",
        ],
        [
          "ADR 0010",
          "custody at authorize, one settle per run · B",
          BE_DOC("docs/decisions/0010-escrow-v2-custody-settlement.md"),
          "…/decisions/0010-escrow-v2-custody-settlement.md",
        ],
        [
          "ADR 0011",
          "an authorization buys one plan",
          BE_DOC("docs/decisions/0011-execute-authorization-guard.md"),
          "…/decisions/0011-execute-authorization-guard.md",
        ],
        [
          "5.01 run evidence",
          "every run's transactions, read back",
          `${BE_REPO}/tree/main/docs/evidence/5.01`,
          "…/docs/evidence/5.01",
        ],
      ],
    },
  ],
});

PAGES.push({
  kind: "links",
  eyebrow: "At a glance · 2 of 2",
  title: "Contracts, transactions, pull requests and QA",
  lead: "Contracts and transactions open on Stellar Expert (testnet). Each link shows the full id or hash, so the page also works printed.",
  groups: [
    {
      title: "Stellar Expert — deployed contracts (testnet)",
      rows: CONTRACTS.map(([name, id, role]) => [
        name,
        role,
        contractUrl(id),
        id,
      ]),
    },
    {
      title: "Key testnet transactions in this document",
      note: "All real and successful on Stellar testnet. The settlements and credits are the team's own test runs.",
      html: `<table class="txs">
      <tr><th>Artifact</th><th>Date</th><th>Transaction (opens on Stellar Expert)</th></tr>
      ${TXS.map(([what, note, d, h]) => `<tr><td><b>${esc(what)}</b><span>${esc(note)}</span></td><td class="d">${d}</td><td class="h">${tx(h, h)}</td></tr>`).join("\n      ")}
  </table>`,
    },
    {
      title:
        "Merged this week — 42 pull requests; the ones this document cites",
      note: "Behind them: backend <b>4,038 tests at 94.26% coverage</b>, frontend <b>2,969 unit and 446 end-to-end tests</b>, contracts 47 tests, reference agent 85 — CI green on <code>main</code>. All 42 are listed in <code>05-pull-requests.md</code>.",
      html: `<table class="prs">
      ${PRS.map(([n, what, d, url]) => `<tr><td class="k">${a(url, esc(n))}</td><td>${esc(what)}</td><td class="r">${d}</td></tr>`).join("\n      ")}
  </table>`,
    },
  ],
});

// ------------------------------------------------------- walkthrough A ---

walkthrough(
  {
    id: "A",
    eyebrow: "Operator · Deliverables D1 and D4",
    title: "Listing an agent on Orizon, as an outside operator does",
    intro:
      "Anyone with a Stellar wallet can register an agent on Orizon — the registry needs only the owner's signature, no permission from us. Week 4 published the guide that takes a newcomer through it, and the figures that show who has.",
    steps: [
      {
        id: "A1",
        title: "Read the guide",
        open: `${SITE}/guide/list-your-agent`,
        go: "orizons.xyz/guide/list-your-agent",
        shot: `${SHOTS_DIR}15-orizons-guide-list-your-agent.png`,
        what: "the guide, top of page",
        max: 66,
        light: false,
        text: [
          "From nothing to a routed, paid agent on testnet: install a wallet, fund it from friendbot, choose an agent id, skills and price, register on the dApp or through the API, deploy an agent — the copyable reference agent is MIT-licensed — bind its endpoint, pass the readiness check, read the reputation. Every command sample is checked against the live API's schema before the page builds, and the page names the backend commit it was verified against.",
          "It is labelled a <b>draft</b>, honestly: the team has checked every step, but someone new to Orizon has not yet followed it end to end.",
        ],
      },
      {
        id: "A2",
        title: "Register — signed by the owner's own wallet",
        open: `${EXPERT}/tx/8a049b05dbf59956b2dc6cea96bd50baf4926a58d258ce66be8e74b4f1193bad`,
        go: "stellar.expert · the first outside registration",
        shot: `${SHOTS_DIR}24-outside-registration-tx-stellar-expert.png`,
        what: "Stellar Expert, testnet",
        max: 80,
        text: [
          "The first of eleven outside registrations, on 2026-09-29: <code>AgentRegistry.register</code>, signed by the owner's wallet, with no admin involved. The evidence index lists all eleven, from seven outside wallets, each checked against the public team wallet register. None of the outside agents has yet run or been paid. The demo's operator part records this same flow in Freighter, from form to confirmed transaction.",
        ],
      },
      {
        id: "A3",
        title: "See who else is on the network — measured, not invented",
        open: SITE,
        go: "orizons.xyz",
        shot: `${SHOTS_DIR}10-orizons-home-live-stats.png`,
        what: "the home page hero, live",
        max: 78,
        text: [
          `At 08:08 UTC on 2026-10-03 the hero read <b>590 registered agents, 565 external, 560 operator wallets</b>, and the API's overview gave the same figures the same minute (C3). The placeholder statistics the page once showed are gone; the hero shows all three figures or none.`,
          "These are the live counter's figures. The registry contract's own event log records 22 registrations on 2026-10-01, 428 on 2026-10-02 and 104 by 05:25 UTC on 2026-10-03; the evidence index's wallet-by-wallet audit covers the registrations up to 2026-10-01.",
        ],
      },
    ],
  },
  [["A1"], ["A2", "A3"]],
);

// ------------------------------------------------------- walkthrough B ---

walkthrough(
  {
    id: "B",
    eyebrow: "Buyer · escrow v2 · Deliverables D2, D3 and D4",
    title: "The money path on escrow v2",
    banner: TEAM_RUN_NOTE,
    intro:
      "Week 3's blocker was the escrow: v1 could never move a buyer's funds (D-039). Escrow v2 takes custody under the buyer's own signature at <code>authorize</code>, pays each delivered step's on-chain owner and returns the rest at <code>settle</code>, and lets the buyer <code>reclaim</code> an expired authorization. It went live on testnet on 2026-09-30; these steps follow a buyer through it on that day.",
    steps: [
      {
        id: "B1",
        title: "Why v2, in the contract repository's own words",
        open: `${SC_REPO}/blob/main/docs/escrow-v2-interface.md`,
        go: "contracts · docs/escrow-v2-interface.md",
        shot: "b1-escrow-v2-why.png",
        what: "the escrow v2 interface document",
        light: true,
        max: 80,
        text: [
          "Three independent faults in v1, and v2's answer to each: custody at <code>authorize</code>, payment to <b>each step's operator</b> at <code>settle</code>, and a settler the admin can rotate. The contracts now carry 47 tests, none of them mocking authorization.",
        ],
      },
      {
        id: "B2",
        title: "Before paying, the buyer sees each agent's on-chain reputation",
        open: FE_SHOT("d2a-plan-card-onchain-score-desktop-1440.png"),
        go: "captured 2026-09-30 · live site",
        shot: `${SHOTS_DIR}d2a-plan-card-onchain-score-desktop-1440.png`,
        capturedNote: "2026-09-30, from the live site, for the evidence index",
        what: "the live plan card",
        max: 74,
        text: [
          "Deliverable D2: the plan card shows each agent's reputation read from the ReputationLedger, before the buyer authorizes anything. Captured from the live site on 2026-09-30, with no wallet connected.",
        ],
      },
      {
        id: "B3",
        title: "A failing agent is left out of the next plan",
        open: FE_SHOT("d2b-routing-exclusion-desktop-1440.png"),
        go: "captured 2026-09-30 · live site",
        shot: `${SHOTS_DIR}d2b-routing-exclusion-desktop-1440.png`,
        capturedNote: "2026-09-30, from the live site, for the evidence index",
        what: "a live plan with an agent excluded",
        max: 74,
        text: [
          "A deliberately faulty test agent failed three paid runs. Nothing was charged; each failure wrote a 20/100 rating on-chain, and its lower-bound score, computed from those ratings, fell from 5,677 to 5,443 bps — below the 5,500 floor. The next live plan left it out, and told the buyer so.",
        ],
      },
      {
        id: "B4",
        title: "A paid run settles through escrow v2",
        open: txUrl(
          "f0674419992bdf30cf730139e54e4cdd985e32b43ee15c91733e08424a8d1235",
        ),
        go: "stellar.expert · the first v2 settlement",
        shot: `${SHOTS_DIR}21-settlement-tx-stellar-expert.png`,
        what: "Stellar Expert, testnet",
        max: 80,
        text: [
          "Team run 1, 09:29 UTC: the settler pays 0.01 XLM from custody to the agent's on-chain owner — the flow v1 could never complete. Runs 2 and 3 followed within ten minutes. All three settlements are in the links on page 3, and each run’s authorization and attestation seal is in 03-deliverable-D4-ecosystem-validation.md.",
        ],
      },
      {
        id: "B5",
        title: "The buyer disputes a step; the platform credits it",
        open: FE_SHOT("d3c-dispute-refunded-desktop-1440.png"),
        go: "captured 2026-09-30 · live site",
        shot: `${SHOTS_DIR}d3c-dispute-refunded-desktop-1440.png`,
        capturedNote: "2026-09-30, from the live site, for the evidence index",
        what: "the live receipt, dispute refunded",
        max: 70,
        text: [
          "Deliverable D3 on the deployment: the receipt for team run 3, settled, its window shown, and the step's dispute receipt reading refunded with both on-chain artifacts linked — the 0.01 XLM credit and the dispute rating. A recording of the receipt flipping from under review to refunded sits beside this still in the screenshots folder.",
          "The dispute was opened by the team's test harness through the API, not with the receipt's Dispute button; QA keeps story 6.03 open until a recording uses the button. The credit was the step's full charge, because the live credit share is set to 100%.",
        ],
      },
      {
        id: "B6",
        title: "The credit, on Stellar Expert",
        open: txUrl(
          "cb2c57929006470f9f554989dd8071e8539d245df529df956693944a78e1e25f",
        ),
        go: "stellar.expert · the dispute credit",
        shot: `${SHOTS_DIR}22-refund-tx-stellar-expert.png`,
        what: "Stellar Expert, testnet",
        max: 80,
        text: [
          "15:25 UTC: the platform's signing key transfers 0.01 XLM to the buyer. A dispute credit is a separate transfer from the platform's own funds — not taken back from the agent's owner, not drawn from the escrow — and the matching dispute rating (b512135f…) lowered the agent's score.",
        ],
      },
      {
        id: "B7",
        title: "The design record behind it",
        open: BE_DOC("docs/decisions/0010-escrow-v2-custody-settlement.md"),
        go: "backend · ADR 0010",
        shot: "b2-adr-0010-escrow-v2.png",
        what: "backend design record ADR 0010",
        light: true,
        max: 76,
        text: [
          "How the backend uses v2: payouts are exactly the delivered steps, each at its own price; a run that delivered nothing releases custody; receipts go into the attestation seal; and an outcome that is unknown is never retried, only confirmed — so custody is never stranded and nobody is paid twice.",
        ],
      },
    ],
  },
  [["B1", "B2"], ["B3"], ["B4", "B6"], ["B5"], ["B7"]],
);

// ------------------------------------------------------- walkthrough C ---

walkthrough(
  {
    id: "C",
    eyebrow: "Verify · live API and chain",
    title: "Verify the deployment and the chain yourself",
    intro:
      "Each of these is a GET anyone can make, or a public Stellar Expert page. The API runs on a free tier and sleeps; the first request can take up to a minute. Tinted lines in the boxes are the fields the text refers to; every value is the live response, re-indented only.",
    steps: [
      {
        id: "C1",
        title: "<code>GET /api/stellar/network</code> — testnet, and escrow v2",
        open: `${BE}/api/stellar/network`,
        go: "…/api/stellar/network",
        shot: "c1-api-network.png",
        what: "the live response",
        light: true,
        max: 62,
        text: [
          `<code>network: testnet</code>; <code>payment_escrow</code> is <span class="mono">CCNO5TEN…5VC4</span>, escrow v2; the other three contracts are unchanged; <code>asset: native</code> — testnet settles in native XLM.`,
        ],
      },
      {
        id: "C2",
        title:
          "<code>GET /readiness</code> — version 2, refunds on, disputes durable",
        open: `${BE}/readiness`,
        go: "…/readiness",
        shot: "c2-api-readiness.png",
        what: "the live response",
        light: true,
        max: 54,
        text: [
          "<code>escrow.version: 2</code>; the dispute store is Postgres, so a dispute survives a restart; the refund reconcile sweep is enabled and running; the platform's key is the ledger's authorized scorer; the registry mirror is synced. In Week 3 the same deployment answered every uphold with <code>503 dispute_refunds_disabled</code>.",
        ],
      },
      {
        id: "C3",
        title:
          "<code>GET /api/metrics/overview</code> — the home page's source",
        open: `${BE}/api/metrics/overview`,
        go: "…/api/metrics/overview",
        shot: `${SHOTS_DIR}19-be-metrics-overview.png`,
        what: "the live response, re-indented",
        light: true,
        max: 46,
        text: [
          "Registered 590, external 565, external wallets 560, and five settled workflows, all on 2026-09-30: the three team runs and the two acceptance runs in C5–C6. Anything the service cannot read comes back <code>null</code> with <code>degraded: true</code>, never a guess.",
        ],
      },
      {
        id: "C4",
        title: "Escrow v2's every call, in order",
        open: contractUrl(ESCROW_V2),
        go: "stellar.expert · escrow v2",
        shot: `${SHOTS_DIR}20-escrow-v2-contract-stellar-expert.png`,
        what: "Stellar Expert, testnet",
        max: 58,
        text: [
          "Created 2026-09-30 08:31:12 UTC. The History tab lists every <code>authorize</code> and <code>settle</code>, with the per-agent payouts of each settlement.",
        ],
      },
      {
        id: "C5",
        title: "Partial delivery pays only what was delivered (5.01 AC5)",
        open: txUrl(
          "0ada07084b5aa1c196fb8e45b15d3712dcbefaf320a315a84e8cf2ab7adc556b",
        ),
        go: "stellar.expert · the settlement",
        shot: `${SHOTS_DIR}27-partial-delivery-settle-tx-stellar-expert.png`,
        what: "Stellar Expert, testnet",
        max: 80,
        text: [
          "A two-step plan authorized 0.21 XLM; one agent delivered, the other hung. This one settlement paid 0.01 XLM for the delivered step and returned 0.2 XLM to the buyer, and the seal carries only the delivered step's receipt.",
        ],
      },
      {
        id: "C6",
        title: "A dispute that survived a backend restart (5.01 AC4)",
        open: txUrl(
          "01c3175a881658808e15dc9a284439f2fbce4091a3566bfe3894ecedc1efa5be",
        ),
        go: "stellar.expert · the credit",
        shot: `${SHOTS_DIR}26-restart-dispute-refund-tx-stellar-expert.png`,
        what: "Stellar Expert, testnet",
        max: 80,
        text: [
          "A run settled at 17:48 UTC; the backend restarted and lost the task from memory. At 18:03 the buyer opened a dispute from the durable settlement record, and it was upheld and credited — this transfer.",
        ],
      },
    ],
  },
  [["C1", "C2"], ["C3"], ["C4"], ["C5", "C6"]],
);

// ------------------------------------------------------- walkthrough D ---

walkthrough(
  {
    id: "D",
    eyebrow: "Independent QA · Rieselle Saure",
    title: "Independent QA: verifying our claims from the chain",
    intro:
      "QA works in its own public repository and this week took nothing the team publishes on trust: four new tools re-derive the evidence index's claims from Stellar itself, and new Playwright suites check the live site against them. 403 commits, every one hers, merged as UAT PR #5 on 2026-10-03.",
    steps: [
      {
        id: "D1",
        title: "Her status for the epic, in her words",
        open: UAT_DOC("docs/uat/signoff-report.md"),
        go: "UAT · docs/uat/signoff-report.md",
        shot: "d1-qa-epic-6-status.png",
        what: "QA's sign-off report, 2026-10-02",
        light: true,
        max: 80,
        text: [
          '6.02 is GO, 6.03 is GO on its criteria, 6.04 is NO-GO, and "the epic is not ready to submit." <b>QA sign-off is pending</b>, and this document does not claim it.',
          "Since she wrote it, the demo was published (her OV-05 and D-082) and the outside registration hashes were linked on the evidence index (D-089); both await her re-check. Still open: an outside operator's agent bound to a live endpoint (D-077), and the rest of her register — sixteen defects this week, D-077 to D-092, fifteen of them public GitHub issues, quoted in full in <code>01-tasks-completed.md</code>.",
        ],
      },
      {
        id: "D2",
        title: "Week 3's blocker, closed",
        open: `${SC_REPO}/issues/3`,
        go: "contracts issue #3",
        shot: `${SHOTS_DIR}25-contracts-issue-3-resolved.png`,
        what: "github.com · contracts issue #3",
        light: true,
        max: 58,
        text: [
          "QA filed D-039 on 2026-09-24: the v1 escrow could not move a buyer's funds. It was closed by escrow v2, and her register records it resolved on 2026-10-01 — with D-050 (no settlement record) and D-051 (refunds switched off), the Week-3 bundle's two blockers.",
        ],
      },
    ],
  },
  [["D1"], ["D2"]],
);

// ------------------------------------------------- the published package ---

PAGES.push({
  kind: "html",
  num: "Demo video",
  eyebrow: "Deliverable D4 · the demo",
  title: "The demo, published in two parts",
  toc: "Demo video — two parts, 4 min 20 s, with its 14 transactions",
  html: `
  <p class="lead">SOW §6.1 asks for a 3–5 minute demo video from the operator's and the buyer's side. It is published at ${a(`${SITE}/demo`, "orizons.xyz/demo")} in two parts, <b>4 min 20 s together</b>, each with chapters tagged by deliverable, captions and a transcript.</p>
  <table class="lt">
    <tr><th>Part 1 — the operator's side <span>· 3 min 9 s · published 2026-10-02</span></th><td>${a("https://www.youtube.com/watch?v=LM7iecSviSI")}</td></tr>
    <tr><th>Part 2 — the buyer's side <span>· 1 min 11 s · published 2026-07-24</span></th><td>${a("https://www.youtube.com/watch?v=6NfblJwVEXg")}</td></tr>
  </table>
  <div class="warn"><b>Stated on the page itself:</b> the buyer's part was recorded on 2026-07-24, on an earlier version of the console. Neither video shows an escrow v2 settlement or a dispute on screen; those are evidenced by the 14 sprint transactions the page lists beside the videos, each re-read on the network on 2026-10-02 at 16:43 UTC.</div>
  ${shot({ id: "demo", title: "The demo page", shot: `${SHOTS_DIR}14-orizons-demo-transactions.png`, what: "orizons.xyz/demo · On-chain evidence", max: 62, open: `${SITE}/demo` })}`,
});

PAGES.push({
  kind: "html",
  num: "Evidence index",
  eyebrow: "Deliverable D4 · the public evidence index",
  title: "Every deliverable present; ten of ten metrics met",
  toc: "The public evidence index — the §6.2 checklist and the §6.3 metrics",
  html: `
  <p class="lead">${a(`${SITE}/evidence`, "orizons.xyz/evidence")} follows SOW v4 section by section: each §6.1 deliverable's evidence type and description quoted, each item with a status and a link, a suggested §6.2 marking for the Chapter Lead — who decides — and the §6.3 metrics measured from the chain. The SOW lists eleven metrics; metric m03 was removed from the sprint's requirements on 2026-09-30, and the index states that removal under its Disclosures.</p>
  ${shot({ id: "checklist", title: "The §6.2 checklist summary", shot: `${SHOTS_DIR}11-orizons-evidence-checklist.png`, what: "orizons.xyz/evidence · §6.2", max: 84, open: `${SITE}/evidence` })}
  <p class="small">The metrics table, with each row's note — including that the settlements are the team's own test runs and that the credit was the step's full charge — is frame 12 of the screenshots folder and page 17 of the Proof of Deliverables.</p>`,
});

PAGES.push({
  kind: "html",
  num: "Still open",
  eyebrow: "Week 4 · what is not finished",
  title: "What is still open, stated plainly",
  toc: "What is still open — QA sign-off, outside payments, open defects",
  html: `
  <p class="lead">Deliverable D4's items are published and D1–D3 are evidenced on the deployment. Three things are not finished, and each is public.</p>
  <table class="flow steps">
    <tr><td class="k">QA sign-off</td><td>Pending. QA's verdict on the evidence card (6.04) is no-go; two of her blockers have been addressed since and await her re-check. Her register and her reports are public in ${a(UAT_REPO, "Orizon-Agents-UAT-Stellar")}.</td></tr>
    <tr><td class="k">An outside operator paid</td><td>No outside operator's agent is yet bound to a live endpoint that a paid run can reach (QA's D-077, ${a(`${BE_REPO}/issues/104`, "backend #104")}). Until one is, the settlements on the record are the team's own test runs.</td></tr>
    <tr><td class="k">Attestation lifetime</td><td>QA found the AttestationRegistry never extends its storage lifetime, so the seals would archive on 2026-10-07 (D-083, ${a(`${BE_REPO}/issues/107`, "backend #107")}).</td></tr>
    <tr><td class="k">Her other open defects</td><td>Each is a public issue — backend #104–#111, frontend #114–#119 — quoted in <code>01-tasks-completed.md</code> as she wrote them.</td></tr>
  </table>
  <div class="callout">
    <h4>Where this document's facts come from</h4>
    <p>Screenshots in this folder were captured on 2026-10-03 from the live API and public GitHub pages at 2x; pages that reference <code>../screenshots/</code> use the full-page frames of the Proof of Deliverables, captured the same afternoon, and three frames captured from the live site on 2026-09-30 for the evidence index. No wallet was connected and nothing was signed, paid or submitted for any of them.</p>
  </div>`,
});

// ----------------------------------------------------- render: figures ---

function shot(s) {
  if (!s.shot) return "";
  const path = join(HERE, s.shot);
  if (!existsSync(path)) {
    console.warn(`skip ${s.shot}: not captured — step ${s.id} is text-only`);
    return "";
  }
  const { w, h } = pngSize(path);
  const entry = MANIFEST[baseName(s.shot)] ?? {};
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
      const x = Math.max(0, r.x - 1),
        y = Math.max(0, r.y - 1);
      const x2 = Math.min(W, r.x + r.width + 1),
        y2 = Math.min(H, r.y + r.height + 1);
      // A box on the image's top or left edge is outlined inside itself, with
      // its number inside, so neither spills past the screenshot.
      const edge = x < W * 0.02 || y < H * 0.03 ? " in" : "";
      return `<span class="mk${edge}" style="left:${pct(x, W)};top:${pct(y, H)};width:${pct(x2 - x, W)};height:${pct(y2 - y, H)}"><i>${i + 1}</i></span>`;
    })
    .join("");
  const via = entry.via ? ` · rendered via ${a(entry.via)}` : "";
  // A fixture frame says so in its own caption, every time, and never links
  // out to a live address it did not come from.
  const src = entry.fixture
    ? `${esc(s.what ?? "screenshot")} · <b>local capture against test fixtures — not the deployment</b> · ${esc(entry.source ?? s.shot)} · captured ${esc(capturedAt(s.shot))}`
    : `${esc(s.what ?? "screenshot")} · ${a(url)}${via} · captured ${esc(s.capturedNote ?? capturedAt(s.shot))}`;
  const fig = entry.fixture
    ? `<span class="fig${s.light ? " light" : ""} fixture" style="aspect-ratio:${w} / ${h}"><img src="${esc(s.shot)}" width="${w}" height="${h}" alt="${esc(s.title)}">${marks}</span>`
    : `<a class="fig${s.light ? " light" : ""}" href="${esc(url)}" style="aspect-ratio:${w} / ${h}"><img src="${esc(s.shot)}" width="${w}" height="${h}" alt="${esc(s.title)}">${marks}</a>`;
  return `
  <div class="shot" data-max="${s.max ?? 100}"${entry.fixture ? ' data-fixture="1"' : ""}>
    ${fig}
    <div class="src">${src}</div>
  </div>`;
}

function step(s) {
  // `split` puts a tall, narrow screenshot beside its callout rather than
  // under it: stacked, the fit pass would shrink it past reading size.
  const body = s.split
    ? `<div class="twoup">${shot(s)}<div class="splitside">${s.after ?? ""}</div></div>`
    : `${shot(s)}\n  ${s.after ?? ""}`;
  return `
<div class="step">
  <div class="step-head"><span class="sn">${esc(s.id)}</span><h3>${s.title}</h3>${s.open ? `<a class="go" href="${esc(s.open)}">${esc(s.go ?? s.open.replace(/^https:\/\//, ""))} ↗</a>` : ""}</div>
  ${s.text.map((p) => `<p>${p}</p>`).join("\n  ")}
  ${body}
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
  ${w.banner ?? ""}
  ${p.steps.map((id) => step(STEPS[id])).join("\n")}
</section>`;
}

function linksPage(p) {
  const rows = (items) =>
    items
      .map(
        ([label, note, url, text]) =>
          `<tr><th>${label}${note ? ` <span>· ${note}</span>` : ""}</th><td>${a(url, esc(text ?? url))}</td></tr>`,
      )
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
  const linkPages = PAGES.map((p, i) =>
    p.kind === "links" ? i + 1 : 0,
  ).filter(Boolean);
  if (linkPages.length)
    toc.push(
      `<tr class="grp"><td colspan="2">Links at a glance — app, API, repositories, design records, contracts, transactions, PRs</td><td class="p">p. ${linkPages[0]}${linkPages.length > 1 ? `–${linkPages.at(-1)}` : ""}</td></tr>`,
    );
  const walks = [
    ...new Map(
      PAGES.filter((p) => p.kind === "walk").map((p) => [p.w.id, p.w]),
    ).values(),
  ];
  for (const w of walks) {
    toc.push(
      `<tr class="grp"><td colspan="2">Walkthrough ${esc(w.id)} — ${esc(w.title)}</td><td class="p">p. ${pageOf((p) => p.kind === "walk" && p.w.id === w.id)}</td></tr>`,
    );
    for (const s of w.steps)
      toc.push(
        `<tr><td class="n">${esc(s.id)}</td><td>${s.title}</td><td class="p">p. ${pageOf((p) => p.kind === "walk" && p.steps.includes(s.id))}</td></tr>`,
      );
  }
  for (const [i, p] of PAGES.entries())
    if (p.kind === "html")
      toc.push(
        `<tr class="grp"><td colspan="2">${esc(p.toc)}</td><td class="p">p. ${i + 1}</td></tr>`,
      );
  return `
<section class="page cover">
  <div class="kicker">Stellar Instawards (Cohort 2026)</div>
  <h1>${esc(TITLE)}</h1>
  <div class="sub">What shipped in Week 4 on Stellar testnet — escrow v2 and the money path working end to end, and the ecosystem validation package — how to verify it live, and, plainly, what is still open.</div>
  <table class="facts">
    <tr><th>Programme</th><td>Stellar Instawards (Cohort 2026) — Blue Belt Instaward Sprint</td></tr>
    <tr><th>Milestone</th><td>M4 · Week 4 — Ecosystem Validation Package (Deliverable <b>D4</b>, Epic 5)</td></tr>
    <tr><th>Sprint week</th><td>Mon 2026-09-28 → Fri 2026-10-02 · evidence assembled 2026-10-03</td></tr>
    <tr><th>Network</th><td><b>Stellar testnet only</b></td></tr>
    <tr><th>Team</th><td>Danielle Bagaforo Meer — lead engineer (GitHub <span class="mono">ALGOREX-PH</span>)<br>Rieselle Saure (“Rie”) — PM + QA (GitHub <span class="mono">rie-hash14</span>)</td></tr>
    <tr><th>This week</th><td>42 pull requests merged · 2,718 commits on <span class="mono">main</span> · 1,801 commits authored by the lead engineer in the sprint week, 403 by QA</td></tr>
    <tr><th>Live application</th><td>${a(SITE)} · API ${a(`${BE}/docs`)}</td></tr>
  </table>
  <h3>Contents</h3>
  <table class="toc">
    ${toc.join("\n    ")}
  </table>
  <p class="note"><b>How to read this.</b> Each step names the page to open, top right, and what to look for. Every URL here is a live link. Every screenshot is of the live deployment or a public GitHub or Stellar Expert page: the close-ups in this folder and the full-page frames borrowed from <span class="mono">../screenshots/</span> were captured on 2026-10-03, and three frames of the live plan card and receipt on 2026-09-30, for the public evidence index — each caption gives its own source and time. No wallet was connected and nothing was signed, paid or submitted for any of them. The settlements and dispute credits shown are the team's own test runs, in testnet XLM.</p>
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
  // Page cross-references are written as tokens above, because a walkthrough's
  // prose is built before the later pages are pushed. Resolve them against the
  // finished layout, and fail loudly on a token that names no page.
  const REFS = {
    video: PAGES.findIndex((p) => p.num === "Demo video") + 1,
    evidence: PAGES.findIndex((p) => p.num === "Evidence index") + 1,
    open: PAGES.findIndex((p) => p.num === "Still open") + 1,
  };
  const resolve = (h) =>
    h.replace(/\{\{p:(\w+)\}\}/g, (_, k) => {
      if (!REFS[k])
        throw new Error(`page reference {{p:${k}}} resolves to nothing`);
      return String(REFS[k]);
    });
  return resolve(`<!doctype html>
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
  .step-head .go { flex: 0 1 auto; max-width: 46%; text-align: right; font-size: 7.6pt; font-family: "JetBrains Mono", monospace; overflow-wrap: anywhere; }
  .step p { font-size: 9.1pt; line-height: 1.42; }
  .mref { display: inline-block; min-width: 3.9mm; height: 3.9mm; line-height: 3.9mm; border-radius: 2mm; background: var(--mark); color: #fff; font-size: 6.8pt; font-weight: 700; text-align: center; vertical-align: 0.2mm; padding: 0 0.6mm; }
  /* screenshots */
  .shot { flex: none; margin: 1.8mm auto 0; width: 100%; }
  .fig { position: relative; display: block; width: 100%; border: 1px solid #0f0a1f; background: #0b0716; }
  .fig.light { border-color: var(--rule); background: #fff; }
  .fig.fixture { border-color: var(--amber); border-width: 1.5px; }
  .fig > img { display: block; width: 100%; height: auto; }
  .mk { position: absolute; outline: 2px solid var(--mark); outline-offset: 1.5px; border-radius: 3px; box-shadow: 0 0 0 1.5px rgba(255,255,255,0.6); }
  .mk i { position: absolute; left: -3.4mm; top: -3.1mm; width: 4.2mm; height: 4.2mm; line-height: 4mm; border-radius: 50%; background: var(--mark); color: #fff; border: 1px solid #fff; font-style: normal; font-weight: 700; font-size: 7pt; text-align: center; }
  .mk.in { outline-offset: -3.5px; box-shadow: none; }
  .mk.in i { left: 1mm; top: 1mm; }
  .src { font-size: 6.9pt; color: var(--muted); margin-top: 0.8mm; line-height: 1.35; overflow-wrap: anywhere; }
  .twoup { display: flex; gap: 3mm; align-items: flex-start; margin-top: 1mm; }
  .twoup .shot { flex: 0 0 auto; min-width: 0; }
  .twoup .splitside { flex: 1 1 0; min-width: 0; }
  .twoup .splitside .callout { margin-top: 0; }
  .twoup .shot { margin-top: 0; }
  /* cover */
  .cover .kicker { font-size: 8pt; letter-spacing: 0.08em; text-transform: uppercase; color: var(--muted); margin-top: 2mm; }
  .cover h1 { font-size: 19.5pt; line-height: 1.16; margin: 2.5mm 0 1.6mm; color: var(--accent); font-weight: 700; }
  .cover .sub { font-size: 10.6pt; color: var(--ink); font-weight: 500; margin-bottom: 3mm; padding-bottom: 3mm; border-bottom: 2px solid var(--accent); }
  .cover h3, .links h3 { font-size: 9.2pt; text-transform: uppercase; letter-spacing: 0.06em; color: var(--accent); margin: 3.4mm 0 1.2mm; }
  table { border-collapse: collapse; width: 100%; }
  .facts th { text-align: left; vertical-align: top; font-weight: 600; white-space: nowrap; padding: 0.8mm 4mm 0.8mm 0; width: 32mm; font-size: 9.2pt; }
  .facts td { padding: 0.8mm 0; vertical-align: top; font-size: 9.2pt; }
  .facts tr + tr th, .facts tr + tr td { border-top: 1px solid #e7ebf2; }
  .toc td { padding: 0.2mm 0; vertical-align: baseline; border-top: 1px solid #eef1f6; font-size: 7.2pt; line-height: 1.2; }
  .toc tr.grp td { font-weight: 600; color: var(--accent); padding-top: 0.9mm; border-top: 1px solid var(--rule); }
  .toc .n { width: 9mm; color: var(--muted); font-family: "JetBrains Mono", monospace; padding-left: 2mm; }
  .toc .p { width: 14mm; text-align: right; color: var(--muted); white-space: nowrap; font-weight: 400; }
  .note { margin-top: 2.4mm; font-size: 7.4pt; color: var(--muted); line-height: 1.38; }
  /* link tables */
  .links .lead { color: var(--muted); font-size: 8.8pt; }
  .gnote { font-size: 7.4pt; color: var(--muted); margin: -0.6mm 0 0.8mm; line-height: 1.35; }
  .lt th { text-align: left; vertical-align: top; font-weight: 600; font-size: 8.2pt; padding: 0.85mm 3mm 0.85mm 0; width: 64mm; }
  .lt th span { font-weight: 400; color: var(--muted); font-size: 7.6pt; }
  .lt td { vertical-align: top; font-size: 7.3pt; padding: 1mm 0 0.85mm; overflow-wrap: anywhere; }
  .lt tr + tr th, .lt tr + tr td { border-top: 1px solid #e7ebf2; }
  .txs th { text-align: left; font-size: 7.4pt; color: var(--muted); font-weight: 600; padding: 0.6mm 3mm 0.6mm 0; }
  .txs td { font-size: 7.8pt; padding: 0.8mm 3mm 0.8mm 0; border-top: 1px solid #e7ebf2; vertical-align: top; }
  .txs td.h { font-family: "JetBrains Mono", monospace; font-size: 7.1pt; overflow-wrap: anywhere; padding-right: 0; }
  .txs td.d { white-space: nowrap; width: 18mm; font-family: "JetBrains Mono", monospace; font-size: 7.6pt; }
  .txs td span { display: block; color: var(--muted); font-size: 7.3pt; }
  .prs td { font-size: 7.5pt; padding: 0.55mm 3mm 0.55mm 0; border-top: 1px solid #e7ebf2; vertical-align: top; }
  .prs td.k { white-space: nowrap; width: 18mm; font-family: "JetBrains Mono", monospace; font-weight: 500; }
  .prs td.r { white-space: nowrap; width: 20mm; text-align: right; color: var(--muted); font-family: "JetBrains Mono", monospace; font-size: 7.4pt; padding-right: 0; }
  /* boxes */
  .callout { flex: none; margin-top: 3mm; padding: 2.4mm 3mm; background: var(--soft); border-left: 3px solid var(--accent); border-radius: 2px; font-size: 8.6pt; }
  .callout h4 { margin: 0 0 1.2mm; font-size: 9pt; color: var(--accent); }
  .callout.warnbox { background: var(--amber-bg); border-left-color: var(--amber); }
  .callout.warnbox h4 { color: var(--amber); }
  .callout p { font-size: 8.5pt; }
  .warn { flex: none; margin: 1.6mm 0 0; padding: 2.2mm 3mm; background: var(--amber-bg); border-left: 3px solid var(--amber); border-radius: 2px; font-size: 8.4pt; line-height: 1.4; }
  .warn b { color: var(--amber); }
  .flow td, .flow th { font-size: 8pt; padding: 0.75mm 2.5mm 0.75mm 0; vertical-align: top; text-align: left; border-top: 1px solid #e0e6f0; }
  .flow th { font-size: 7.4pt; color: var(--muted); font-weight: 600; border-top: 0; }
  .flow td.k { font-weight: 600; white-space: nowrap; }
  .flow td.n1 { width: 8mm; font-weight: 700; }
  .flow td.r { white-space: nowrap; color: var(--muted); font-family: "JetBrains Mono", monospace; font-size: 7.6pt; }
  .flow td span { display: block; color: var(--muted); font-size: 7.4pt; }
  .flow.steps td { font-size: 8.5pt; padding: 1.1mm 2.5mm 1.1mm 0; }
  .flow.steps td.k { width: 36mm; white-space: normal; color: var(--accent); }
  .small { font-size: 7.6pt; color: var(--muted); margin: 1.2mm 0 0; line-height: 1.4; }
  .callout .small { margin-top: 1.4mm; }
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
      for (let i = 0; i < 24; i++) {
        const over = page.scrollHeight - page.clientHeight;
        if (over <= 1) break;
        const total = shots.reduce((t, s) => t + s.querySelector(".fig").getBoundingClientRect().height, 0);
        const k = Math.max(0.3, (total - over - 3) / total);
        for (const s of shots) {
          const cur = (s.getBoundingClientRect().width / s.parentElement.clientWidth) * 100;
          s.style.width = Math.max(14, cur * k) + "%";
        }
      }
      report.push("p" + (n + 1) + ":" + shots.map((s) => Math.round((s.getBoundingClientRect().width / s.parentElement.clientWidth) * 100)).join("/"));
    }
    return report;
  };
  // Every fixture frame must sit on a page that carries the standing warning.
  window.checkFixtures = function () {
    return [...document.querySelectorAll(".page")]
      .map((p, i) => (p.querySelector('.shot[data-fixture]') && !p.querySelector(".warn") ? i + 1 : 0))
      .filter(Boolean);
  };
</script>
</body>
</html>`);
}

// ---------------------------------------------------------------- print ---

const html = documentHtml();
writeFileSync(HTML, html);
console.log(`wrote ${HTML}`);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 900, height: 1200 } });
await page.goto(pathToFileURL(HTML).href, {
  waitUntil: "networkidle",
  timeout: 60000,
});
await page.emulateMedia({ media: "print" });
await page.evaluate(() => document.fonts.ready);
await page.evaluate(() =>
  Promise.all([...document.images].map((im) => im.decode().catch(() => {}))),
);
const unmarked = await page.evaluate(() => window.checkFixtures());
if (unmarked.length) {
  console.error(
    `FIXTURE frames on pages without the standing warning: ${unmarked.join(", ")}`,
  );
  process.exitCode = 1;
}
const widths = await page.evaluate(() => window.fitPages());
console.log(`screenshot widths (% of text column): ${widths.join("  ")}`);
// A page whose content overflows would be clipped by overflow:hidden.
const overflow = await page.evaluate(() =>
  [...document.querySelectorAll(".page")]
    .map((p, i) => (p.scrollHeight > p.clientHeight + 1 ? i + 1 : 0))
    .filter(Boolean),
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
  footerTemplate: `<div style="width:100%;font-family:Inter,'DejaVu Sans',sans-serif;font-size:7.5px;color:#7a8394;padding:0 15mm;display:flex;justify-content:space-between"><span>Orizon Agents — Week 4 · Technical Documentation &amp; Demo Evidence · Stellar testnet</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`,
});
await browser.close();
const pages = (
  readFileSync(PDF)
    .toString("latin1")
    .match(/\/Type\s*\/Page[^s]/g) || []
).length;
console.log(
  `wrote ${PDF} — ${pages} pages (${PAGES.length} laid out), ${(statSync(PDF).size / 1024 / 1024).toFixed(2)} MB`,
);
