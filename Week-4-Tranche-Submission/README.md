# Orizon Agents — Week 4 Tranche Submission

**Programme:** Stellar Instawards (Cohort 2026)
**Project:** Orizon Agents — Blue Belt Instaward Sprint
**Milestone:** M4 · Week 4 — Ecosystem Validation Package (Deliverable **D4**, Epic 5)
**Sprint week:** Mon 2026-09-28 → Fri 2026-10-02 (evidence assembled 2026-10-03)
**Network:** Stellar **testnet** only (SOW §3.6)

**Team (approved SOW §1):**

- **Danielle Bagaforo Meer** — lead engineer (git `algorexph@gmail.com`, GitHub `ALGOREX-PH`)
- **Rieselle Saure ("Rie")** — project management + QA (GitHub `rie-hash14`)

---

## What this bundle is

This is the Week-4 evidence package for the tranche gate (story 7.01). Every claim below links to a public, independently verifiable artifact — a public GitHub PR, commit or issue, a transaction on Stellar Expert (testnet), a live page on [orizons.xyz](https://orizons.xyz) or a live API endpoint.

**Read this first.** Week 4 is the week the money path came alive. The Week-3 bundle reported Deliverable D3 built but unprovable on the deployment, because the v1 payment escrow could not move a buyer's funds (D-039) and dispute refunds were switched off. This week a new escrow, **PaymentEscrow v2**, was written, tested, deployed to testnet on 2026-09-30 and switched on — and the same day the deployment settled paid runs, upheld a dispute and paid the credit, settled a partial delivery, and credited a dispute raised after a backend restart. On top of it, all six Epic 5 stories shipped: Deliverable D4's demo, operator guide, outside registrations, settlements and litepaper are published, and the public evidence index at [orizons.xyz/evidence](https://orizons.xyz/evidence) marks every deliverable item present and 10 of 10 success metrics met. Two limits are stated wherever they apply: the settlements and dispute credits are **the team's own test runs**, in testnet XLM, because no outside operator's agent is yet bound to a live endpoint; and **independent QA has not signed off** — Rie's verdict and her open defects are reported as she wrote them.

## Contents

| File                                                                                       | What it covers                                                                                                                                                                                                                          |
| ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`01-tasks-completed.md`](./01-tasks-completed.md)                                         | Everything completed this week — Dan: escrow v2 and the six Epic 5 stories, accurate public figures, the quality gates; Rie: five QA cards, her verdicts, and the 16 defects she logged                                                 |
| [`02-commit-visibility.md`](./02-commit-visibility.md)                                     | Multi-contributor proof (SDF rule) — Dan's and Rie's public commits this week, per repository, with the commands used                                                                                                                   |
| [`03-deliverable-D4-ecosystem-validation.md`](./03-deliverable-D4-ecosystem-validation.md) | **The D4 deliverable** — the demo, the guide, the outside registrations, the settlements and the litepaper against the SOW's own wording; the ten metrics; and **D1–D3 now evidenced live on escrow v2**                                |
| [`04-escrow-v2-and-the-money-path.md`](./04-escrow-v2-and-the-money-path.md)               | Why v1 could not settle, what escrow v2 does, what each live transaction proves, what changed from the SOW, and what is still open on the money path                                                                                    |
| [`05-pull-requests.md`](./05-pull-requests.md)                                             | **GitHub PR / weekly branch evidence** — all 42 PRs merged in the window across the five public repositories, with branch, merge date, commits, diff size and contributor                                                               |
| [`06-compliance-cadence.md`](./06-compliance-cadence.md)                                   | Weekly cadence: this evidence bundle, commit visibility, the published demo, and what is not linked here                                                                                                                                |
| [`screenshots/`](./screenshots/)                                                           | 28 frames captured on 2026-10-03 from the live site, the live API, GitHub and Stellar Expert, plus eight stills and two recordings of the live site from 2026-09-30 — with the capture script and a manifest naming each frame's source |
| [`technical-documentation/`](./technical-documentation/)                                   | The source of the technical documentation PDF, its 2x close-ups and their capture script                                                                                                                                                |

**The two PDFs.** [`Proof-of-Deliverables.pdf`](./Proof-of-Deliverables.pdf) (35 pages) captions every piece of evidence in this bundle: the week's key pull requests and both repositories' merged-PR lists, QA's commits, the live home page, evidence index, demo, guide and litepaper, three live API responses, escrow v2 and its transactions on Stellar Expert — settlement, dispute credit and rating, partial delivery, the restart dispute and an outside registration — the closed Week-3 blocker, and QA's own status. [`Technical-Documentation-and-Demo-Evidence.pdf`](./Technical-Documentation-and-Demo-Evidence.pdf) (19 pages) is the illustrated walkthrough: listing an agent as an outside operator, the money path on escrow v2 as a buyer meets it, how to verify the deployment and the chain yourself, independent QA, the demo, the evidence index, and what is still open. Their sources are in [`screenshots/`](./screenshots/) and [`technical-documentation/`](./technical-documentation/), each with a manifest naming every image's origin.

Every screenshot in both documents is of the live deployment or a public GitHub or Stellar Expert page — unlike Week 3, none is a local run against test fixtures — and each carries its source URL and capture time. The settlements and credits they show are the team's own test runs, and every page that shows one says so.

## The five public repositories

| Repo                                                                                                        | Purpose                                                             | Licence |
| ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ------- |
| [Orizon-Agents-FE-Stellar](https://github.com/Bl0cksmiths/Orizon-Agents-FE-Stellar)                         | Next.js frontend (the dApp at [orizons.xyz](https://orizons.xyz))   | MIT     |
| [Orizon-Agents-BE-Stellar](https://github.com/Bl0cksmiths/Orizon-Agents-BE-Stellar)                         | FastAPI backend + Soroban integration                               | MIT     |
| [Orizon-Agents-Smart-Contract-Stellar](https://github.com/Bl0cksmiths/Orizon-Agents-Smart-Contract-Stellar) | The Soroban contracts + the deployed address book                   | MIT     |
| [Orizon-Agents-Example-Agent-Stellar](https://github.com/Bl0cksmiths/Orizon-Agents-Example-Agent-Stellar)   | The copyable reference agent for outside operators                  | MIT     |
| [Orizon-Agents-UAT-Stellar](https://github.com/Bl0cksmiths/Orizon-Agents-UAT-Stellar)                       | Rie's end-to-end UAT suite (Playwright) against the live deployment | —       |

All four code repositories the SOW names (and the reference agent) now carry an MIT licence that GitHub detects — added this week by frontend [#97](https://github.com/Bl0cksmiths/Orizon-Agents-FE-Stellar/pull/97), backend [#94](https://github.com/Bl0cksmiths/Orizon-Agents-BE-Stellar/pull/94) and contracts [#5](https://github.com/Bl0cksmiths/Orizon-Agents-Smart-Contract-Stellar/pull/5).

## Deployed testnet contract ids

Read live from [`GET /api/stellar/network`](https://orizon-agents-be-stellar.onrender.com/api/stellar/network) on 2026-10-03 at 07:37 UTC. One id changed this week: **PaymentEscrow is now escrow v2**, deployed on 2026-09-30 and switched on by the live API the same day.

| Contract            | Id                                                                                                                                                                      | Change this week                                                                                               |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| AgentRegistry       | [`CAPHXWU53UZUZJGV7IAE57NNMH3YYB5MTWO6YA53KKMXSFVLOITBJ3GQ`](https://stellar.expert/explorer/testnet/contract/CAPHXWU53UZUZJGV7IAE57NNMH3YYB5MTWO6YA53KKMXSFVLOITBJ3GQ) | unchanged                                                                                                      |
| ReputationLedger    | [`CDCSOBEVZUPQZV5GV4D6KYHZCLNGW2KXY74RUHSZ3EZUXF34DPW422ZT`](https://stellar.expert/explorer/testnet/contract/CDCSOBEVZUPQZV5GV4D6KYHZCLNGW2KXY74RUHSZ3EZUXF34DPW422ZT) | unchanged                                                                                                      |
| PaymentEscrow (v2)  | [`CCNO5TENCK3EK532I3OZLZ63323FEEULPAKJ74CUP3JZK3XQINRQ5VC4`](https://stellar.expert/explorer/testnet/contract/CCNO5TENCK3EK532I3OZLZ63323FEEULPAKJ74CUP3JZK3XQINRQ5VC4) | **new** — replaces v1 `CBJPTMAPMGODGZCZ2IMEQSRUX3WGUXNMKDTNN2KMJ3NFGYZ5OJ5525PI`, created 2026-09-30 08:31 UTC |
| AttestationRegistry | [`CBYUZKOET43UXTBXZUJIBBJW5ODGD2J2AZVVXCR3QONGOCAHOXQQHEGK`](https://stellar.expert/explorer/testnet/contract/CBYUZKOET43UXTBXZUJIBBJW5ODGD2J2AZVVXCR3QONGOCAHOXQQHEGK) | unchanged                                                                                                      |
| Asset SAC (native)  | [`CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC`](https://stellar.expert/explorer/testnet/contract/CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC) | unchanged — testnet settles in native XLM, and the app labels amounts XLM on testnet                           |

The live readiness report ([`GET /readiness`](https://orizon-agents-be-stellar.onrender.com/readiness)) confirms the switch: `escrow.version: 2`, `escrow.contract: CCNO5TEN…5VC4`, dispute store `postgres`, refund reconciliation enabled and running.
