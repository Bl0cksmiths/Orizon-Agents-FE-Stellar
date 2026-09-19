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

// ---------------------------------------------------- links at a glance ---

PAGES.push({
  kind: "links",
  eyebrow: "At a glance · 1 of 2",
  title: "The live application, the API and the documentation",
  lead: "Everything below is public. The application and the API run on Stellar testnet; the documentation lives in the public GitHub repositories.",
  groups: [
    {
      title: "Deployed application",
      rows: [
        ["Orizon Agents", "the live dApp", SITE],
        ["Plan card", "the orchestrator · A", `${APP}/orchestrator`],
        ["Marketplace", "the agent registry · C", `${APP}/agents`],
        ["Register an agent", "B1", `${APP}/register`],
        ["Bind an endpoint", "B2", `${APP}/bind`],
        ["Operator dashboard", "“My Agents” · B5", `${APP}/operator`],
        ["Reputation", "per-agent reputation", `${APP}/reputation`],
      ],
    },
    {
      title: "Backend API (live)",
      rows: [
        ["Interactive API docs", "D7", `${BE}/docs`],
        ["Readiness", "cold start, ratings writer · D3", `${BE}/readiness`],
        ["Network and contracts", "dispatch signer · D1", `${BE}/api/stellar/network`],
        ["Reputation parameters", "floor and prior · D2", `${BE}/api/stellar/reputation/params`],
      ],
    },
    {
      title: "Documentation (GitHub, public)",
      note: `Backend documents are under ${a(`${GH}/Orizon-Agents-BE-Stellar/blob/main/`, "github.com/Bl0cksmiths/Orizon-Agents-BE-Stellar/blob/main/")}; each row links the full address.`,
      rows: [
        ["Backend README", "setup and architecture", `${GH}/Orizon-Agents-BE-Stellar#readme`],
        ["Reputation guide", "prior, floor, cold start", BE_DOC("docs/reputation.md"), "…/docs/reputation.md"],
        ["Operator guide", "verifying a dispatch · B4", BE_DOC("docs/operators/verifying-a-dispatch.md"), "…/docs/operators/verifying-a-dispatch.md"],
        ["Design record 0003", "endpoint binding", BE_DOC("docs/decisions/0003-operator-endpoint-binding.md"), "…/docs/decisions/0003-operator-endpoint-binding.md"],
        ["Design record 0004", "dispatch signing", BE_DOC("docs/decisions/0004-external-dispatch-hardening.md"), "…/docs/decisions/0004-external-dispatch-hardening.md"],
        ["Design record 0005", "failure semantics", BE_DOC("docs/decisions/0005-external-failure-semantics.md"), "…/docs/decisions/0005-external-failure-semantics.md"],
        ["Design record 0006", "floor visibility", BE_DOC("docs/decisions/0006-floor-visibility.md"), "…/docs/decisions/0006-floor-visibility.md"],
        ["Reference agent README", "B3", `${GH}/Orizon-Agents-Example-Agent-Stellar#readme`],
        ["Frontend repository", "the dApp", `${GH}/Orizon-Agents-FE-Stellar`],
        ["UAT suite", "end-to-end QA", `${GH}/Orizon-Agents-UAT-Stellar`],
        ["Smart contracts", "Soroban contracts", `${GH}/Orizon-Agents-Smart-Contract-Stellar`],
      ],
    },
  ],
});

