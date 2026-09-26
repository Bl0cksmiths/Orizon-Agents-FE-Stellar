// Build Week-3-Tranche-Submission/Technical-Documentation-and-Demo-Evidence.pdf
// from the screenshots in this folder, the same way the Week-2 document is
// made: write an HTML document, then print it with Chromium (Playwright
// `page.pdf`, A4), in the same typography and colours.
// Run from the frontend repo root, after capture.mjs:
//   node Week-3-Tranche-Submission/technical-documentation/build-pdf.mjs
// Writes Technical-Documentation-and-Demo-Evidence.html next to this script
// (kept for inspection) and ../Technical-Documentation-and-Demo-Evidence.pdf.
//
// Screenshots are placed unaltered. The numbered outlines on them are drawn
// by this document from the rectangles capture.mjs measured (shots.json). A
// screenshot missing from this folder is skipped with a warning and its step
// stays text-only — never replaced by anything else.
//
// Walkthrough A's six frames are local runs against the end-to-end suite's
// fixtures, not the deployment. Every one of them is marked `fixture: true`
// in shots.json; this builder refuses to place a fixture frame on a page that
// does not carry the standing warning, so the distinction cannot be lost by
// an edit here.
import { chromium } from "playwright";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const NAME = "Technical-Documentation-and-Demo-Evidence";
const HTML = join(HERE, `${NAME}.html`);
const PDF = join(HERE, "..", `${NAME}.pdf`);
const TITLE =
  "Orizon Agents — Week 3 · Technical Documentation & Demo Evidence";

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

const MANIFEST = existsSync(join(HERE, "shots.json"))
  ? JSON.parse(readFileSync(join(HERE, "shots.json"), "utf8"))
  : {};

