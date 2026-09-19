# Orizon Agents — Week 2 Tranche Submission

**Programme:** Stellar Instawards (Cohort 2026)
**Project:** Orizon Agents — Blue Belt Instaward Sprint
**Milestone:** M2 · Week 2 — Reputation-Gated Routing (Deliverable **D2**) + the External Agent Execution Path (Epic 2)
**Sprint week:** Mon 2026-09-14 → Fri 2026-09-18 (evidence assembled 2026-09-19)
**Network:** Stellar **testnet** only (SOW §3.6)

**Team (approved SOW §1):**

- **Danielle Bagaforo Meer** — lead engineer (git `algorexph@gmail.com`, GitHub `ALGOREX-PH`)
- **Rieselle Saure ("Rie")** — project management + QA (GitHub `rie-hash14`)

---

## What this bundle is

This is the Week-2 evidence package for the tranche gate (story 7.01). Every claim below links to a public, independently verifiable artifact — a public GitHub PR or commit, an on-chain transaction on Stellar Expert (testnet), a live endpoint, or a Linear ticket. Screenshots of the key artifacts are in [`screenshots/`](./screenshots/).

## Contents

| File                                                                                   | What it covers                                                                                                                                                              |
| -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`01-tasks-completed.md`](./01-tasks-completed.md)                             | Everything completed this week — Dan: Epic 2, Epic 3, BLO-121, hardening, design records; Rie: Week-2 QA (6.05, 6.06), 6.01 closed, defects, cadence                                                                            |
| [`02-commit-visibility.md`](./02-commit-visibility.md)                                 | Multi-contributor proof (SDF rule) — Dan's and Rie's public commits this week                                                                                               |
| [`03-deliverable-D2-reputation-routing.md`](./03-deliverable-D2-reputation-routing.md) | The D2 deliverable — reputation-gated routing on the live plan card, the live floor parameters, and on-chain ratings from production                                         |
| [`04-external-execution-path.md`](./04-external-execution-path.md)                     | Epic 2 — how an externally operated agent receives, verifies and answers a signed workflow step; its security properties and QA                                             |
| [`05-pull-requests.md`](./05-pull-requests.md)                                         | **GitHub PR / weekly branch evidence** — all 27 Week-2 PRs across five public repos, with branch, commits, changes and contributor                                          |
| [`06-compliance-cadence.md`](./06-compliance-cadence.md)                               | Weekly cadence: X post (7.02), commit visibility (7.04) and this evidence bundle (7.01)                                                                          |
| [`Proof-of-Deliverables.pdf`](./Proof-of-Deliverables.pdf)                             | **Proof of deliverables** — one PDF: a summary of what shipped and of the Stellar integration, then the live plan card, marketplace, operator surfaces, readiness, the week's PRs and the on-chain scorer authorization, each captioned with what it proves |
| [`Technical-Documentation-and-Demo-Evidence.pdf`](./Technical-Documentation-and-Demo-Evidence.pdf) | **Technical documentation & demo evidence** — one PDF: every link at a glance (live app, API, docs, demo video, Stellar Expert contracts and transactions), then illustrated step-by-step walkthroughs of reputation-gated routing, the external agent path, marketplace standing and on-chain verification; source in [`technical-documentation/`](./technical-documentation/) |
| [`screenshots/`](./screenshots/)                                                       | Captured evidence images + manifest + the capture script                                                                                                                    |

## The five public repositories

| Repo                                                                                                        | Purpose                                                                 |
| ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| [Orizon-Agents-FE-Stellar](https://github.com/Bl0cksmiths/Orizon-Agents-FE-Stellar)                         | Next.js frontend (the dApp)                                             |
| [Orizon-Agents-BE-Stellar](https://github.com/Bl0cksmiths/Orizon-Agents-BE-Stellar)                         | FastAPI backend + Soroban integration                                   |
| [Orizon-Agents-UAT-Stellar](https://github.com/Bl0cksmiths/Orizon-Agents-UAT-Stellar)                       | Rie's end-to-end UAT suite (Playwright) against the live deployment     |
| [Orizon-Agents-Smart-Contract-Stellar](https://github.com/Bl0cksmiths/Orizon-Agents-Smart-Contract-Stellar) | The Soroban contracts + the deployed address book                       |
| [Orizon-Agents-Example-Agent-Stellar](https://github.com/Bl0cksmiths/Orizon-Agents-Example-Agent-Stellar)   | **New this week** — the copyable reference agent for external operators |

## Deployed testnet contract ids (unchanged this week)

| Contract            | Id                                                         |
| ------------------- | ---------------------------------------------------------- |
| AgentRegistry       | `CAPHXWU53UZUZJGV7IAE57NNMH3YYB5MTWO6YA53KKMXSFVLOITBJ3GQ` |
| ReputationLedger    | `CDCSOBEVZUPQZV5GV4D6KYHZCLNGW2KXY74RUHSZ3EZUXF34DPW422ZT` |
| PaymentEscrow       | `CBJPTMAPMGODGZCZ2IMEQSRUX3WGUXNMKDTNN2KMJ3NFGYZ5OJ5525PI` |
| AttestationRegistry | `CBYUZKOET43UXTBXZUJIBBJW5ODGD2J2AZVVXCR3QONGOCAHOXQQHEGK` |
| Asset SAC           | `CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC` |

The 6-hourly post-deploy smoke test now checks that the live backend serves exactly these ids.

## Week-2 status at a glance

- **Build (Epic 2 + Epic 3): complete** — all six Epic 2 stories and all Week-2 Epic 3 stories (3.02–3.07) done, merged and deployed; **55 story points** plus the BLO-121 fix.
- **D2 built and live:** the plan card shows each agent's reputation, its source and the floor applied, before the buyer pays — see [`03`](./03-deliverable-D2-reputation-routing.md).
- **On-chain ratings live for production:** every paid run is rated, `/readiness` verifies that production's signer is the ReputationLedger's authorized scorer, and that authorization is on-chain (tx `216e1b5f…`, 2026-09-19) — see [`03`](./03-deliverable-D2-reputation-routing.md).
- **External agents can now do real work:** endpoint binding, signed dispatch, failure semantics, the reference agent and the operator dashboard — see [`04`](./04-external-execution-path.md).
- **Multi-contributor cadence met:** Dan 1,080 authored commits; Rie 137 authored commits of QA work — see [`02`](./02-commit-visibility.md).
- **Quality:** backend 1,534 tests passing (91.2% coverage); frontend 981 unit + 105 end-to-end tests passing, accessibility and phone-width checked; CI green on `main` in both repos.