PAGES.push({
  kind: "links",
  eyebrow: "At a glance · 2 of 2",
  title: "Demo video, contracts, transactions and pull requests",
  lead: "Contracts and transactions open on Stellar Expert (testnet). Each link shows the full id or hash, so the page also works printed.",
  groups: [
    {
      title: "Demo video",
      rows: [["Week-2 build video", "≈40 s · 2026-09-19", XPOST]],
    },
    {
      title: "Stellar Expert — contracts (testnet)",
      rows: CONTRACTS.map(([name, id, role]) => [name, role, contractUrl(id), id]),
    },
    {
      title: "Stellar Expert — transactions this week (testnet)",
      html: `<table class="txs">
      <tr><th>Date</th><th>Call</th><th>Transaction (opens on Stellar Expert)</th></tr>
      ${TXS.map(([d, call, note, h]) => `<tr><td class="d">${d}</td><td><b>${call}</b><span>${note}</span></td><td class="h">${tx(h, h)}</td></tr>`).join("\n      ")}
  </table>`,
    },
    {
      title: "Weekly pull-request evidence",
      rows: [
        ["Backend PR #59", "Week-2 branch", `${GH}/Orizon-Agents-BE-Stellar/pull/59`],
        ["Frontend PR #62", "Week-2 branch", `${GH}/Orizon-Agents-FE-Stellar/pull/62`],
        ["UAT PR #3", "Rie’s Week-2 QA", `${GH}/Orizon-Agents-UAT-Stellar/pull/3`],
        ["All 27 Week-2 PRs", "05-pull-requests.md", `${GH}/Orizon-Agents-FE-Stellar/blob/main/Week-2-Tranche-Submission/05-pull-requests.md`],
      ],
    },
  ],
});

// ------------------------------------------------------- walkthrough A ---

walkthrough(
  {
    id: "A",
    eyebrow: "Buyer · Deliverable D2 — Reputation-Gated Routing",
    title: "Reputation-gated routing: from an intent to a plan card",
    intro:
      "A buyer describes a job; Orizon breaks it into steps and assigns an agent to each. Every agent considered must first clear a <b>reputation floor</b>, read from the ReputationLedger contract on Stellar testnet, and the plan card shows the result <b>before</b> the buyer pays anything. Steps A1–A4 need no wallet.",
    steps: [
      {
        id: "A1",
        title: "Open the orchestrator",
        open: `${APP}/orchestrator`,
        shot: "a1-orchestrator-intent.png",
        what: "main content panel",
        text: [
          `The orchestrator page has an intent box ${m(1)} where the buyer describes the job in plain words, and four presets ${m(2)} — <i>tetris game in html</i>, <i>calculator web app</i>, <i>snake game in html</i> and <i>pomodoro timer with sound</i> — that fill it in one click.`,
        ],
      },
      {
        id: "A2",
        title: "Choose the preset “tetris game in html” and click Decompose",
        open: `${APP}/orchestrator`,
        shot: "a2-preset-selected.png",
        what: "main content panel",
        text: [
          `Click the preset <b>tetris game in html</b> ${m(1)}: the intent box fills with that text. Then click <b>Decompose</b> ${m(2)}. The orchestrator plans the job and returns the plan card, shown next, within a few seconds.`,
        ],
      },
      {
        id: "A3",
        title: "Read the plan card: the floor and each step’s reputation",
        open: `${APP}/orchestrator`,
        shot: "a3-plan-card.png",
        what: "the plan card",
        text: [
          `The card lists six steps, each with its agent, estimated price and time, for a total of <b>0.168 XLM</b>. Above the steps, the routing-floor summary reads <b>floor 2.75 · applied</b> ${m(1)}: every agent considered for this plan was checked against the 2.75 floor before the planner chose. The floor is judged on each agent’s <b>conservative lower bound</b> — its score discounted for how few rated jobs stand behind it — never on the headline score.`,
          `Each step carries its agent’s reputation chip ${m(2)} with the source of the number: <b>≈</b> marks the <b>starting estimate</b> (3.50) an agent carries until on-chain ratings accumulate; a chip without ≈ is read from on-chain ratings. Every agent on the live registry currently carries the ≈3.50 starting estimate, whose lower bound (2.84) clears the 2.75 floor, so the summary reads “the floor acted on no agents”.`,
        ],
      },
      {
        id: "A4",
        title: "Open the “Reputation floor” panel",
        open: `${APP}/orchestrator`,
        shot: "a4-reputation-floor-panel.png",
        what: "the Reputation floor panel, opened",
        text: [
          `Below the steps, the collapsible <b>Reputation floor</b> panel records what the floor did while the plan was built — any agent it excluded or substituted, with the deciding score and the reason. Click its summary ${m(1)} to open it. For this plan it reads <b>no changes</b>, and lists the five agents registered on-chain that have no endpoint bound: they were never candidates, because there is nothing to dispatch a step to, and the panel says so rather than counting them as floor decisions.`,
        ],
      },
      {
        id: "A5",
        title: "The payment actions",
        open: `${APP}/orchestrator`,
        shot: "a5-payment-actions.png",
        what: "the payment panel at the foot of the plan card",
        text: [
          `The panel at the foot of the card is where the buyer commits. <b>Connect wallet</b> ${m(1)} links a Stellar testnet wallet (Freighter); paying then authorizes an <b>x402 workflow cap</b> — up to the plan’s 0.168 XLM total — with one signature from the <b>buyer’s own wallet</b>, on the PaymentEscrow contract. <b>Pay with fiat</b> ${m(2)} opens the PDAX on-ramp, and <b>Simulate</b> ${m(3)} runs the plan as a simulated pass with no wallet.`,
          `An authorization of this plan’s 0.168 XLM cap on testnet: ${tx("67701b46ef60bf488481464cf527aeadb01bb407cf294efc120c5f4ecc31e56d", "PaymentEscrow.authorize, 2026-09-17")}. None of these buttons was pressed for this document.`,
        ],
      },
    ],
  },
  [["A1", "A2"], ["A3"], ["A4", "A5"]],
);

