# Orizon Agents — Week 1 Tranche Submission

**Programme:** Stellar Community Fund — Blue Belt Instawards (Cohort 2026)
**Project:** Orizon Agents — Blue Belt Instaward Sprint
**Milestone:** M1 · Week 1 — Permissionless Agent Registration (Deliverable **D1**)
**Sprint week:** Mon 2026-09-07 → Fri 2026-09-11 (evidence assembled 2026-09-12)
**Network:** Stellar **testnet** only (SOW §3.6)

**Team (approved SOW §1):**
- **Danielle Bagaforo Meer** — lead engineer (git `algorexph@gmail.com`)
- **Rieselle Saure ("Rie")** — project management + QA (GitHub `rie-hash14`)

---

## What this bundle is

This is the Week-1 evidence package for the tranche gate (story 7.01). Every
claim below links to a public, independently verifiable artifact — an on-chain
transaction on Stellar Expert (testnet), a public GitHub commit or PR, or a
Linear ticket. Screenshots of the key artifacts are in [`screenshots/`](./screenshots/).

## Contents

| File | What it covers |
|------|----------------|
| [`01-dan-tasks-completed.md`](./01-dan-tasks-completed.md) | Everything Danielle (Dan) shipped this week — the full build, both spikes, hardening, deployment |
| [`02-commit-visibility.md`](./02-commit-visibility.md) | Multi-contributor proof (SDF rule) — Dan's and Rie's public commits |
| [`03-deliverable-D1-registration.md`](./03-deliverable-D1-registration.md) | The D1 deliverable — permissionless registration on testnet + tx evidence |
| [`04-spikes-and-refund.md`](./04-spikes-and-refund.md) | The two Week-1 decision spikes (1.06, 4.01) + the live refund tx |
| [`05-pull-requests.md`](./05-pull-requests.md) | Every PR across the four public repos this week |
| [`06-compliance-cadence.md`](./06-compliance-cadence.md) | Weekly cadence: X post (7.02), check-in (7.03), commit visibility (7.04) |
| [`Proof-of-Deliverables.pdf`](./Proof-of-Deliverables.pdf) | **Proof of deliverables** — one PDF: the testnet marketplace (with the registered agent), the D1 registration + 4.01 refund txs on Stellar Expert, and the register / reputation / orchestrator screens, each captioned with the deliverable it proves |
| [`screenshots/`](./screenshots/) | Captured evidence images + manifest |

## The four public repositories

| Repo | Purpose |
|------|---------|
| [Orizon-Agents-FE-Stellar](https://github.com/Bl0cksmiths/Orizon-Agents-FE-Stellar) | Next.js frontend (the dApp) |
| [Orizon-Agents-BE-Stellar](https://github.com/Bl0cksmiths/Orizon-Agents-BE-Stellar) | FastAPI backend + Soroban integration |
| [Orizon-Agents-UAT-Stellar](https://github.com/Bl0cksmiths/Orizon-Agents-UAT-Stellar) | Rie's end-to-end UAT suite (Playwright) against the live deployment |
| [Orizon-Agents-Smart-Contract-Stellar](https://github.com/Bl0cksmiths/Orizon-Agents-Smart-Contract-Stellar) | The Soroban contracts |

## Deployed testnet contract ids

| Contract | Id |
|----------|----|
| AgentRegistry | `CAPHXWU53UZUZJGV7IAE57NNMH3YYB5MTWO6YA53KKMXSFVLOITBJ3GQ` |
| ReputationLedger | `CDCSOBEVZUPQZV5GV4D6KYHZCLNGW2KXY74RUHSZ3EZUXF34DPW422ZT` |
| PaymentEscrow | `CBJPTMAPMGODGZCZ2IMEQSRUX3WGUXNMKDTNN2KMJ3NFGYZ5OJ5525PI` |
| AttestationRegistry | `CBYUZKOET43UXTBXZUJIBBJW5ODGD2J2AZVVXCR3QONGOCAHOXQQHEGK` |
| Asset SAC | `CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC` |

## Week-1 status at a glance

- **Build (Epic 1): complete** — all of stories 1.01–1.11 done and merged; the permissionless registration path is deployed and proven on testnet with real transactions.
- **D1 met:** a wallet-signed agent registration is live on testnet and verifiable on Stellar Expert — see [`03`](./03-deliverable-D1-registration.md).
- **Both Week-1 decision spikes closed:** 1.06 (external execution) and 4.01 (partial-credit refund), the latter with a **real refund landed on testnet**.
- **Multi-contributor cadence met:** both approved members have public, role-relevant commits.
