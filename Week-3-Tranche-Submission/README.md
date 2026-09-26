# Orizon Agents — Week 3 Tranche Submission

**Programme:** Stellar Instawards (Cohort 2026)
**Project:** Orizon Agents — Blue Belt Instaward Sprint
**Milestone:** M3 · Week 3 — Dispute Window & Partial-Credit Refund (Deliverable **D3**, Epic 4)
**Sprint week:** Mon 2026-09-21 → Fri 2026-09-25 (evidence assembled 2026-09-26)
**Network:** Stellar **testnet** only (SOW §3.6)

**Team (approved SOW §1):**

- **Danielle Bagaforo Meer** — lead engineer (git `algorexph@gmail.com`, GitHub `ALGOREX-PH`)
- **Rieselle Saure ("Rie")** — project management + QA (GitHub `rie-hash14`)

---

## What this bundle is

This is the Week-3 evidence package for the tranche gate (story 7.01). Every claim below links to a public, independently verifiable artifact — a public GitHub PR or commit, a GitHub issue, an on-chain transaction on Stellar Expert (testnet), a live endpoint, or a Linear ticket.

**Read this first.** Deliverable D3 is **built, merged and independently QA'd, but its on-chain evidence run on the live deployment has not been captured yet**, for two separate reasons:

1. **No workflow settles on the deployment.** `PaymentEscrow.charge` cannot move the payer's funds (defect D-039, [contracts #3](https://github.com/Bl0cksmiths/Orizon-Agents-Smart-Contract-Stellar/issues/3), surfacing as D-050, [backend #67](https://github.com/Bl0cksmiths/Orizon-Agents-BE-Stellar/issues/67)). A dispute window is stamped on a settlement, so with nothing settling there is nothing to dispute. This is a contract-level defect, not configuration, and it is the first thing that has to be fixed.
2. **Dispute refunds are switched off on the deployment**, which is also running a build that predates the week's hardening merge.

The two real testnet transactions in this bundle — a refund transfer and a `kind="dispute"` rating, both re-read on Horizon — were produced by QA running the real backend code against a drill ReputationLedger with a test asset. They prove the code path, and they are **not** Deliverable 3: the asset is not USDC, the ledger is not the platform's, and the source account is not the deployment's signer. [`03`](./03-deliverable-D3-dispute-refund.md) sets out every prerequisite in order, and QA's own verdict on the 6.03 card is **no-go** with four criteria still failing in code.

## Contents

| File                                                                                     | What it covers                                                                                                                                                                       |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [`01-tasks-completed.md`](./01-tasks-completed.md)                                       | Everything completed this week — Dan: Epic 4 stories 4.02–4.06 and the 4.07 hardening pass; Rie: the seven 6.03 QA sub-stories, 6.02 and 6.04, the drills and 26 logged defects       |
| [`02-commit-visibility.md`](./02-commit-visibility.md)                                   | Multi-contributor proof (SDF rule) — Dan's and Rie's public commits this week, per repository, with the commands used                                                                 |
| [`03-deliverable-D3-dispute-refund.md`](./03-deliverable-D3-dispute-refund.md)           | **The D3 deliverable** — the window, who may dispute, the refund, the on-chain rating and the receipt; the live deployment's state; the evidence that exists and the evidence that does not |
| [`04-money-path-safety.md`](./04-money-path-safety.md)                                   | How the path that moves the platform's own funds is made safe, what attacking our own implementation found before shipping it, and QA's independent findings on the same path         |
| [`05-pull-requests.md`](./05-pull-requests.md)                                           | **GitHub PR / weekly branch evidence** — every Week-3 PR across the public repositories, with branch, merge date, commits, diff size and contributor                                  |
| [`06-compliance-cadence.md`](./06-compliance-cadence.md)                                 | Weekly cadence: the public build post (7.02), the mid-week check-in (7.03), commit visibility (7.04) and this evidence bundle (7.01)                                                  |

**Not in this bundle, and why.** Week 1 and Week 2 each carried a `Proof-of-Deliverables.pdf`, a `Technical-Documentation-and-Demo-Evidence.pdf` and a `screenshots/` folder. The Week-3 equivalents are deliberately held back: the screenshots and the walkthrough that matter for D3 are the dispute action, the upheld refund and the receipt with its two Stellar Expert links, and those can only be captured honestly from a deployment with refunds switched on. They will be added in the same session that captures the D3 evidence run. Nothing in this bundle presents a drill capture or a test fixture as live behaviour.

## The five public repositories