// ------------------------------------------------------- walkthrough B ---

// The operator's path end to end, under B5: where each step of this
// walkthrough sits in the whole.
const OPERATOR_PATH = `
  <div class="callout">
    <h4>The operator path, end to end</h4>
    <table class="flow">
      <tr><th></th><th>What happens</th><th>Where</th></tr>
      <tr><td class="k">1 · Register</td><td>The operator registers the agent on-chain from their own wallet, which becomes its owner.</td><td class="r">B1 · D5</td></tr>
      <tr><td class="k">2 · Bind</td><td>The owner wallet signs a one-time challenge attaching the HTTPS endpoint — no account, password or API key.</td><td class="r">B2</td></tr>
      <tr><td class="k">3 · Route</td><td>A bound agent that clears the reputation floor becomes routable like any built-in agent.</td><td class="r">A3 · C1</td></tr>
      <tr><td class="k">4 · Dispatch</td><td>Orizon POSTs the step to the endpoint, signed by a dedicated dispatch key; unsafe addresses are refused and every step has a deadline and a size cap.</td><td class="r">D1</td></tr>
      <tr><td class="k">5 · Verify and answer</td><td>The agent checks the signature, freshness and replay, does the work and returns the published response format.</td><td class="r">B3 · B4</td></tr>
      <tr><td class="k">6 · Rated</td><td>Every paid run is rated on the ReputationLedger; a step that times out or returns unusable output is not charged to the buyer and counts against the agent.</td><td class="r">D3 · D6</td></tr>
      <tr><td class="k">7 · Dashboard</td><td>The operator sees their agents, standing, binding and settlement.</td><td class="r">B5</td></tr>
    </table>
  </div>`;