// Capture time in Manila time, from the manifest (falls back to the file).
function capturedAt(file) {
  const d = MANIFEST[file]?.capturedAt
    ? new Date(MANIFEST[file].capturedAt)
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
const XPOST = "https://x.com/OrizonAgents402/status/2101103657043255772";
const XEMBED =
  "https://platform.twitter.com/embed/Tweet.html?id=2101103657043255772";

const CONTRACTS = [
  [
    "AgentRegistry",
    "CAPHXWU53UZUZJGV7IAE57NNMH3YYB5MTWO6YA53KKMXSFVLOITBJ3GQ",
    "agents, owners, delisting",
  ],
  [
    "ReputationLedger",
    "CDCSOBEVZUPQZV5GV4D6KYHZCLNGW2KXY74RUHSZ3EZUXF34DPW422ZT",
    "ratings, including the dispute rating",
  ],
  [
    "PaymentEscrow",
    "CBJPTMAPMGODGZCZ2IMEQSRUX3WGUXNMKDTNN2KMJ3NFGYZ5OJ5525PI",
    "x402 workflow caps and the charge",
  ],
  [
    "AttestationRegistry",
    "CBYUZKOET43UXTBXZUJIBBJW5ODGD2J2AZVVXCR3QONGOCAHOXQQHEGK",
    "sealed run attestations",
  ],
  [
    "Asset SAC — native XLM",
    "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
    "the configured asset, labelled USDC",
  ],
];
const contractUrl = (id) => `${EXPERT}/contract/${id}`;

const REFUND_TX =
  "a5baac432b582787df0a632b3bc12916c51e12575a8f77bf267fd45b728701b8";
const RATING_TX =
  "7138e4e36e47f4f4404b2212aad5584d2f8fb941b387da76acae4c3b4cc07184";
const DRILL_LEDGER = "CAFZBHEKKBPFR5RG33MJIMOLGXCP46E6ZGYBYISA3BCMVLY2H3RA5CRP";
const DRILL_SOURCE = "GA45ITAKDGISRHVKCRLZWOFZAE3QQJH34I3CZZZUSHJRFS72QLRJEGZ2";
const DEPLOY_SIGNER =
  "GDB4N25UYM3YNTTAWX7LSGI2P7OR62QZQXRNQWAGF5TFVENDKCTTCDHP";

const txUrl = (hash) => `${EXPERT}/tx/${hash}`;
const tx = (hash, text) => `<a href="${txUrl(hash)}">${text}</a>`;

const PRS = [
  [
    "BE #60",
    "4.02 — the dispute window, the dispute routes, and a durable settlement record",
    "2026-09-21",
    `${BE_REPO}/pull/60`,
  ],
  [
    "BE #61",
    "4.03 — partial-credit refund, review PR (stacked; did not reach main)",
    "2026-09-21",
    `${BE_REPO}/pull/61`,
  ],
  [
    "BE #62",
    "4.03 — the same work, landed on main",
    "2026-09-21",
    `${BE_REPO}/pull/62`,
  ],
  [
    "BE #63",
    "4.04 — negative on-chain rating for an upheld dispute",
    "2026-09-21",
    `${BE_REPO}/pull/63`,
  ],
  [
    "BE #64",
    "4.05 — settlement view for the dispute receipt",
    "2026-09-21",
    `${BE_REPO}/pull/64`,
  ],
  [
    "BE #65",
    "4.06 — what a dispute receipt needs to be truthful",
    "2026-09-22",
    `${BE_REPO}/pull/65`,
  ],
  [
    "BE #42",
    "chore — untrack evidence and ops docs",
    "2026-09-22",
    `${BE_REPO}/pull/42`,
  ],
  [
    "BE #75",
    "4.07 — Epic 4 hardening: money path, disclosure, settlement ratings",
    "2026-09-25",
    `${BE_REPO}/pull/75`,
  ],
  [
    "FE #65",
    "Week-2 evidence — Proof of Deliverables summary pages",
    "2026-09-21",
    `${FE_REPO}/pull/65`,
  ],
  [
    "FE #66",
    "Week-2 evidence — Technical Documentation PDF, 17 pages",
    "2026-09-21",
    `${FE_REPO}/pull/66`,
  ],
  [
    "FE #68",
    "4.05 — dispute action on the trace / receipt view",
    "2026-09-21",
    `${FE_REPO}/pull/68`,
  ],
  [
    "FE #69",
    "4.06 — dispute status and refund receipt display",
    "2026-09-22",
    `${FE_REPO}/pull/69`,
  ],
  [
    "FE #76",
    "4.07 — the receipt stops stating what it cannot show",
    "2026-09-25",
    `${FE_REPO}/pull/76`,
  ],
  [
    "UAT #4",
    "Rie’s Week-3 QA — seven 6.03 sub-suites, five drills, D-050 → D-076",
    "2026-09-26",
    `${UAT_REPO}/pull/4`,
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

// The standing warning carried by every page of Walkthrough A. Any page that
// places a `fixture: true` screenshot must carry it, and `shot()` throws if
// one does not.
const FIXTURE_BANNER = `
  <div class="warn">
    <b>These six frames are local runs against test fixtures, not the deployment.</b>
    They were captured on 2026-09-26 from the shipped interface at frontend commit <code>5105a8b</code>, served by <code>next dev</code> and answered entirely by the end-to-end suite’s stubs (<code>e2e/mocks.ts</code>).
    <b>Every transaction hash in them is a fixture: it exists on no ledger, and the Stellar Expert link beside it resolves to nothing.</b>
    No wallet was connected to anything real; nothing was signed, paid or submitted. They are evidence of the <i>interface</i> — never of a settlement, a refund or a rating having happened.
    The reason the deployment cannot show this path is on page {{p:outstanding}}.
  </div>`;

// ---------------------------------------------------- links at a glance ---

PAGES.push({
  kind: "links",
  eyebrow: "At a glance · 1 of 2",
  title:
    "The live application, the API, the repositories and the design records",
  lead: "Everything below is public. The application and the API run on Stellar testnet; the documentation lives in the public GitHub repositories. Nothing here needs a login.",
  groups: [
    {
      title: "Deployed application and backend API (live)",
      rows: [
        ["Orizon Agents", "the live dApp", SITE],
        [
          "Trace / receipt view",
          "where a dispute is raised · A",
          `${APP}/trace`,
        ],
        ["Interactive API docs", "the six dispute routes · C4", `${BE}/docs`],
        [
          "Network and contracts",
          "testnet, contract ids, asset · C1",
          `${BE}/api/stellar/network`,
        ],
        ["Readiness", "ratings writer · C2", `${BE}/readiness`],
        [
          "OpenAPI document",
          "routes and security schemes · C3",
          `${BE}/openapi.json`,
        ],
      ],
    },
    {
      title: "The five public repositories",
      rows: [
        ["Frontend", "the dApp (Next.js)", FE_REPO],
        ["Backend", "FastAPI + Soroban integration", BE_REPO],
        ["UAT suite", "independent QA · D", UAT_REPO],
        ["Smart contracts", "Soroban contracts — no change this week", SC_REPO],
        [
          "Reference agent",
          "for external operators — no change this week",
          EA_REPO,
        ],
      ],
    },
    {
      title: "Design records and the operator runbook for this epic",
      note: `All under ${a(`${BE_REPO}/blob/main/docs/`, "github.com/Bl0cksmiths/Orizon-Agents-BE-Stellar/blob/main/docs/")}; each row links the full address.`,
      rows: [
        [
          "Operator runbook",
          "disputes end to end · B",
          BE_DOC("docs/disputes.md"),
          "…/docs/disputes.md",
        ],
        [
          "ADR 0002",
          "partial-credit refund mechanism",
          BE_DOC("docs/decisions/0002-partial-credit-refund.md"),
          "…/decisions/0002-partial-credit-refund.md",
        ],
        [
          "ADR 0007",
          "the dispute window and the proof of payer",
          BE_DOC("docs/decisions/0007-dispute-window.md"),
          "…/decisions/0007-dispute-window.md",
        ],
        [
          "ADR 0008",
          "who may order a payout, and paying exactly once",
          BE_DOC("docs/decisions/0008-refund-execution.md"),
          "…/decisions/0008-refund-execution.md",
        ],
        [
          "ADR 0009",
          "the dispute rating and its replay guard",
          BE_DOC("docs/decisions/0009-dispute-rating.md"),
          "…/decisions/0009-dispute-rating.md",
        ],
      ],
    },
  ],
});

PAGES.push({
  kind: "links",
  eyebrow: "At a glance · 2 of 2",
  title:
    "Contracts, transactions, pull requests, QA — and where the demo video is not",
  lead: "Contracts and transactions open on Stellar Expert (testnet). Each link shows the full id or hash, so the page also works printed.",
  groups: [
    {
      title:
        "Stellar Expert — deployed contracts (testnet, unchanged this week)",
      rows: CONTRACTS.map(([name, id, role]) => [
        name,
        role,
        contractUrl(id),
        id,
      ]),
    },
    {
      title: "The two testnet transactions in this document",
      note: "Both are <b>real and confirmed</b>, and neither is Deliverable 3: they were produced by driving the real backend code against a <b>drill</b> ReputationLedger with a test asset, from a developer machine. Walkthrough C sets out exactly what they do and do not prove.",
      html: `<table class="txs">
      <tr><th>Artifact</th><th>Ledger</th><th>Transaction (opens on Stellar Expert)</th></tr>
      <tr><td><b>Refund transfer</b><span>drill asset UATUSD · C7</span></td><td class="d">4865810</td><td class="h">${tx(REFUND_TX, REFUND_TX)}</td></tr>
      <tr><td><b><code>kind="dispute"</code> rating</b><span>drill ReputationLedger · C8</span></td><td class="d">4865811</td><td class="h">${tx(RATING_TX, RATING_TX)}</td></tr>
  </table>`,
    },
    {
      title:
        "Merged this week — 14 pull requests, 1,295 commits, +45,936 / −1,152 on main",
      note: "Behind them: backend <b>2,177 tests at 92.53% line coverage</b> (the gate the 4.07 merge landed under, floor 82%) and frontend <b>1,503 unit and 149 end-to-end tests</b>, all passing, CI green on <code>main</code> in both. The frontend’s end-to-end tests run against a mocked backend with hashes that exist on no ledger — <b>test evidence, not on-chain evidence</b>, and the source of Walkthrough A’s frames.",
      html: `<table class="prs">
      ${PRS.map(([n, what, d, url]) => `<tr><td class="k">${a(url, esc(n))}</td><td>${esc(what)}</td><td class="r">${d}</td></tr>`).join("\n      ")}
  </table>`,
    },
    {
      title: "Independent QA, and the demo video",
      rows: [
        [
          "UAT repository",
          "Playwright suites, five drills, evidence · D",
          UAT_REPO,
        ],
        [
          "Defect register",
          "27 defects, D-050 → D-076 · D2",
          UAT_DOC("docs/uat/defects.md"),
          "…/docs/uat/defects.md",
        ],
        [
          "QA verdict on the dispute story",
          "no-go · D4",
          UAT_DOC("docs/uat/evidence/6.03-dispute-refund-rating.md"),
          "…/evidence/6.03-dispute-refund-rating.md",
        ],
        [
          "Demo video",
          "<b>there is no Week-3 video</b> — see page {{p:video}}",
          XPOST,
          "the Week-2 build post, labelled as Week 2’s",
        ],
      ],
    },
  ],
});

// ------------------------------------------------------- walkthrough A ---

walkthrough(
  {
    id: "A",
    eyebrow: "Buyer · Deliverable D3 — Dispute Window & Partial-Credit Refund",
    title: "The dispute path, as the buyer sees it",
    banner: FIXTURE_BANNER,
    intro:
      "When a paid workflow settles, its buyer has <b>24 hours</b> to dispute any single step of it. Proof is a signature from the wallet that paid — no account and no password. An upheld dispute credits part of that step’s charge back <b>from the platform’s own wallet</b>, and writes a permanent negative rating against the agent on the ReputationLedger. Six frames follow the whole path, including the one state this epic exists to get right.",
    steps: [
      {
        id: "A1",
        title: "The settlement, and the window that opens on it",
        open: `${APP}/trace?task=<task_id>`,
        go: "orizons.xyz/app/trace",
        shot: "local-01-dispute-action-open-window.png",
        what: "the receipt panel of the trace view (fixture data)",
        max: 78,
        text: [
          `Above the trace, a receipt panel states what was charged (0.063 USDC), who paid it, when it settled, and the charge and seal transactions. <b>DISPUTE WINDOW OPEN · 22h 59m left</b> carries the closing instant beside it — read from the settlement record, never recomputed (B6).`,
          `The terms are stated before any action: an upheld dispute credits <b>50%</b> of the step’s charge in this fixture, <b>paid by the platform and never clawed back from the agent</b>, and the platform decides, with no on-chain arbitration. Each delivered step then carries its own price, a <b>DISPUTE</b> button and what it would credit; the step that failed is marked <b>NOT CHARGED</b> — “Nothing was charged for this step, so there is nothing to dispute”.`,
          `The 50% here is the fixture’s policy (<code>credited_fraction: 0.5</code>), chosen so a figure on screen can only have been served by the policy and never hard-coded in the copy. The backend’s own shipped default is a <i>full</i> credit of the step.`,
        ],
      },
      {
        id: "A2",
        title: "Raising a dispute on one step, with a wallet signature",
        open: `${APP}/trace?task=<task_id>`,
        go: "orizons.xyz/app/trace",
        shot: "local-02-dispute-dialog.png",
        max: 72,
        what: "the dispute dialog (fixture data)",
        text: [
          `<b>Dispute step 2</b> names the step, what was charged for it and what would be credited if the dispute is upheld, then repeats the three terms, then takes a <b>mandatory written reason</b> (500 characters, counted). <b>SIGN AND SUBMIT</b> asks the wallet that paid to sign the message <code>orizon-dispute:v1:{job_id}:{step}:{nonce}</code> — domain-separated and covering the exact step, so a captured signature cannot be replayed against another step or another workflow. Signing costs nothing and sends no transaction.`,
          `Only the payer is offered this. A connected wallet that is not the payer sees no button and no <i>disabled</i> button — no action of any kind. <b>Nothing was signed for this frame</b>: the form was filled to show the enabled control, then closed.`,
        ],
      },
      {
        id: "A3",
        title: "An open dispute: a promise, not a payment",
        open: `${APP}/trace?task=<task_id>`,
        go: "orizons.xyz/app/trace",
        shot: "local-03-receipt-open-dispute.png",
        max: 76,
        what: "one step’s dispute receipt (fixture data)",
        text: [
          `The badge reads <b>UNDER REVIEW</b>, with when it was raised and when it last changed. The credit is stated as a promise and nothing more — “Up to 0.027 USDC <b>would</b> be credited … funded by the platform, not clawed back from the agent” — and the buyer’s own reason is shown back to them. <b>No transaction hash appears in this frame, because nothing has been paid.</b>`,
        ],
      },
      {
        id: "A4",
        title: "A credited dispute, with both artifacts confirmed on-chain",
        open: `${APP}/trace?task=<task_id>`,
        go: "orizons.xyz/app/trace",
        shot: "local-04-receipt-credited.png",
        max: 76,
        what: "one step’s dispute receipt (fixture data)",
        text: [
          `<b>REFUNDED</b>, and the sentence says what it cost each side: “you received 0.027 USDC, and it cost code.gen a dispute rating on its reputation”. Below it the two on-chain rows — <b>Refund transfer</b> and <b>Dispute rating against code.gen</b> — each <b>CONFIRMED ON STELLAR</b>, each with its hash painted in full and a link to Stellar Expert.`,
          `Hashes are printed whole, in monospace, wrapping: in a screen recording a link cannot be inspected, so the characters on screen are the only thing a reviewer can match against the explorer. <b>Both hashes here are fixtures and resolve to nothing.</b> Walkthrough C carries two real ones.`,
        ],
      },
      {
        id: "A5",
        title: "A credit recorded whose transfer has not confirmed",
        open: `${APP}/trace?task=<task_id>`,
        go: "orizons.xyz/app/trace",
        shot: "local-05-receipt-crediting-unconfirmed.png",
        max: 76,
        what: "one step’s dispute receipt (fixture data)",
        text: [
          `<b>This is the state the epic exists to get right.</b> The platform has recorded the credit, but the chain has not vouched for the transfer. The badge reads <b>REFUND IN PROGRESS</b> and never “Refunded”; the credit line stays a promise (“Up to 0.027 USDC <b>to be</b> credited”); and the <b>Refund transfer</b> row reads <b>NO TRANSACTION ON RECORD</b>, with no hash and no link, beside a dispute-rating row that <i>is</i> confirmed.`,
          `The sentence is explicit about what happens next: “the platform reconciles it by hand — you will not be paid twice, and will not be skipped.” That is the product face of B5: a timed-out transfer is never retried automatically, because the asset contract has no undo. Paying late is the deliberate trade against ever paying twice.`,
        ],
      },
      {
        id: "A6",
        title: "A rejection, with the platform’s reason",
        open: `${APP}/trace?task=<task_id>`,
        go: "orizons.xyz/app/trace",
        shot: "local-06-receipt-rejected.png",
        max: 76,
        what: "one step’s dispute receipt (fixture data)",
        text: [
          `<b>REJECTED</b>: “no credit was issued, code.gen’s reputation is unchanged, and the reason is below”. The buyer’s own reason is kept, and beneath it <b>WHY IT WAS REJECTED</b> carries the adjudicator’s own words. The note is mandatory on the reject route (1–500 characters) and is returned to the buyer, because a rejection with no explanation is worse than no dispute system at all. Opening a dispute proves nothing and costs the agent nothing until it is upheld.`,
          `No hash and no link appear in this frame, because nothing was paid. Independent QA found a real cost to the disclosure rule that protects this text — see D3 on page 18.`,
        ],
      },
    ],
  },
  [["A1"], ["A2"], ["A3", "A4"], ["A5", "A6"]],
);

// ------------------------------------------------------- walkthrough B ---

const CITATIONS = `
  <div class="callout">
    <h4>Where to check each safeguard</h4>
    <table class="flow">
      <tr><th>Safeguard</th><th>Source, on <code>main</code> of the backend repository</th><th>Design record</th></tr>
      <tr><td class="k">B1 · claim before signature</td><td><code>app/services/dispute_svc.py</code> <span>uphold</span> · <code>app/services/dispute_store.py</code> <span>claim_refund</span></td><td class="r">ADR 0008 D2</td></tr>
      <tr><td class="k">B2 · compare-and-set</td><td><code>app/services/dispute_store.py</code> <span>append_status(expected_status=…)</span></td><td class="r">ADR 0008 D2</td></tr>
      <tr><td class="k">B3 · clamp and ceiling</td><td><code>app/services/refund_svc.py</code> <span>creditable_for</span> · <code>app/config.py</code></td><td class="r">ADR 0008 D4, D5</td></tr>
      <tr><td class="k">B4 · door and switch</td><td><code>app/security.py</code> <span>require_adjudicator</span> · <code>app/config.py</code></td><td class="r">ADR 0008 D1</td></tr>
      <tr><td class="k">B5 · the chain confirms</td><td><code>app/services/refund_svc.py</code> · <code>app/services/dispute_svc.py</code> <span>_apply_rating</span></td><td class="r">ADR 0008 D3 · 0009 D3, D4</td></tr>
      <tr><td class="k">B6 · the window, stamped</td><td><code>app/services/execution_svc.py</code> <span>_record_settlement</span> · <code>dispute_store.py</code></td><td class="r">ADR 0007 D1, D3</td></tr>
    </table>
  </div>`;

walkthrough(
  {
    id: "B",
    eyebrow: "Technical · the money path and its safeguards",
    title:
      "The money path: six things that stop it paying twice, or paying at all",
    intro:
      "An upheld dispute is the only operation in this service that spends the <b>platform’s own balance</b> on a person’s say-so, with nothing on-chain to bound it. A server-signed charge can only ever spend an allowance the payer already authorised; a credit cannot. Everything below exists because of that asymmetry, and every claim names the file and the design record a reviewer can check it against.",
    steps: [
      {
        id: "B1",
        title: "The claim row is written before the signature",
        open: BE_DOC("docs/decisions/0008-refund-execution.md"),
        go: "github.com · ADR 0008, decision D2",
        shot: "b1-adr-0008-claim-before-signing.png",
        what: "ADR 0008, decision D2",
        light: true,
        max: 74,
        text: [
          `Upholding happens in a fixed order. The dispute is recorded <code>upheld</code>; then a <b>refund claim</b> is taken on it — a row in a table, keyed by the dispute id, so it survives a restart and only one caller can ever hold it; the dispute moves to <code>crediting</code>. <b>If the claim cannot be taken, nothing is signed at all.</b> Only then is the amount computed, checked against the ceiling, and the transfer signed.`,
          `Taking the claim and moving the dispute to <code>crediting</code> are <b>one statement</b>, not two, and concurrency is settled by the table’s primary key rather than by the status the statement read: the loser’s <code>ON CONFLICT DO NOTHING</code> returns nothing, and nothing returned means sign nothing. Two adjudicators clicking together, a retried request, a process redeployed mid-flight — all meet the same row. A repeat uphold of a <code>credited</code> dispute signs no transfer and returns the same refund hash.`,
        ],
      },
      {
        id: "B2",
        title: "The precondition is a clause of the statement that writes",
        open: BE_DOC("docs/decisions/0008-refund-execution.md"),
        go: "github.com · ADR 0008, decision D2",
        text: [
          `Every status transition on a dispute is a compare-and-set, and the comparison is not a read followed by a write. In the Postgres store, <code>append_status(…, expected_status=…)</code> spells the precondition as the final <code>WHERE</code> of the <code>INSERT … SELECT</code> that performs the transition: the write lands only while the dispute still reads the status the decision was computed from, and nothing comes back when it does not. The mutex-releasing <code>DELETE</code> in the same statement repeats the same clause, so it cannot fire for a transition that was refused.`,
          `<code>uphold</code> passes <code>expected_status="open"</code>, and <code>reject</code> does too. Losing the set is answered <code>409 adjudication_in_progress</code> or <code>409 dispute_not_open</code> — never absorbed. <b>Stated precisely:</b> this is a single-statement compare-and-set in the Postgres store. The in-memory fallback store holds the same contract by an ordinary check, which is safe there for a different reason, and which is one of several reasons <code>DATABASE_URL</code> must be set in production (page {{p:path}}, step 5).`,
        ],
      },
      {
        id: "B3",
        title:
          "The three-way clamp, and a hard ceiling before anything is signed",
        open: BE_DOC("docs/disputes.md"),
        go: "github.com · docs/disputes.md",
        shot: "b2-disputes-runbook-credit.png",
        what: "the operator runbook, on what an upheld dispute pays",
        light: true,
        max: 74,
        text: [
          `What is transferred is the <b>smallest of three numbers</b>: the amount frozen on the dispute when it was opened, so the buyer is never paid less than they were shown and never more; the step’s price times the policy fraction in force at adjudication, so the stated policy is honoured; and what the workflow’s charge <i>actually moved on-chain</i>, so the platform never refunds money it did not collect. With the shipped policy they are normally the same number. Each clamp that bites is logged.`,
          `Above that sits a hard ceiling: a credit over <code>MAX_REFUND_USDC</code> (shipped at <code>1.0</code>) is <b>refused outright, before any transaction is built</b>. It is enforced in the one function that produces a refund amount, so no amount exists that has not been through it — and a non-finite amount is refused first, because a comparison cannot refuse a NaN. The ceiling is deliberately separate from the charge cap: one bounds what a <i>buyer</i> authorised themselves to spend, the other what the <i>platform</i> pays out of its own wallet. Independent QA’s D-054 is that a non-finite value of the <i>setting</i> still removes the ceiling — open at this build.`,
        ],
      },
      {
        id: "B4",
        title: "The adjudication door fails closed, and the switch ships off",
        open: BE_DOC("docs/disputes.md"),
        go: "github.com · docs/disputes.md",
        text: [
          `<code>uphold</code> and <code>reject</code> are <b>the only two routes in the service that fail closed</b>. Every other route treats an unset <code>API_KEY</code> as “the demo is open”; these two treat it as <i>refuse</i>, on every network including testnet, and they refuse while <code>DISPUTE_REFUNDS_ENABLED</code> is false — <b>the shipped default</b>. The key is compared in constant time, and an absent header can never match an unset secret.`,
          `Turning the switch on without a key is not a silent weakness: <code>DISPUTE_REFUNDS_ENABLED=true</code> alone makes the process <b>refuse to start</b> unless <code>API_KEY</code> is set, and the error says why. There is no order of setting the two in which the rule does not bite. The switch is checked twice — at the route and again inside the service — because an operator script that imports the service credits a buyer without passing through the web framework at all, and a switch only one door honours is not a switch. The live deployment’s answer today is on page 14.`,
        ],
      },
      {
        id: "B5",
        title: "Nothing reads as done until the chain confirms it",
        open: BE_DOC("docs/disputes.md"),
        go: "github.com · docs/disputes.md",
        shot: "b3-disputes-runbook-operators.png",
        what: "the operator runbook, on where the records live",
        light: true,
        max: 70,
        text: [
          `A dispute becomes <code>credited</code> only on an exact success <i>with a hash</i>. A definitive failure releases the claim and returns the dispute to <code>upheld</code>, payable again — a buyer who was not paid stays payable. A <b>timeout is never retried</b>: the dispute stays in <code>crediting</code> with the in-flight hash recorded, for a person to reconcile against the chain. That is A5 on screen.`,
          `On the rating side the distinction is a field, not careful wording: <code>rating_confirmed</code> is true only once the ledger has vouched for the submission, and a hash recorded for a submission that timed out sets it false. A failed rating never touches the refund — the buyer keeps the credit. One honest asymmetry, and the hardening PR lists it as not-in-this-pass: there is <b>no matching <code>refund_confirmed</code> field</b>; the interface reads an unconfirmed refund from the absence of a recorded transfer instead, which is the row A5 shows.`,
        ],
      },
      {
        id: "B6",
        title: "The window is stamped on the settlement, never recomputed",
        open: BE_DOC("docs/decisions/0007-dispute-window.md"),
        go: "github.com · ADR 0007, decision D1",
        shot: "b4-adr-0007-window-stamped.png",
        what: "ADR 0007, decision D1",
        light: true,
        max: 74,
        text: [
          `<code>SettlementRecord.window_closes_at</code> is written <b>once</b>, at settlement, from the value of <code>DISPUTE_WINDOW_SECONDS</code> (shipped at <code>86400.0</code>) in force at that instant. Every later check compares against that stored field. Across the whole service there is exactly one place the arithmetic happens, and every other reference reads the field.`,
          `That is the difference between a promise and a setting. Recomputed on read, retuning the window would silently move deadlines for work already done — shortening it closes windows a buyer was told were open; lengthening it reopens windows an operator had been told were closed and whose earnings they believed final. The stamp makes the knob mean what an operator expects: it governs what settles <i>after</i> the change, and nothing that already happened. A dispute arriving on the exact stamped second is inside the window, and a late dispute is refused with <b>when</b> it closed, not merely that it did.`,
        ],
        after: CITATIONS,
      },
    ],
  },
  [["B1", "B2"], ["B3"], ["B4", "B5"], ["B6"]],
);

// ------------------------------------------------------- walkthrough C ---

const DRILL_NOTE = `
  <div class="callout warnbox">
    <h4>What the two transactions are, and what they are not</h4>
    <p>They are <b>real, confirmed testnet transactions</b>, produced by one uphold through <code>POST /api/disputes/{id}/uphold</code> against the real backend code. Independent QA, who produced them, states in her own evidence: <i>“These prove the code path. They are <b>not</b> Deliverable 3. The asset is not USDC, the ledger is not the platform’s, and the service is not the deploy.”</i></p>
    <table class="flow">
      <tr><th>Why each is not the deliverable</th><th>Checkable on Stellar Expert</th></tr>
      <tr><td class="k">The asset is a test asset</td><td>the transfer moves <code>UATUSD</code>, issued by the drill, over its own SAC — not the configured asset SAC</td></tr>
      <tr><td class="k">The ledger is not the platform’s</td><td>the rating went to ${a(contractUrl(DRILL_LEDGER), "the drill’s own ReputationLedger")}, not <code>CDCSOBEV…22ZT</code>, so it does not appear in the reputation the live planner routes on</td></tr>
      <tr><td class="k">The service is not the deployment</td><td>the source account on both is <code>GA45ITAK…EGZ2</code>, the drill’s settler — not the deployment’s signer <code>GDB4N25U…CDHP</code>, which C2 shows live</td></tr>
    </table>
  </div>`;

walkthrough(
  {
    id: "C",
    eyebrow: "Verify · the live API and Stellar testnet",
    title: "Verify it yourself: the live API, and two transactions on-chain",
    intro:
      "Nothing in this section needs the dApp, and nothing needs our word for it. The four readings below were taken against the live deployment while this document was assembled; the first request after a quiet period can take 30–60 seconds while the free-tier instance wakes. The JSON boxes are the live response bodies re-printed with indentation — no value is changed.",
    steps: [
      {
        id: "C1",
        title:
          "GET /api/stellar/network — testnet, the contracts, and an open decision",
        open: `${BE}/api/stellar/network`,
        go: "live response",
        shot: "c1-api-network.png",
        what: "response body, formatted",
        light: true,
        max: 68,
        text: [
          `The network is <b>testnet</b>, and the four application contract ids are the ones deployed in Week 2 and listed on page 3 — Epic 4 required no contract change, and the dispute rating is written through the ReputationLedger already deployed then.`,
          `<b>The configured asset is not USDC, and the interface says “USDC”.</b> The endpoint reports <code>asset: "native"</code>, and <code>asset_sac</code> is the <b>native XLM Stellar Asset Contract on testnet</b> — derivable from the asset itself, so it can be checked without trusting this document. Every amount in the product — plan prices, charges, credits, the receipt’s “credited to your wallet” — is labelled USDC while the deployment moves test XLM. <b>This is an open decision, not a resolved one</b>: either a USDC SAC is configured or the label is corrected, and D3 evidence should not be captured while the two disagree (page {{p:path}}, step 7).`,
        ],
      },
      {
        id: "C2",
        title: "GET /readiness — our signer is the ledger’s authorised scorer",
        open: `${BE}/readiness`,
        go: "live response",
        shot: "c2-api-readiness.png",
        what: "response body, formatted",
        light: true,
        max: 68,
        text: [
          `<code>ratings.writer</code> reads <b>"scorer"</b>: the deployment’s signing key <b>is</b> the ReputationLedger’s authorised Scorer, so a dispute rating it signs can land. That authorization is itself on-chain, from Week 2 — ${tx("216e1b5f6ade4d75ec671bcda27b462bfd373d041b1ba2150d76002ee8d201f8", "ReputationLedger.set_scorer")}. <b>This is the one live precondition for D3 that holds today.</b>`,
          `The signer is <code>${DEPLOY_SIGNER}</code>. Keep it: C7 and C8 are signed by a different account, and that difference is the whole point of them.`,
        ],
      },
      {
        id: "C3",
        title:
          "GET /openapi.json — six dispute routes, and no operator security scheme",
        open: `${BE}/openapi.json`,
        go: "live document",
        shot: "c3-openapi-facts.png",
        what: "each row is a query against the live document and the answer it returns",
        light: true,
        max: 78,
        text: [
          `All six dispute routes are served. But the document declares <b>no security scheme at all</b>: <code>components</code> holds only <code>schemas</code>, <code>components.securitySchemes</code> is absent, there is no top-level <code>security</code>, and <b>no operation carries one</b>.`,
          `That is a dated fingerprint. The 4.07 hardening merge (${a(`${BE_REPO}/pull/75`, "BE #75")}, 2026-09-25) declares the operator key as an OpenAPI security scheme named <code>OperatorApiKey</code> on both adjudication routes, and pins it with a test. A live document without it therefore <b>predates that merge</b> — so the deployment is behind <code>main</code> and does not carry the hardening pass’s fixes, including the double-payment fix and the disclosure fix. Render does not auto-deploy for this organisation, so the redeploy is a manual step (page {{p:path}}, step 2).`,
        ],
      },
      {
        id: "C4",
        title: "The six routes in the interactive docs",
        open: `${BE}/docs`,
        go: "live docs",
        shot: "c4-docs-dispute-routes.png",
        what: "the disputes group of the interactive API docs",
        light: true,
        max: 92,
        text: [
          `The same six routes as the deployment serves them, each try-able from the browser: mint a challenge to sign, open a dispute on a settled step, read one dispute, read a task’s window and its disputes, and the two adjudication routes — <b>uphold</b> and <b>reject</b>. Consistent with C3, the page shows no <i>Authorize</i> control, because the deployed document declares no scheme for one to fill.`,
        ],
      },
      {
        id: "C5",
        title: "The refund switch, answered live",
        open: `${BE}/docs`,
        go: "live response",
        shot: "c5-uphold-refunds-disabled.png",
        what: "the live POST and its response body, formatted \u00b7 the route in the API docs",
        light: true,
        max: 92,
        text: [
          `Posting to the uphold route with no credential, against a dispute id that exists on no deployment, is answered <b>503 <code>dispute_refunds_disabled</code></b>. The route refuses <b>before</b> it looks at the adjudicator key and before it looks for the dispute — the same answer a bogus key gets. <b>Dispute refunds are switched off on the deployment</b>, which is the correct default for a money path nobody has deliberately turned on, and is QA’s D-051 (${a(`${BE_REPO}/issues/68`, "backend #68")}), filed as a configuration state rather than a defect in the code.`,
          `Repeat it from a terminal: <code>curl -X POST ${BE}/api/disputes/x/uphold</code>.`,
        ],
      },
      {
        id: "C6",
        title: "How independent QA presents the two transactions",
        open: UAT_DOC("docs/uat/evidence/6.03-dispute-refund-rating.md"),
        go: "github.com · QA 6.03 evidence, §2",
        shot: "c8-qa-deliverable-3-evidence.png",
        what: "QA’s own evidence file, section 2",
        light: true,
        max: 80,
        text: [
          `Because nothing settles and nothing can be upheld on the deployment, the closest real evidence came from QA driving the real backend and the real trace page on her own machine, against a ReputationLedger <b>she deployed herself</b> from the same WASM the deployed ledger runs, paying credits in a test asset the drill issues. One uphold produced two real testnet transactions, both re-read on Horizon as <code>successful: true</code>. Her framing, unedited, is the shot above; ours does not soften it.`,
        ],
      },
      {
        id: "C7",
        title: "The refund transfer on Stellar Expert",
        open: txUrl(REFUND_TX),
        go: "stellar.expert · tx a5baac43…",
        shot: "c6-drill-refund-tx.png",
        what: "Stellar Expert (testnet)",
        text: [
          `<b>Successful</b> ${m(1)}, ledger 4865810, 2026-09-25 16:10:37 UTC. The invocation ${m(2)} is a <code>transfer</code> on the drill’s asset contract <code>CCW6…UENL</code>, from <code>GA45…EGZ2</code> to the drill’s payer, for <b>1,000,000 stroops</b> — 0.1 of the drill’s test asset. Re-read on Horizon while this document was assembled: <code>successful: true</code>, at that ledger.`,
          `Note the source account, and note the asset contract: neither is the deployment’s. That is exactly why this is proof of the code path and not of Deliverable 3.`,
        ],
      },
      {
        id: "C8",
        title: "The kind=“dispute” rating on Stellar Expert",
        open: txUrl(RATING_TX),
        go: "stellar.expert · tx 7138e4e3…",
        shot: "c7-drill-rating-tx.png",
        what: "Stellar Expert (testnet)",
        text: [
          `<b>Successful</b> ${m(1)}, ledger 4865811 — five seconds after the refund, and only because the refund landed and was recorded first. The invocation ${m(2)} is a <code>submit</code> on the drill’s ReputationLedger naming the agent and <code>dispute</code>, scored 10 out of 100 and weighted by the step’s quoted price.`,
          `The rating is written under a <b>derived</b> job id, because the ledger’s replay guard keys on <code>(agent_id, job_id)</code> and the settler has already auto-rated that step at settlement. The derivation keeps the sealed job’s own first eight bytes in front, so a reviewer can tie a rating to its job <b>by eye</b>, and hashes the step behind them, so two upheld disputes in one job produce two ratings rather than one and a refusal. That replay guard is also the rating’s idempotency: retrying a rating is always safe, and retrying an unconfirmed refund never is.`,
        ],
        after: DRILL_NOTE,
      },
    ],
  },
  [["C1", "C2"], ["C3", "C4"], ["C5", "C6"], ["C7"], ["C8"]],
);

// ------------------------------------------------------- walkthrough D ---

// The shot on this page lists every id with its severity and its issue, so
// the callout states only what the table cannot: the shape of the week, and
// why "27 logged" is the honest count rather than "27 open".
const SEVERITY = `
  <div class="callout">
    <h4>The shape of the week: 1 Blocker, 2 Critical, 7 Major, 17 Minor</h4>
    <table class="flow">
      <tr><td class="k">Blocker &middot; 1</td><td><b>D-051</b> — refunds switched off on the deployment (story 6.03a); “deployment configuration, not code”</td></tr>
      <tr><td class="k">Critical &middot; 2</td><td><b>D-050</b> — no run can be disputed at all · <b>D-053</b> — the adjudication concurrency defect, held privately</td></tr>
      <tr><td class="k">Major &middot; 7</td><td>D-054, D-058, D-064, D-066, D-067, D-069, D-074</td></tr>
      <tr><td class="k">Minor &middot; 17</td><td>the rest — but two of them, <b>D-075</b> and <b>D-076</b>, were <b>filed as Urgent</b> because they sit on the money path</td></tr>
    </table>
    <p class="small">Three of the 27 are already <b>fixed in code and not yet deployed</b> (D-053, D-064, and D-056 for the buyer’s routes), so <b>“27 logged” is the honest count, not “27 open”</b>. None is marked resolved, because QA counts a defect resolved only once the deployment has taken the build and the criterion passes there.</p>
  </div>`;

walkthrough(
  {
    id: "D",
    eyebrow: "Independent QA · Rieselle Saure",
    title: "Independent QA: what a second pair of eyes found",
    intro:
      "QA is a separate person, a separate repository and a separate verdict. Rie owns stories 6.03a–6.03g, and all of the work is public: the Playwright suites, the drills written to reach behaviour the deployment cannot show, the per-story evidence pages, and a defect register that does not spare our own build. Her verdict on the dispute story is <b>no-go</b>, and it stands.",
    steps: [
      {
        id: "D1",
        title: "The public UAT repository: suites, drills and evidence",
        open: UAT_REPO,
        go: "github.com · Orizon-Agents-UAT-Stellar",
        shot: "d1-uat-repository.png",
        what: "the repository’s file listing",
        light: true,
        max: 86,
        text: [
          `<code>tests/</code> holds 22 Playwright specs run against the <b>live deployment</b> across four browser projects — there is deliberately no local server in the configuration, so a pass there is a pass for a user. Six of them are this epic’s: the dispute path, the refusal matrix, eligibility, durability, the reputation consequence and the adjudication door. <code>docs/uat/</code> holds the test plan, the traceability matrix, the per-story evidence and the defect register.`,
          `<code>tools/</code> holds <b>five drills</b> written this week, precisely because the deployment cannot hold a dispute: a restart drill that hard-kills a real backend on real PostgreSQL and compares the API either side; a reputation drill that deploys its own ReputationLedger and issues its own test asset; a dispute-UI drill that seeds every receipt state against the real trace page; an adjudication drill that boots the service once per configuration and proves nothing was signed by reading the settler’s sequence number off Horizon before and after; and a rating-log drill that needs no network at all. Each carries a README stating it never uses the deployment’s signer, ledger or money.`,
        ],
      },
      {
        id: "D2",
        title: "The defect register, and the two defects that are not public",
        open: UAT_DOC("docs/uat/defects.md"),
        go: "github.com · docs/uat/defects.md",
        shot: "d4-defect-issue-table.png",
        what: "the register’s own defect-to-issue table",
        light: true,
        split: true,
        max: 44,
        text: [
          `Twenty-seven defects were logged this week, D-050 to D-076, each a written reproduction rather than a line in a table. <b>Twenty-five are filed as public GitHub issues</b> in the repository that owns the code — sixteen in the backend, nine in the frontend — each quoting the failing criterion and linking back to the register.`,
          `<b>Two are deliberately not public.</b> D-053 and D-058 are money-path defects; their mechanisms and reproductions were withheld from the public log and handed to the settler key holder and the backend maintainers directly. D-053 is the one that matters: under one specific interleaving of adjudication calls the refund guard did not hold. Triggering it needs adjudicator credentials, so no buyer or anonymous caller could reach it, and nothing happened on-chain because refunds are off. <b>QA found it on 2026-09-24, a day before our own audit reproduced and fixed the same defect</b>, and her standing advice was not to enable refunds until it was fixed. Her re-check against the hardening build produced one transfer where the earlier build signed two.`,
          `The table opposite is the register’s own mapping, and it is the thing to check rather than our summary of it. Two details a careful reader will notice, stated here rather than glossed: the numbering is <b>not contiguous</b> — backend #75 and frontend #76 belong to nobody in this list — and the table’s preamble still says “stories 6.05 and 6.06 … filed 2026-09-24”, which is older than several of the rows beneath it. The rows are right; the sentence above them has not caught up.`,
        ],
        after: SEVERITY,
      },
      {
        id: "D3",
        title:
          "Eleven found against our own hardening build — including one our fix caused",
        open: UAT_DOC("docs/uat/defects.md"),
        go: "github.com · D-067",
        shot: "d2-defect-d-067.png",
        what: "the register’s entry for D-067",
        light: true,
        max: 72,
        text: [
          `<b>D-066 through D-076 — eleven defects — were all raised after the 4.07 hardening merges landed on 2026-09-25</b>, and ten of the eleven were exercised directly against that build (backend <code>08efeda</code>, frontend <code>5105a8b</code>); the eleventh was found on the deployment, which runs an older one. Finding eleven defects in the pass that was meant to close the gaps is what independent QA is for.`,
          `<b>D-067 is the one our own disclosure fix caused</b> — our word, not hers; she records it as a design gap whose privacy property still holds. The hardening pass stopped the backend returning the buyer’s reason and the adjudicator’s rejection reason to anyone without the task’s read token or the operator key. That closed a real hole. It also gates on a credential that lives in backend memory and in one browser tab’s session storage, and never on the <b>payer’s wallet</b> — and adjudication is manual and can take a day, by which time the token is almost always gone. So the one reader the text is written for is the one reader reliably locked out, while everyone else is correctly excluded. Three previously-passing restart-drill checks broke on it. Filed as ${a(`${BE_REPO}/issues/79`, "backend #79")}; the fix she proposes is to let the payer prove themselves with the same signed challenge that opens a dispute.`,
        ],
      },
      {
        id: "D4",
        title: "The verdict: no-go",
        open: UAT_DOC("docs/uat/evidence/6.03-dispute-refund-rating.md"),
        go: "github.com · QA 6.03 evidence, §5",
        shot: "d3-qa-recommendation.png",
        what: "QA’s recommendation, in her own words",
        light: true,
        max: 78,
        text: [
          `<b>“No-go for signing off 6.03. One criterion is blocked on the deploy, four fail in code, and Deliverable 3 is not captured.”</b> Of the story card’s eight criteria, three pass in code and none passes outright on the deployment: both on-chain artifacts are blocked behind D-050 and D-051; the window edges, the credit ceiling, the reputation cache and the rating-failure log each fail on a named open defect. Seven distinct duplicate-payment paths were attacked against the card’s minimum of four, and all seven hold at the hardening build.`,
          `She also fixes the order in which the switch may be turned on, and this document does not argue with it: the deployment must run backend <code>08efeda</code> or later; <code>MAX_REFUND_USDC</code> must be unset or a finite positive number; <code>DATABASE_URL</code> must still be set. Then one live session. That list is the backbone of page {{p:path}}.`,
        ],
      },
    ],
  },
  [["D1"], ["D2"], ["D3"], ["D4"]],
);

// ------------------------------------- why D3 has no evidence run, and how ---

PAGES.push({
  kind: "html",
  num: "Outstanding · 1 of 2",
  eyebrow: "Deliverable D3 · the one thing in the way",
  title: "Why D3 has no evidence run yet",
  toc: "Why D3 has no evidence run yet — the gating defect",
  html: `
  <p class="lead">Deliverable D3 asks for a dispute transaction and the matching partial-refund transaction <b>produced by the deployment</b>, plus a recording of the dispute UI from the same session. Everything needed to produce them is built, merged, hardened and independently tested. The run has not happened, for a reason that is not in the dispute code at all — and this page states it rather than leaving it to be discovered.</p>
  <div class="warn">
    <b>No workflow settles, so no dispute window is ever stamped.</b>
    <code>PaymentEscrow.charge</code> attempts the transfer from an account that never signs it, so the charge never lands. The settlement recorder returns early when the charge produced no job id, so <b>no settlement record is written</b> — and because the dispute window is stamped on the settlement record (B6), no window ever opens and no step is ever disputable.
    Three merged stories of dispute, refund and rating work, and the whole trace-view dispute interface, are unreachable by any buyer on testnet. Nothing in the product says so; it looks like a feature that exists.
    This is QA’s <b>D-050</b> (${a(`${BE_REPO}/issues/67`, "backend #67")}), and it is a consequence of the contract-level defect <b>D-039</b> (${a(`${SC_REPO}/issues/3`, "contracts #3")}) rather than a bug in the dispute code. Both issues say so, and the cheapest possible tripwire is already in QA’s live suite: a pinned expected failure that turns green by itself the first time a charge lands.</div>
  <div class="twoup">
    ${shot({ id: "x1", title: "Backend issue #67", shot: "e1-be-issue-67.png", what: "github.com · backend #67 — D-050, the dispute path unreachable", light: true, max: 47, open: `${BE_REPO}/issues/67` })}
    ${shot({ id: "x2", title: "Contracts issue #3", shot: "e2-contracts-issue-3.png", what: "github.com · contracts #3 — D-039, the escrow charge", light: true, max: 47, open: `${SC_REPO}/issues/3` })}
  </div>
  <p class="small">The path from here to a captured D3 evidence run is on the next page. None of it is further development on the dispute path.</p>`,
});

PAGES.push({
  kind: "html",
  num: "Outstanding · 2 of 2",
  eyebrow: "Deliverable D3 · the path to the evidence",
  title: "Exactly what would produce the D3 evidence run",
  toc: "The path to the D3 evidence run, in order",
  html: `
  <p class="lead">In order, and none of it development work on the dispute path. Steps 2, 3, 4 and 6 are the ordering independent QA set out before the refund switch may be turned on; this document does not argue with it.</p>
  <table class="flow steps">
    <tr><td class="k">1 · Make a charge land</td><td>Fix the escrow so the payer’s funds move (${a(`${SC_REPO}/issues/3`, "contracts #3")}). Without it there is nothing to dispute, whoever drives the run. This is the one true prerequisite, and it is contract work.</td></tr>
    <tr><td class="k">2 · Deploy current <code>main</code></td><td>Backend <code>08efeda</code> or later, carrying the hardening pass’s money-path and disclosure fixes. <code>GET /openapi.json</code> will show the <code>OperatorApiKey</code> scheme once it has — the same check C3 makes today. Render does not auto-deploy for this organisation, so this is a manual step.</td></tr>
    <tr><td class="k">3 · Set an operator key</td><td><code>API_KEY</code>, at least 8 printable ASCII characters with no surrounding whitespace. The boot validator refuses anything shorter <i>by name</i>, rather than booting clean and then answering 401 to the operator’s own key: below 8 characters the log redaction filter will not mask the value, so a shorter key prints itself into any log line that quotes it.</td></tr>
    <tr><td class="k">4 · Switch refunds on</td><td><code>DISPUTE_REFUNDS_ENABLED=true</code>, in the same pass: setting it without a key makes the process refuse to start, deliberately, so the two go together.</td></tr>
    <tr><td class="k">5 · Confirm the database</td><td><code>DATABASE_URL</code> must be set, or the dispute store falls back to memory and the 24-hour window becomes a promise that ends at the next restart — which a free-tier instance performs whenever it idles. No endpoint reports it, so it is checked in the dashboard.</td></tr>
    <tr><td class="k">6 · Keep the ceiling finite</td><td>Confirm <code>MAX_REFUND_USDC</code> is unset or a finite positive number: a non-finite value silently removes the refund cap (QA’s D-054, still open at the hardening build).</td></tr>
    <tr><td class="k">7 · Decide the refund asset</td><td>The deployment is configured with the native XLM SAC while every amount in the interface is labelled USDC (C1). Configure a USDC SAC or correct the label — do not capture D3 evidence while the two disagree.</td></tr>
    <tr><td class="k">8 · Capture one session</td><td>A settled run; a dispute raised by the paying wallet; an uphold through the <b>API</b> rather than the operator script, so the running service’s cached score is invalidated (QA’s D-066) — producing the refund transaction and the <code>kind="dispute"</code> rating transaction, with the screen recording running continuously from before the dispute is raised until the receipt flips to “Refunded” with both Stellar Expert links.</td></tr>
  </table>
  <div class="callout">
    <h4>Why that one session is enough</h4>
    <p>The receipt polls itself while a dispute is unresolved — every 30 seconds under review, every 5 while a credit is being sent, not at all once final or while the tab is hidden — so the flip from “Under review” to “Refunded” with both links happens <b>in the recording, without a reload</b>. QA reproduced exactly that in the 6.03f drill, and proved the page never reloaded by setting a marker on it before the uphold and finding it still there afterwards.</p>
    <p class="small">That session turns the two “not captured” rows in this document into a pair of hashes, and turns QA’s first criterion green. Four of her eight criteria need code fixes beyond it, each already filed as a public issue.</p>
  </div>`,
});

// ------------------------------------------------------------ demo video ---

PAGES.push({
  kind: "html",
  num: "Demo video",
  eyebrow: "Week 3 · the recording that does not exist yet",
  title: "Demo video: there is no Week-3 recording, and why",
  toc: "Demo video — there is no Week-3 recording; the Week-2 post",
  html: `
  <div class="warn">
    <b>There is no Week-3 demo video, and the Week-3 public build post has not been published.</b>
    The D3 walkthrough recording is blocked on the defect on page {{p:outstanding}}: a recording of the dispute UI is only worth making against a run that settles, and no run settles on the deployment. The tracker card for the weekly public post carries no URL, and none is invented here. Both are stated as outstanding rather than presented as met.
  </div>
  <p class="lead">The most recent published demo is <b>Week 2’s</b>. It is linked below and labelled as Week 2’s wherever it appears in this document. It shows reputation-gated routing and the external agent execution path — <b>not</b> the dispute path this week delivered.</p>
  <table class="lt">
    <tr><th>Week-2 build post <span>· plays the video · published 2026-09-19</span></th><td>${a(XPOST)}</td></tr>
    <tr><th>Embed view <span>· the same post, no login needed</span></th><td>${a(XEMBED)}</td></tr>
  </table>
  ${shot({ id: "video", title: "Week-2 build video post", shot: "f1-week-2-video-post.png", what: "the Week-2 post, drawn by X’s embed renderer", light: true, max: 62, open: XPOST })}
  <p class="small">x.com shows a blank page to a logged-out automated browser, so this capture is X’s own embed view of the same post id. The Week-3 recording will be captured in the same session that produces the two deployment transactions — step 8 on page {{p:path}}.</p>`,
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
    : `${esc(s.what ?? "screenshot")} · ${a(url)}${via} · captured ${esc(capturedAt(s.shot))}`;
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
  <div class="sub">What shipped in Week 3 on Stellar testnet, how the money path is kept safe, how to verify it live — and, plainly, what is not evidenced yet.</div>
  <table class="facts">
    <tr><th>Programme</th><td>Stellar Instawards (Cohort 2026) — Blue Belt Instaward Sprint</td></tr>
    <tr><th>Milestone</th><td>M3 · Week 3 — Dispute Window &amp; Partial-Credit Refund (Deliverable <b>D3</b>, Epic 4)</td></tr>
    <tr><th>Sprint week</th><td>Mon 2026-09-21 → Fri 2026-09-25 · evidence assembled 2026-09-26</td></tr>
    <tr><th>Network</th><td><b>Stellar testnet only</b></td></tr>
    <tr><th>Team</th><td>Danielle Bagaforo Meer — lead engineer (GitHub <span class="mono">ALGOREX-PH</span>)<br>Rieselle Saure (“Rie”) — PM + QA (GitHub <span class="mono">rie-hash14</span>)</td></tr>
    <tr><th>This week</th><td>14 pull requests merged · 1,295 commits · +45,936 / −1,152 on <span class="mono">main</span> · 908 commits authored by the lead engineer, 268 by QA</td></tr>
    <tr><th>Live application</th><td>${a(SITE)} · API ${a(`${BE}/docs`)}</td></tr>
  </table>
  <h3>Contents</h3>
  <table class="toc">
    ${toc.join("\n    ")}
  </table>
  <p class="note"><b>How to read this.</b> Each step names the page to open, top right, and what to look for. Numbered orange outlines ${m(1)} match the numbers in the text; they are drawn by this document over the unaltered screenshot. Every URL here is a live link. <b>Two kinds of screenshot, never mixed:</b> Walkthrough A’s six frames are local captures against the end-to-end suite’s <b>test fixtures</b> — every hash in them exists on no ledger — and every page and caption carrying one says so. Everything else was captured on 2026-09-26 from the live deployment and from public GitHub, Stellar Expert and X pages; no wallet was connected and nothing was signed, paid or submitted for any of them.</p>
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
    outstanding: PAGES.findIndex((p) => p.num === "Outstanding · 1 of 2") + 1,
    path: PAGES.findIndex((p) => p.num === "Outstanding · 2 of 2") + 1,
    video: PAGES.findIndex((p) => p.num === "Demo video") + 1,
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
  footerTemplate: `<div style="width:100%;font-family:Inter,'DejaVu Sans',sans-serif;font-size:7.5px;color:#7a8394;padding:0 15mm;display:flex;justify-content:space-between"><span>Orizon Agents — Week 3 · Technical Documentation &amp; Demo Evidence · Stellar testnet</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`,
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