| Repo                                                                                                        | Purpose                                                             |
| ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| [Orizon-Agents-FE-Stellar](https://github.com/Bl0cksmiths/Orizon-Agents-FE-Stellar)                         | Next.js frontend (the dApp)                                         |
| [Orizon-Agents-BE-Stellar](https://github.com/Bl0cksmiths/Orizon-Agents-BE-Stellar)                         | FastAPI backend + Soroban integration                               |
| [Orizon-Agents-UAT-Stellar](https://github.com/Bl0cksmiths/Orizon-Agents-UAT-Stellar)                       | Rie's end-to-end UAT suite (Playwright) against the live deployment  |
| [Orizon-Agents-Smart-Contract-Stellar](https://github.com/Bl0cksmiths/Orizon-Agents-Smart-Contract-Stellar) | The Soroban contracts + the deployed address book                   |
| [Orizon-Agents-Example-Agent-Stellar](https://github.com/Bl0cksmiths/Orizon-Agents-Example-Agent-Stellar)   | The copyable reference agent for external operators                 |

Epic 4 required no contract change, so the contracts and reference-agent repositories have no commits this week; the dispute rating is written through the ReputationLedger already deployed in Week 2.

## Deployed testnet contract ids (unchanged this week)

Read live from `GET /api/stellar/network` on 2026-09-26:

| Contract            | Id                                                         |
| ------------------- | ---------------------------------------------------------- |
| AgentRegistry       | `CAPHXWU53UZUZJGV7IAE57NNMH3YYB5MTWO6YA53KKMXSFVLOITBJ3GQ` |
| ReputationLedger    | `CDCSOBEVZUPQZV5GV4D6KYHZCLNGW2KXY74RUHSZ3EZUXF34DPW422ZT` |
| PaymentEscrow       | `CBJPTMAPMGODGZCZ2IMEQSRUX3WGUXNMKDTNN2KMJ3NFGYZ5OJ5525PI` |
| AttestationRegistry | `CBYUZKOET43UXTBXZUJIBBJW5ODGD2J2AZVVXCR3QONGOCAHOXQQHEGK` |
| Asset SAC           | `CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC` |

## Week-3 status at a glance

- **Build (Epic 4): complete.** Stories 4.02, 4.03, 4.04, 4.05 and 4.06 — **28 story points** — are done and merged to `main` in both repositories, followed by a dedicated hardening pass (4.07). Fourteen pull requests merged across the public repositories this week, carrying 1,295 commits and a net +45,936 / −1,152 on `main`. See [`01`](./01-tasks-completed.md) and [`05`](./05-pull-requests.md).
- **D3 built, not yet evidenced on the deployment.** A buyer gets a 24-hour window, disputes a single step with a wallet signature, and an upheld dispute credits part of that step's charge back and writes a permanent negative rating against the agent. The deployment has refunds switched off — see [`03`](./03-deliverable-D3-dispute-refund.md) for exactly what is outstanding.
- **We attacked our own money path before shipping it.** A full audit pass over Epic 4, with nothing counted as a finding until it was reproduced against the running service, then fixed with a test written first and watched failing. It caught a reproducible double-payment, an unpayable-dispute wedge, a disclosure hole on the buyer's own words, a denial-of-service on the dispute window, a boot failure that printed secrets into the deploy log, and receipt copy that claimed a transfer existed when none had been submitted — all before any of it was reachable by a user. See [`04`](./04-money-path-safety.md).
- **Independent QA closed all seven 6.03 sub-stories** and logged 27 defects (D-050 to D-076), 25 of them filed as public GitHub issues; two money-path defects are held privately while the deployment cannot be patched. Eleven of the defects were found against our own hardening build, which is what independent QA is for. Two older cards (6.02 from Week 2, 6.04 from Week 4) were also closed this week — [`01`](./01-tasks-completed.md) says what those closures do and do not cover. See also [`04`](./04-money-path-safety.md).
- **Multi-contributor cadence met:** Dan authored **908** commits this week (687 backend, 221 frontend) plus 44 merge commits — 951 in GitHub's combined author view, 717 backend and 234 frontend. Rie authored **268** commits of QA work in the public UAT repository plus 12 merges, 280 in total. Of Dan's 908 authored commits, 849 touch exactly one file, and all 268 of Rie's touch exactly one — see [`02`](./02-commit-visibility.md) for the commands and the per-day breakdown.
- **Quality:** backend 2,177 tests passing at 92.5% coverage (floor 82%), strict type checking clean across 106 modules; frontend 1,503 unit tests and 149 end-to-end tests passing, accessibility and phone-width checked, every route inside the 480 KB first-load budget. CI green on `main` in both repositories.
- **Programme cadence is not fully met for Week 3.** The public build post (7.02) and this bundle (7.01) are both still open in Linear, and the Wednesday check-in (7.03) has only a pre-meeting note against it — see [`06`](./06-compliance-cadence.md). Stated here rather than left to be discovered.