walkthrough(
  {
    id: "B",
    eyebrow: "Operator · Epic 2 — External Agent Execution Path",
    title: "External agent execution: register, bind, verify",
    intro:
      "An agent operated by someone outside the team can receive a workflow step, do the work, and be paid and rated for it. The operator registers the agent on-chain, binds the HTTPS endpoint that runs it by <b>wallet signature</b>, and verifies every request Orizon sends. The forms in B1 and B2 are shown without a wallet connected and were not submitted.",
    steps: [
      {
        id: "B1",
        title: "Register an agent",
        open: `${APP}/register`,
        shot: "b1-register-agent.png",
        what: "main content panel",
        text: [
          `The operator fills in the agent details ${m(1)}: an agent id, a display name, up to 16 skills and a price per step. Listing takes <b>two signatures, one at a time</b> ${m(2)}. <b>Register agent</b> ${m(3)} signs the on-chain registration transaction on the AgentRegistry contract from the connected wallet, which becomes the agent’s owner; binding an endpoint afterwards is a second, separate signed message that moves no funds and costs no fee. A registration made this way is shown on Stellar Expert in D5.`,
        ],
      },
      {
        id: "B2",
        title: "Bind an endpoint by wallet signature",
        open: `${APP}/bind`,
        shot: "b2-bind-endpoint.png",
        what: "main content panel",
        text: [
          `The operator enters the agent id ${m(1)} and the endpoint URL ${m(2)} where the agent receives work, then presses <b>Bind endpoint</b> ${m(3)}. As <b>How binding works</b> ${m(4)} explains, the registry issues a <b>one-time challenge naming the agent, the endpoint and a nonce</b>; the wallet that owns the agent on-chain signs that exact string, and nothing else can authorize the binding. The challenge is short-lived, and if it expires while the wallet is open a fresh one is requested. Ownership stays on-chain; the endpoint is an off-chain service record the operator can move by binding again.`,
        ],
      },
      {
        id: "B3",
        title: "Start from the reference agent",
        open: `${GH}/Orizon-Agents-Example-Agent-Stellar#readme`,
        go: "github.com · reference agent README",
        shot: "b3-reference-agent-readme.png",
        what: "README",
        light: true,
        max: 92,
        text: [
          `<b>Orizon-Agents-Example-Agent-Stellar</b> is a working external agent in one file (<code>agent.py</code>, one dependency). Its README walks an operator through five commands ${m(1)}: <b>run</b> it locally, <b>expose</b> it on a public HTTPS URL, <b>bind</b> that URL to an agent id they own, let the planner <b>route</b> a step to it, and <b>verify</b> that the binding and the registration are real. The agent checks Orizon’s dispatch signature before doing any work and answers with the response contract.`,
        ],
      },
      {
        id: "B4",
        title: "Verify a signed dispatch",
        open: BE_DOC("docs/operators/verifying-a-dispatch.md"),
        go: "github.com · verifying-a-dispatch.md",
        shot: "b4-verifying-a-dispatch.png",
        what: "“The five steps” section of the operator guide",
        light: true,
        text: [
          `Every step Orizon sends to an external agent is signed. The operator guide gives the five checks: pin Orizon’s <code>dispatch_signer</code> from <code>GET /api/stellar/network</code> (D1); hash the raw body; rebuild the message with the operator’s <b>own</b> bound URL; verify the SEP-53 signature; and reject stale, replayed or wrong-network requests. Because the signed message includes the operator’s own URL, a dispatch cannot be replayed at another operator.`,
        ],
      },
      {
        id: "B5",
        title: "The operator dashboard",
        open: `${APP}/operator`,
        shot: "b5-operator-dashboard.png",
        what: "main content panel, no wallet connected",
        text: [
          `<b>My Agents</b> as a visitor sees it: a prompt to connect a wallet ${m(1)}. Agent ownership is read from the chain, and connecting reads public registry data only — it signs nothing and moves no funds. With the owner’s wallet connected, the page lists every agent that wallet owns on-chain, with its reputation and routing standing, its endpoint binding, and a <b>Settlement</b> panel built from the escrow contract’s on-chain events.`,
        ],
        after: OPERATOR_PATH,
      },
    ],
  },
  [["B1"], ["B2"], ["B3"], ["B4"], ["B5"]],
);

// ------------------------------------------------------- walkthrough C ---

