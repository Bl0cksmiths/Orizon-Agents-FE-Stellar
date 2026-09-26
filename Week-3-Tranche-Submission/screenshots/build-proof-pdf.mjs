// Build Week-3-Tranche-Submission/Proof-of-Deliverables.pdf from the
// screenshots in this folder, the same way the Week-1 PDF was made: write an
// HTML document, then print it with Chromium (Playwright `page.pdf`).
// Run from the frontend repo root, after capture-screenshots.mjs:
//   node Week-3-Tranche-Submission/screenshots/build-proof-pdf.mjs
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

// Capture date in Manila time, from the file itself — a recapture updates it.
function capturedAt(file) {
  const d = statSync(file).mtime;
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
const SHOTS = [
  {
    file: "01-be-pr-60-dispute-window.png",
    short: "4.02 · D3",
    title: "The dispute window and the dispute endpoint",
    tag: "Story 4.02 · Deliverable D3 — Dispute Window & Partial-Credit Refund",
    url: "https://github.com/Bl0cksmiths/Orizon-Agents-BE-Stellar/pull/60",
    caption: [
      "Every settlement now stamps a <b>24-hour dispute window</b> on its own record at the moment it settles. The window is never recomputed from configuration, so changing the policy cannot move a deadline a buyer has already been told.",
      'A buyer opens a dispute against <b>one step</b> of the workflow they paid for by signing a one-time challenge with the wallet that paid — no account, no password, no support ticket. One dispute per <span class="mono">(job, step)</span> is enforced by a database constraint, so a double-submit is answered with the first dispute unchanged rather than an error the buyer cannot act on.',
    ],
  },
  {
    file: "02-be-pr-62-partial-credit-refund.png",
    short: "4.03 · D3",
    title: "The settler-executed partial-credit refund",
    tag: "Story 4.03 · Deliverable D3",
    url: "https://github.com/Bl0cksmiths/Orizon-Agents-BE-Stellar/pull/62",
    caption: [
      "An upheld dispute pays a configured share of the disputed step's charge back to the buyer's wallet, signed by the platform's settler from the platform's own funds. The amount is clamped to the smallest of three figures: the creditable amount frozen when the dispute opened, the step's settled price times the policy share, and the total actually settled.",
      "The safety property that matters: a <b>claim row is written before the transfer is signed</b>, not after. A crash, a retry, a restart or a second adjudicator therefore cannot produce a second transfer, and a claim left over a payout whose outcome is unknown blocks further attempts instead of releasing them.",
    ],
  },
  {
    file: "03-be-pr-63-dispute-rating.png",
    short: "4.04 · D3",
    title: "The negative on-chain rating an upheld dispute writes",
    tag: "Story 4.04 · Deliverable D3",
    url: "https://github.com/Bl0cksmiths/Orizon-Agents-BE-Stellar/pull/63",
    caption: [
      'The refund makes the buyer whole; the rating is what changes who gets hired next. An upheld dispute writes a permanent <span class="mono">kind="dispute"</span> rating against the agent on the ReputationLedger, and that rating feeds the routing floor the planner applies before a buyer is asked to pay.',
      "The ledger's replay guard keys on <span class=\"mono\">(agent_id, job_id)</span>, so a dispute rating is written under a <b>per-step derived job id</b>: the first half of the sealed job id, then a hash carrying the step index. A reviewer can still match every rating to its job by eye on Stellar Expert, because the first sixteen hex characters are the sealed job's own.",
    ],
  },
  {
    file: "04-be-pr-65-receipt-record.png",
    short: "4.06 · D3",
    title: "What a dispute receipt needs in order to be truthful",
    tag: "Story 4.06 · Deliverable D3 (backend)",
    url: "https://github.com/Bl0cksmiths/Orizon-Agents-BE-Stellar/pull/65",
    caption: [
      "The record behind the buyer's receipt: the amount actually credited, when the dispute last changed, the platform's reason when a dispute is rejected, and — the one that decides whether a receipt can lie — an explicit <b>confirmation flag on the rating</b>.",
      "A transaction hash alone proves nothing, because a hash is also recorded when a submission times out. So the interface is not allowed to treat a hash as success: the rating reads as done only once the ledger has vouched for it, and the hardening pass later made that confirmation monotonic so a later timeout cannot un-confirm it or be paired with it.",
    ],
  },
  {
    file: "05-fe-pr-68-dispute-action.png",
    short: "4.05 · D3",
    title: "The dispute action on the buyer's trace view",
    tag: "Story 4.05 · Deliverable D3 (frontend)",
    url: "https://github.com/Bl0cksmiths/Orizon-Agents-FE-Stellar/pull/68",
    caption: [
      "The buyer's side of D3: a settlement view on the trace page showing what each step cost and what is creditable, a live countdown to the window closing, and a Dispute button on each step still open to one.",
      "Only the paying wallet is offered the action. A visitor who is not the payer sees no dispute affordance at all and is never sent the complaint text — the server withholds it and the client blanks it independently, so no component can leak it by picking the wrong object.",
    ],
  },
  {
    file: "06-fe-pr-69-dispute-receipt.png",
    short: "4.06 · D3",
    title: "The dispute status and refund receipt the buyer reads",
    tag: "Story 4.06 · Deliverable D3 (frontend)",
    url: "https://github.com/Bl0cksmiths/Orizon-Agents-FE-Stellar/pull/69",
    caption: [
      "The receipt: the dispute's status, the refund transfer and the negative rating, each with its transaction hash and a Stellar Expert link a reviewer can check without trusting us.",
      "The rule throughout is that <b>nothing reads as done until the chain says so</b>. A credit recorded whose transfer has not confirmed wears “Refund in progress”, never “Refunded”, and the amount is marked as a promise rather than a payment until the record carries what was actually paid.",
    ],
  },
  {
    file: "07-be-pr-75-hardening.png",
    short: "4.07 · hardening",
    title:
      "Backend hardening: the money path, disclosure and settlement ratings",
    tag: "Story 4.07 — Epic 4 hardening pass (backend)",
    url: "https://github.com/Bl0cksmiths/Orizon-Agents-BE-Stellar/pull/75",
    caption: [
      "Before calling Epic 4 done we attacked our own implementation, on the rule that nothing counted as a finding until it had been reproduced against the running service, and every fix carries a test that was written first and watched failing.",
      "What it fixed: a <b>reproducible double payment</b> (two transfers for one dispute, 0.10 USDC out against a record saying 0.05); a stale decision that could strand a live payout's claim and leave a dispute unpayable; a missing signing key that parked a dispute mid-payment; the buyer's own words and the platform's rejection reason being readable by a caller who had proved nothing; a challenge-table flood that could deny every buyer their dispute window; a boot failure that printed configuration secrets into the deploy log; and a rating collision that lost half the ratings when one agent served two steps of a plan. Gate on merge: 2,177 tests, 92.53% coverage, type checking clean across 106 modules.",
    ],
  },
  {
    file: "08-fe-pr-76-hardening.png",
    short: "4.07 · hardening",
    title: "Frontend hardening: the receipt stops stating what it cannot show",
    tag: "Story 4.07 — Epic 4 hardening pass (frontend)",
    url: "https://github.com/Bl0cksmiths/Orizon-Agents-FE-Stellar/pull/76",
    caption: [
      "An upheld dispute used to read “the credit is being sent to your wallet”, over a row captioned “what you received”, marked “Being sent” — with nothing submitted and no transaction in existence. A buyer would go looking on Stellar Expert for a transfer nobody had attempted. All three lines now state only what the record holds.",
      "Also fixed: a single 404 on any re-read silently destroyed a live receipt with no error and no recovery; “Nothing on this workflow was charged” was terminal and never re-checked; the countdown overstated the window by the whole network round trip, offering a Dispute button the server would refuse; and the moment a refund confirms was announced to nobody using a screen reader. Gate on merge: 1,503 unit tests, 149 end-to-end tests, every route inside the 480 KB budget.",
    ],
  },
  {
    file: "09-be-pull-requests-week3.png",
    short: "PRs",
    title: "Backend pull requests merged this week",
    tag: "GitHub PR evidence — Orizon-Agents-BE-Stellar",
    url: "https://github.com/Bl0cksmiths/Orizon-Agents-BE-Stellar/pulls?q=is%3Apr+is%3Amerged+merged%3A2026-09-21..2026-09-26",
    caption: [
      'Every backend pull request merged in the sprint week, filtered by merge date in GitHub\'s own search. Stories 4.02 through 4.06 and the 4.07 hardening pass all landed on <span class="mono">main</span>.',
      'One record in that list is an honest mistake worth naming: PR #61 was opened against an unmerged feature branch rather than <span class="mono">main</span>, so its commits did not reach <span class="mono">main</span> until PR #62 re-landed them. Both are in the public record, and <span class="mono">05-pull-requests.md</span> in this bundle explains why the two share a diff.',
    ],
  },
  {
    file: "10-fe-pull-requests-week3.png",
    short: "PRs",
    title: "Frontend pull requests merged this week",
    tag: "GitHub PR evidence — Orizon-Agents-FE-Stellar",
    url: "https://github.com/Bl0cksmiths/Orizon-Agents-FE-Stellar/pulls?q=is%3Apr+is%3Amerged+merged%3A2026-09-21..2026-09-26",
    caption: [
      "Every frontend pull request merged in the sprint week. Stories 4.05 and 4.06 shipped the buyer-facing dispute surface; PR #76 is the hardening pass over it.",
      "The two Week-2 evidence documents (PRs #65 and #66) also appear here because they merged on the Monday; their work was authored the previous week and is counted there.",
    ],
  },
  {
    file: "11-uat-pr-4-rie-commits.png",
    short: "QA",
    title: "Independent QA: 268 authored commits in the public UAT repository",
    tag: "Multi-contributor evidence — Orizon-Agents-UAT-Stellar",
    url: "https://github.com/Bl0cksmiths/Orizon-Agents-UAT-Stellar/pull/4/commits",
    caption: [
      "QA is a separate pair of eyes and a separate public repository. The commits tab of UAT PR #4 shows <b>rie-hash14</b> as the author of every commit in it — 268 authored commits this week plus 12 merges, each touching exactly one file.",
      "The work behind them: the seven 6.03 sub-stories (the dispute happy path, attack idempotency on the money path, who may dispute and when, durability and the unconfirmed-refund path, the reputation consequence, the dispute UI in every state, and the adjudication door), the drills that produced the two testnet transactions later in this document, and the defect register.",
    ],
  },
  {
    file: "12-be-stellar-network.png",
    short: "live API",
    title: "The live service is on testnet, against the deployed contracts",
    tag: "Live endpoint — GET /api/stellar/network",
    url: "https://orizon-agents-be-stellar.onrender.com/api/stellar/network",
    caption: [
      "The deployed backend reports the network it is on and the contract ids it is wired to. Both are unchanged from Week 2: Epic 4 needed no contract change, because the dispute rating is written through the ReputationLedger already deployed.",
      "Note the asset: the configured SAC is the <b>native XLM SAC on testnet</b>, while the interface labels amounts in USDC. Choosing the refund asset deliberately is one of the outstanding items before the D3 evidence run, and it is listed as such in this bundle rather than left for a reviewer to notice.",
    ],
  },
  {
    file: "13-be-readiness.png",
    short: "live API",
    title: "The platform's signer is the ledger's authorised scorer",
    tag: "Live endpoint — GET /readiness",
    url: "https://orizon-agents-be-stellar.onrender.com/readiness",
    caption: [
      'The one live precondition for D3 that already holds: <span class="mono">ratings.writer</span> reads <span class="mono">"scorer"</span>, meaning the account the deployment signs with is the account the ReputationLedger authorises to write ratings. Without that, an upheld dispute would refund the buyer and fail to record the consequence.',
      "The same probe is how we verify it after every deploy, and it is checked by the six-hourly production smoke test.",
    ],
  },
  {
    file: "14-be-dispute-routes-openapi.png",
    short: "live API",
    title: "All six dispute routes are served by the deployed API",
    tag: "Live endpoint — the deployed OpenAPI description",
    url: "https://orizon-agents-be-stellar.onrender.com/openapi.json",
    caption: [
      "The deployment serves the whole Epic 4 surface: the challenge mint, opening a dispute, reading one dispute, reading a task's disputes, and the adjudication pair that upholds or rejects. That is six routes under the <span class=\"mono\">disputes</span> tag; QA's own notes count five, because they leave out the per-task read that the trace page uses. Same surface, two ways of counting it.",
      'The same description also shows that the deployment is running a build from <b>before</b> the hardening merge — the operator security scheme that BE #75 adds is absent from it. That is stated plainly in this bundle: the hardened code is on <span class="mono">main</span>, not yet on the deployed service.',
    ],
  },
  {
    file: "15-be-refunds-disabled.png",
    short: "live state",
    title: "The refund path is switched off on the deployment",
    tag: "Live endpoint — POST /api/disputes/{id}/uphold",
    url: "https://orizon-agents-be-stellar.onrender.com/openapi.json",
    caption: [
      'Asking the deployed service to uphold a dispute answers <span class="mono">503 dispute_refunds_disabled</span>. The refund path ships behind a master switch that is <b>off by default</b>, deliberately: a money path enabled by the mere presence of a signing key would be enabled in every test run and on every developer\'s laptop, which is how an anonymous payout route reaches production without anyone choosing it.',
      'The gate covers the whole adjudication pair, not just the paying half: <span class="mono">POST …/reject</span> answers the same 503, so on this deployment a dispute cannot even be refused. PR #62\'s own deploy notes state the shipped default — the path needs both the switch and an operator key set in the host dashboard before it will move money.',
      "This is the current, honest state of the deployment rather than a demonstration. Turning the switch on is one step of the outstanding work for D3 — and not the first one, because a deeper defect means no workflow settles there to be disputed in the first place.",
    ],
  },
  {
    file: "16-drill-refund-tx-stellar-expert.png",
    short: "testnet tx",
    title:
      "A real refund transfer on testnet — from QA's drill, not the deployment",
    tag: "Stellar Expert (testnet) — proof of the code path",
    url: "https://stellar.expert/explorer/testnet/tx/a5baac432b582787df0a632b3bc12916c51e12575a8f77bf267fd45b728701b8",
    caption: [
      "QA ran the <b>real backend code</b> through one uphold and it signed a real transfer on testnet, confirmed on the ledger and re-read on Horizon. It proves the refund path executes end to end and produces a verifiable transaction.",
      "<b>It is not the Deliverable-3 evidence, and this document does not present it as such.</b> The asset is a test asset, not USDC; the ledger is QA's own drill ReputationLedger, not the platform's; and the source account is a developer machine's, not the deployment's signer <span class=\"mono\">GDB4N25U…CDHP</span> — which anyone can check on this very page. D3 stays open until one run on the deployed service produces this transaction.",
    ],
  },
  {
    file: "17-drill-rating-tx-stellar-expert.png",
    short: "testnet tx",
    title: "The matching negative rating on testnet — same drill, same caveat",
    tag: "Stellar Expert (testnet) — proof of the code path",
    url: "https://stellar.expert/explorer/testnet/tx/7138e4e36e47f4f4404b2212aad5584d2f8fb941b387da76acae4c3b4cc07184",
    caption: [
      'The second half of the consequence, one ledger after the refund: the <span class="mono">kind="dispute"</span> rating written against the agent whose step was disputed. Refund and rating are the two artifacts D3 promises, and both were produced by one uphold.',
      "Same caveat, stated again because it matters: this was signed against a drill ledger from a developer machine. It demonstrates that the code works; it does not demonstrate the deployment doing it.",
    ],
  },
  {
    file: "18-be-issue-67-no-settlement.png",
    short: "blocker",
    title: "Why no dispute can be raised on the deployment today",
    tag: "Public defect — backend issue #67 (QA defect D-050)",
    url: "https://github.com/Bl0cksmiths/Orizon-Agents-BE-Stellar/issues/67",
    caption: [
      "The honest centre of this week's report. A dispute window is stamped on a <b>settlement</b> — and no run on the deployment records one, so there is nothing to dispute. QA found and filed it: a finished, paid run leaves the settlement record unwritten, the dispute endpoint answers that the job is unknown, and nothing in the product says so.",
      "The whole of Epic 4 is therefore unreachable by a buyer on the deployed service, even though it is built, merged and tested. We would rather a reviewer read that here than discover it themselves.",
    ],
  },
  {
    file: "19-contracts-issue-3-escrow-charge.png",
    short: "blocker",
    title: "The root cause, at the contract level",
    tag: "Public defect — contracts issue #3 (QA defect D-039)",
    url: "https://github.com/Bl0cksmiths/Orizon-Agents-Smart-Contract-Stellar/issues/3",
    caption: [
      'One layer down: <span class="mono">PaymentEscrow.charge</span> attempts the transfer from an account that never signs, so the buyer\'s funds do not move and the run cannot settle. This is a contract defect, not configuration, and it is the gating item for D3 — until it is fixed, no amount of deployment or environment work produces a disputable run.',
      'It is public, reproducible and filed against the contracts repository. Sequencing the remaining D3 work behind it is the first thing <span class="mono">03-deliverable-D3-dispute-refund.md</span> in this bundle does.',
    ],
  },
  {
    file: "20-uat-defect-register.png",
    short: "QA",
    title: "The defect register: 27 defects logged this week",
    tag: "Independent QA — docs/uat/defects.md",
    url: "https://github.com/Bl0cksmiths/Orizon-Agents-UAT-Stellar/blob/main/docs/uat/defects.md",
    caption: [
      "QA logged <b>27 defects</b> this week (D-050 to D-076): one Blocker, two Critical, seven Major, seventeen Minor. Twenty-five are filed as public GitHub issues against the repository that owns the code. Two money-path defects are held privately — their mechanisms were handed to the key holder and the maintainers directly rather than published while the deployment cannot be patched, which is the correct handling.",
      "Eleven of the 27 were found against <b>our own hardening build</b>, which is what independent QA is for. One of them, D-067, is a regression our disclosure fix introduced: a payer who reopens their trace in a new tab loses their own dispute reason. QA's verdict on the 6.03 story card is <b>no-go</b>, and this bundle reports it as no-go.",
    ],
  },
  {
    file: "local-01-dispute-action-open-window.png",
    short: "UI · fixture",
    title: "The dispute action, with the window open",
    tag: "Shipped interface — local run against test fixtures",
    url: "https://github.com/Bl0cksmiths/Orizon-Agents-FE-Stellar/blob/main/components/disputes/receipt-panel.tsx",
    caption: [
      "<b>Captured locally against stubbed API responses, not from the deployed service.</b> The dispute surface cannot be reached on the deployment (see the two defects above), so these six images show the interface that shipped this week, rendered from the fixtures the end-to-end suite uses. Every amount and hash in them is a fixture that exists on no ledger.",
      "What it shows: the settlement view on the trace page — what each step cost, what is creditable under the policy, a live countdown to the window closing, and a Dispute button on each step still open to one.",
    ],
  },
  {
    file: "local-02-dispute-dialog.png",
    short: "UI · fixture",
    title: "Raising a dispute on one step",
    tag: "Shipped interface — local run against test fixtures",
    url: "https://github.com/Bl0cksmiths/Orizon-Agents-FE-Stellar/blob/main/components/disputes/dispute-dialog.tsx",
    caption: [
      "The form names the step being disputed, states the share of that step's charge an upheld dispute would credit, and takes the buyer's reason. Submitting asks the wallet to sign a one-time challenge; nothing was signed for this capture.",
      "Fixture capture, as above — the step, the agent and the amounts come from the test suite's fixtures.",
    ],
  },
  {
    file: "local-03-receipt-open-dispute.png",
    short: "UI · fixture",
    title: "An open dispute, waiting on the platform",
    tag: "Shipped interface — local run against test fixtures",
    url: "https://github.com/Bl0cksmiths/Orizon-Agents-FE-Stellar/blob/main/components/disputes/dispute-receipt.tsx",
    caption: [
      "The receipt while a dispute is open: the status the buyer is in, and one sentence saying what happens next. No refund row and no rating row, because neither exists yet — an absent artifact on an open dispute is not news, and the receipt does not pretend otherwise.",
      "Fixture capture, as above.",
    ],
  },
  {
    file: "local-04-receipt-credited.png",
    short: "UI · fixture",
    title: "A credited dispute: refund and rating, both confirmed",
    tag: "Shipped interface — local run against test fixtures",
    url: "https://github.com/Bl0cksmiths/Orizon-Agents-FE-Stellar/blob/main/components/disputes/dispute-receipt.tsx",
    caption: [
      "What a completed dispute looks like to the buyer: the amount credited, the refund transfer with its transaction and explorer link, and the negative rating written against the agent with its own. The two links are the evidence a reviewer checks; the receipt's job is to hand them over rather than to be believed.",
      "Fixture capture — <b>the hashes shown here exist on no ledger.</b> The two real testnet transactions in this document are shots 16 and 17, and their caveats are stated there.",
    ],
  },
  {
    file: "local-05-receipt-crediting-unconfirmed.png",
    short: "UI · fixture",
    title: "The state this epic exists to get right",
    tag: "Shipped interface — local run against test fixtures",
    url: "https://github.com/Bl0cksmiths/Orizon-Agents-FE-Stellar/blob/main/lib/disputes.ts",
    caption: [
      "A credit the platform has recorded whose transfer the chain has <b>not</b> confirmed. The badge reads “Refund in progress”, never “Refunded”; the row says there is no transaction on record rather than linking one; and the amount is stated as what is owed rather than what was received.",
      "This is the single most important behaviour in Epic 4, and the one the hardening pass was needed to secure: before it, the same state read “the credit is being sent to your wallet” under a success tick. A payment interface that overstates what has happened is worse than one that says nothing, because the buyer goes looking for a transaction that does not exist. Fixture capture, as above.",
    ],
  },
  {
    file: "local-06-receipt-rejected.png",
    short: "UI · fixture",
    title: "A rejected dispute, with the platform's reason",
    tag: "Shipped interface — local run against test fixtures",
    url: "https://github.com/Bl0cksmiths/Orizon-Agents-FE-Stellar/blob/main/components/disputes/dispute-receipt.tsx",
    caption: [
      "A buyer whose dispute is refused is told why, in the adjudicator's own words, and no credit line is drawn. The reason is shown to the payer only: a visitor who is not the payer is never sent it.",
      "Fixture capture, as above.",
    ],
  },
];

const COVER = {
  programme: "Stellar Instawards (Cohort 2026)",
  milestone:
    "M3 · Week 3 — Dispute Window & Partial-Credit Refund (Deliverable D3, Epic 4)",
  week: "Mon 2026-09-21 → Fri 2026-09-25",
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
      "PaymentEscrow",
      "CBJPTMAPMGODGZCZ2IMEQSRUX3WGUXNMKDTNN2KMJ3NFGYZ5OJ5525PI",
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
    eyebrow: "Summary · Week-3 delivery",
    title: "What we shipped in Week 3",
    html: `
  <p class="lead">This week we built <b>Deliverable D3 — the dispute window and partial-credit refund</b>: a buyer who pays for an agent workflow gets 24 hours to dispute any single step, and an upheld dispute credits part of that step's charge back to their wallet and writes a permanent negative rating against the agent on-chain.</p>
  <h3>The five stories, all merged to <code>main</code></h3>
  <ul>
    <li><b>4.02 — Dispute window and endpoint.</b> Every settlement stamps a 24-hour window on its own record. The payer opens a dispute against one step by signing a challenge with the wallet that paid; one dispute per step is a database rule, not a UI rule.</li>
    <li><b>4.03 — Settler-executed partial-credit refund.</b> The platform pays a configured share of the disputed step's charge from its own wallet, clamped three ways, with the mutex taken <i>before</i> the signature so no crash or second adjudicator can pay twice.</li>
    <li><b>4.04 — Negative on-chain rating.</b> An upheld dispute records the consequence on the ReputationLedger under a per-step derived job id, and that rating feeds the routing floor.</li>
    <li><b>4.05 — Dispute action on the trace view.</b> The buyer sees each step's charge, what is creditable, a countdown, and a Dispute button — offered to the paying wallet alone.</li>
    <li><b>4.06 — Dispute status and refund receipt.</b> Status, refund transfer and rating, each with its explorer link, and nothing shown as done until the chain confirms it.</li>
  </ul>
  <h3>Then we attacked it — story 4.07</h3>
  <p>Before declaring the epic done we audited everything it produced, on the rule that nothing counted as a finding until it had been reproduced against the running service. It found a <b>reproducible double payment</b>, a stale decision that could leave a dispute permanently unpayable, a misconfiguration that parked a payment mid-flight, the buyer's own words readable by a caller who had proved nothing, a flood that could deny every buyer their dispute window, a boot failure that printed secrets into the deploy log, a rating collision that lost half the ratings when one agent served two steps, and receipt copy that claimed a transfer existed when none had been submitted. Every fix carries a test that was written first and watched failing, and was then re-checked by putting the bug back.</p>
  <h3>The week in numbers</h3>
  <ul>
    <li><b>14 pull requests</b> merged across the public repositories; 1,295 commits; net +45,936 / −1,152 on <code>main</code>.</li>
    <li><b>908 authored commits</b> by the lead engineer (687 backend, 221 frontend), 849 of them touching exactly one file; <b>268 authored commits</b> of independent QA work, every one touching exactly one file.</li>
    <li>Backend <b>2,177 tests</b> at 92.53% coverage; frontend <b>1,503 unit</b> and <b>149 end-to-end</b> tests; CI green on <code>main</code> in both repositories.</li>
  </ul>`,
  },
  {
    eyebrow: "Summary · Deliverable D3",
    title: "Where D3 stands, stated plainly",
    html: `
  <p class="lead">D3 is <b>built, merged and independently QA'd. Its evidence run on the live deployment has not been captured</b>, for two separate reasons — and the first one is not configuration.</p>
  <h3>1 · No workflow settles on the deployment</h3>
  <p>A dispute window is stamped on a <b>settlement</b>. On the deployed service, <code>PaymentEscrow.charge</code> attempts the transfer from an account that never signs, so the buyer's funds do not move and no run records a settlement — which means no window is ever stamped and there is nothing to dispute. QA filed it as D-050 (<span class="mono">backend issue #67</span>) behind the contract-level cause D-039 (<span class="mono">contracts issue #3</span>). This is the gating item: until it is fixed, no deployment or environment work produces a disputable run.</p>
  <h3>2 · The refund path is switched off, on an older build</h3>
  <p>Asking the deployment to uphold a dispute answers <code>503 dispute_refunds_disabled</code>, and its published API description shows a build from before the hardening merge. Both are shown in this document.</p>
  <h3>What we do have, and what it is not</h3>
  <p>QA drove the <b>real backend code</b> through one uphold and it produced two real, confirmed testnet transactions: a refund transfer and a <code>kind="dispute"</code> rating, one ledger apart. They prove the path executes and yields verifiable artifacts. They are <b>not</b> D3: the asset is a test asset rather than USDC, the ledger is QA's own drill rather than the platform's, and the source account is a developer machine's rather than the deployment's signer — which is checkable on the Stellar Expert pages included here. Every screenshot of the interface in this document is likewise a local run against the test suite's fixtures, labelled as such on its own page, with hashes that exist on no ledger.</p>
  <h3>The remaining path to D3, in order</h3>
  <ol>
    <li>Fix the escrow charge so a paid run settles (contracts issue #3).</li>
    <li>Deploy the current <code>main</code>, which carries the hardening pass.</li>
    <li>Set an operator key and switch the refund path on; confirm the database is configured so settlements survive an idle spin-down; leave the refund ceiling at a finite value; decide the refund asset.</li>
    <li>Capture one run on the deployment producing both transactions, with the screen recording taken in the same session.</li>
  </ol>
  <p class="small">The written bundle this PDF accompanies sets all of this out with links: <span class="mono">Week-3-Tranche-Submission/03-deliverable-D3-dispute-refund.md</span>.</p>`,
  },
  {
    eyebrow: "Summary · Verification",
    title: "How to check any of this without trusting us",
    html: `
  <p class="lead">Every claim in this document resolves to something public: a merged pull request, a commit, a GitHub issue, a transaction on Stellar Expert, or a live endpoint you can call yourself.</p>
  <h3>Live endpoints</h3>
  <table class="tx">
    <tr><th>Check</th><th>Call</th></tr>
    <tr><td>Network and contract ids</td><td class="mono">GET orizon-agents-be-stellar.onrender.com/api/stellar/network</td></tr>
    <tr><td>Signer is the ledger's scorer</td><td class="mono">GET orizon-agents-be-stellar.onrender.com/readiness</td></tr>
    <tr><td>The six dispute routes exist</td><td class="mono">GET orizon-agents-be-stellar.onrender.com/openapi.json</td></tr>
    <tr><td>The refund switch is off</td><td class="mono">POST orizon-agents-be-stellar.onrender.com/api/disputes/{id}/uphold</td></tr>
  </table>
  <p class="small">The service runs on a free tier and sleeps; the first request can take 30–60 seconds.</p>
  <h3>Testnet transactions in this document</h3>
  <table class="tx">
    <tr><th>Artifact</th><th>Transaction hash</th></tr>
    <tr><td>Refund transfer (QA drill)</td><td class="mono">a5baac432b582787df0a632b3bc12916c51e12575a8f77bf267fd45b728701b8</td></tr>
    <tr><td>Dispute rating (QA drill)</td><td class="mono">7138e4e36e47f4f4404b2212aad5584d2f8fb941b387da76acae4c3b4cc07184</td></tr>
  </table>
  <p class="small">Each opens at <span class="mono">stellar.expert/explorer/testnet/tx/&lt;hash&gt;</span>. Both are drill transactions, as their pages in this document explain.</p>
  <h3>Independent QA</h3>
  <p>QA works in its own public repository, <span class="mono">Bl0cksmiths/Orizon-Agents-UAT-Stellar</span>, with its own Playwright suites, drills and evidence pages. This week it logged <b>27 defects</b> (D-050 to D-076) — 25 as public GitHub issues, two money-path defects held privately — of which <b>eleven were found against our own hardening build</b>, including one regression our disclosure fix introduced. Its verdict on the dispute story card is <b>no-go</b>, and this submission reports it as no-go.</p>
  <h3>The code</h3>
  <p class="small">Backend <span class="mono">github.com/Bl0cksmiths/Orizon-Agents-BE-Stellar</span> · frontend <span class="mono">github.com/Bl0cksmiths/Orizon-Agents-FE-Stellar</span> · QA <span class="mono">github.com/Bl0cksmiths/Orizon-Agents-UAT-Stellar</span> · contracts <span class="mono">github.com/Bl0cksmiths/Orizon-Agents-Smart-Contract-Stellar</span> · reference agent <span class="mono">github.com/Bl0cksmiths/Orizon-Agents-Example-Agent-Stellar</span>. Design records for this epic are in the backend repository under <span class="mono">docs/decisions/</span> (ADRs 0002, 0007, 0008, 0009) and the operator runbook is <span class="mono">docs/disputes.md</span>.</p>`,
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
  <h1>Orizon Agents — Week 3 Tranche Submission</h1>
  <div class="sub">Proof of Deliverables</div>
  <table class="facts">
    <tr><th>Programme</th><td>${esc(COVER.programme)}</td></tr>
    <tr><th>Milestone</th><td>${esc(COVER.milestone)}</td></tr>
    <tr><th>Sprint week</th><td>${esc(COVER.week)}</td></tr>
    <tr><th>Network</th><td><b>${esc(COVER.network)}</b></td></tr>
    <tr><th>Team</th><td>${COVER.team.map(([n, r, g]) => `${esc(n)} — ${esc(r)} (GitHub <span class="mono">${esc(g)}</span>)`).join("<br>")}</td></tr>
    <tr><th>Evidence captured</th><td>2026-09-26 — from the live testnet API, public GitHub and Stellar Expert pages, and a local run of the shipped interface against the test suite's fixtures. Every page states which of these it is, and its source URL.</td></tr>
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
<title>Orizon Agents — Week 3 Proof of Deliverables</title>
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
  footerTemplate: `<div style="width:100%;font-family:Inter,'DejaVu Sans',sans-serif;font-size:7.5px;color:#7a8394;padding:0 15mm;display:flex;justify-content:space-between"><span>Orizon Agents — Week 3 Tranche Submission · Proof of Deliverables · Stellar testnet</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`,
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