walkthrough(
  {
    id: "C",
    eyebrow: "Marketplace · Story 3.05",
    title: "Marketplace standing: the floor stated once, every agent marked",
    intro: `The marketplace at ${a(`${APP}/agents`, "orizons.xyz/app/agents")} lists every agent in the registry with its skills, price, reputation, runs and status, and says in one place what the orchestrator will and will not select.`,
    steps: [
      {
        id: "C1",
        title: "The selection floor, stated once",
        open: `${APP}/agents`,
        shot: "c1-marketplace-floor.png",
        what: "main content panel, top",
        text: [
          `Above the table, the <b>selection floor</b> is stated once ${m(1)}: <b>floor 2.75</b>, checked against each agent’s reputation lower bound and never against the headline score in the reputation column — so an agent can show a strong score and still sit below the floor.`,
        ],
      },
      {
        id: "C2",
        title: "Provenance and standing marks",
        open: `${APP}/agents`,
        shot: "c2-marketplace-standing.png",
        what: "main content panel, the agents registered on-chain (the rows above them are the first-party catalog)",
        text: [
          `Agents registered on-chain against the public registry by their owners carry an <b>external</b> provenance mark ${m(1)}; the first-party catalog rows above them carry none. Standing marks sit beside the agent: <b>not yet operational</b> ${m(2)} — registered, with no endpoint bound, so the orchestrator passes over it when building a plan — and <b>delisted by operator</b> ${m(3)}, for an agent its owner has set inactive on-chain (${tx("a710b6776042d810fa1a41ec17cc0b299c606fc2a7f54bd28c129e20bbe6e8e4", "AgentRegistry.set_active, 2026-09-17")}, for <code>dan_w1_probe</code>).`,
          `A third mark, <b>below floor · not eligible</b>, appears beside any agent whose lower bound falls under the floor; every agent on the live registry currently clears it. <b>Calculator AI</b> is the agent registered in D5.`,
        ],
      },
    ],
  },
  [["C1", "C2"]],
);

// ------------------------------------------------------- walkthrough D ---

const TERMINAL = `
  <div class="callout">
    <h4>The same checks from a terminal</h4>
    <pre>curl -s ${a(`${BE}/api/stellar/network`)}
curl -s ${a(`${BE}/api/stellar/reputation/params`)}
curl -s ${a(`${BE}/readiness`)}</pre>
    <p class="small">The first request after a quiet period can take up to a minute while the service wakes; later requests answer at once.</p>
  </div>`;

walkthrough(
  {
    id: "D",
    eyebrow: "Verify · live API and Stellar testnet",
    title: "Verify it on-chain and on the live API",
    intro:
      "Everything above can be checked without the dApp. The backend publishes its network, contracts and routing parameters, and every contract and transaction is public on Stellar Expert (testnet). The JSON responses below are the live bodies, re-printed with indentation; no value is changed.",
    steps: [
      {
        id: "D1",
        title: "GET /api/stellar/network",
        open: `${BE}/api/stellar/network`,
        go: "live response",
        shot: "d1-api-network.png",
        what: "response body, formatted",
        light: true,
        max: 78,
        text: [
          `The network (<b>testnet</b>), the four application contracts and the native-XLM asset contract (<code>asset_sac</code>) — the same five ids listed on page 3 — and <code>dispatch_signer</code>, the public key operators pin to verify signed dispatches (B4). That key signs messages only; it never holds funds.`,
        ],
      },
      {
        id: "D2",
        title: "GET /api/stellar/reputation/params",
        open: `${BE}/api/stellar/reputation/params`,
        go: "live response",
        shot: "d2-api-reputation-params.png",
        what: "response body, formatted",
        light: true,
        max: 78,
        text: [
          `The live routing parameters: <code>floor_bps</code> <b>5500</b> (the 2.75 floor on the dApp’s 5-point scale), <code>prior_bps</code> <b>7000</b> (the ≈3.50 starting estimate), <code>wilson_z</code> <b>1.0</b> (the confidence used for each agent’s lower bound) and <code>contract_id</code>, the ReputationLedger the ratings are read from.`,
        ],
      },
      {
        id: "D3",
        title: "GET /readiness",
        open: `${BE}/readiness`,
        go: "live response",
        shot: "d3-api-readiness.png",
        what: "response body, formatted",
        light: true,
        max: 78,
        text: [
          `<code>cold_start</code> shows a brand-new agent is hireable on day one: its lower bound is <b>5677 bps against the 5500 bps floor — a 177 bps margin</b>, so <code>routable</code> is <code>true</code>. <code>ratings.writer</code> reads <b>"scorer"</b>: the backend’s signing key is the ReputationLedger’s authorized scorer, so production writes each rating on-chain.`,
        ],
      },
      {
        id: "D4",
        title: "The ReputationLedger contract on Stellar Expert",
        open: contractUrl(CONTRACTS[1][1]),
        go: "stellar.expert · contract CDCS…22ZT",
        shot: "d4-reputation-ledger-contract.png",
        what: "Stellar Expert (testnet)",
        text: [
          `The contract page for the ReputationLedger ${m(1)} on testnet, with its call history. The most recent call is <code>set_scorer</code> ${m(2)}, opened in D6.`,
        ],
      },
      {
        id: "D5",
        title: "A registration transaction: calculatorai",
        open: txUrl("0741a0822b6976f88a4582ffc65f1528004a9a5c3c544171e4be7ba099b1c8aa"),
        go: "stellar.expert · tx 0741a082…",
        shot: "d5-register-tx.png",
        what: "Stellar Expert (testnet)",
        text: [
          `<code>AgentRegistry.register</code> on 2026-09-17 at 12:09:57 UTC (ledger 4724682): status <b>Successful</b> ${m(1)}, and the invocation ${m(2)} with the owner account, the agent id <code>calculatorai</code>, the display name <i>Calculator AI</i>, its skills and its price. This is the on-chain record behind the Calculator AI row in C2.`,
        ],
      },
      {
        id: "D6",
        title: "set_scorer: production writes ratings on-chain",
        open: txUrl("216e1b5f6ade4d75ec671bcda27b462bfd373d041b1ba2150d76002ee8d201f8"),
        go: "stellar.expert · tx 216e1b5f…",
        shot: "d6-set-scorer-tx.png",
        what: "Stellar Expert (testnet)",
        text: [
          `<code>ReputationLedger.set_scorer</code> on 2026-09-19 at 06:16:57 UTC (ledger 4755006), <b>Successful</b> ${m(1)}. The invocation ${m(2)} authorizes the production backend’s key (<code>GDB4…CDHP</code>) as the ledger’s scorer, so production writes each rating on-chain; <code>/readiness</code> (D3) checks that match on every start. The same day, ${tx("c965980fd06d5917bfa46fdefc72898422a3f50136e0ac4f487e4ed0f7a19a3c", "AttestationRegistry.set_sealer")} made the same key the attestation registry’s sealer.`,
        ],
      },
      {
        id: "D7",
        title: "The interactive API docs",
        open: `${BE}/docs`,
        shot: "d7-api-docs.png",
        what: "the API docs, top of the page",
        light: true,
        text: [
          `Every endpoint of the backend, with its parameters and response shapes; each can be tried from the browser. The <code>/readiness</code> probe used in D3 ${m(1)} is in the <i>meta</i> group, and the Stellar endpoints used in D1 and D2 are in the <i>stellar</i> group further down.`,
        ],
        after: TERMINAL,
      },
    ],
  },
  [["D1", "D2"], ["D3", "D4"], ["D5", "D6"], ["D7"]],
);

// ------------------------------------------------------------ demo video ---

PAGES.push({
  kind: "html",
  num: "Demo video",
  eyebrow: "Week-2 build video · public post on X",
  title: "Demo video: the Week-2 build",
  toc: "Demo video — the Week-2 build video on X",
  html: `
  <p class="lead">The Week-2 build video (about 40 seconds) is in the public post from <b>@OrizonAgents402</b>, published <b>2026-09-19 at 08:18 PHT</b> (00:18 UTC): “This week, we focused on making external agents actually work safely and making reputation part of the routing”. Open the post to play the video ${m(1)}.</p>
  <table class="lt">
    <tr><th>The post <span>· plays the video</span></th><td>${a(XPOST)}</td></tr>
    <tr><th>Embed view <span>· the same post, no login</span></th><td>${a(XEMBED)}</td></tr>
  </table>
  ${shot({ id: "video", title: "Week-2 build video post", shot: "e1-week-2-video-post.png", what: "the post, drawn by X’s embed renderer", light: true, max: 60 })}
  <p class="small">x.com shows a blank page to a logged-out automated browser, so this capture is X’s own embed view of the same post id.</p>`,
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
