# 05 — Pull requests (Week-4 window)

**GitHub Pull Request / Weekly Branch Evidence**

**Sprint week:** Mon 2026-09-28 → Fri 2026-10-02 (evidence assembled 2026-10-03)
**Milestone:** M4 · Week 4 — Ecosystem Validation Package (Deliverable **D4**, Epic 5)
**Network:** Stellar **testnet** only (SOW §3.6)

Every non-dependabot PR **merged 2026-09-28 → 2026-10-03 (Manila time)** across the five public repos, all in the `Bl0cksmiths` org, default branch `main`. PRs already listed in the Week-3 bundle are **not** repeated here. Every PR below merged into `main`; none was merged into a feature branch this week, and none is left open.

Merges are performed by the web-merge identity `ALGOREX-PH` (Dan). Each PR's **Commits** tab shows the individual author and date of every commit — that is where Rie's (`rie-hash14`) contributions are visible on the UAT PR.

---

## How a reviewer verifies each PR

Every link below opens a public PR. On each one:

| Criterion                            | Where to look on the PR page                                                 |
| ------------------------------------ | ---------------------------------------------------------------------------- |
| **Branch used this week**            | The header line: _"ALGOREX-PH merged N commits into `main` from `<branch>`"_ |
| **Commits made during the week**     | **Commits** tab — each commit is dated 2026-09-28 → 2026-10-03               |
| **Code changes for the deliverable** | **Files changed** tab — the diff for the story named in the title            |
| **Contributions per team member**    | **Commits** tab — the author avatar/login on each commit                     |

---

## Team contributions this week

| Team member                      | GitHub       | Role                    | Week-4 PRs                                                                                   | Commits                      |
| -------------------------------- | ------------ | ----------------------- | -------------------------------------------------------------------------------------------- | ---------------------------- |
| **Danielle Bagaforo Meer** (Dan) | `ALGOREX-PH` | Lead engineer           | 41 PRs across the backend, frontend, contracts and reference agent, plus the merge of UAT #5 | 1,801 authored (sprint week) |
| **Rieselle Saure** (Rie)         | `rie-hash14` | Project management + QA | [UAT #5](https://github.com/Bl0cksmiths/Orizon-Agents-UAT-Stellar/pull/5)                    | **403** authored, all hers   |

Per-person counts, the commands behind them and the per-repo split are in [`02-commit-visibility.md`](./02-commit-visibility.md).

---

## Primary evidence — one PR per repo

If a single link per repo is required, these are the Week-4 PRs that carry the week's named deliverable:

| Repo            | PR                                                                                         | Branch (head → base)                  | Commits                   | Covers                                                                                                                    |
| --------------- | ------------------------------------------------------------------------------------------ | ------------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Contracts       | [Contracts #4](https://github.com/Bl0cksmiths/Orizon-Agents-Smart-Contract-Stellar/pull/4) | `feat/escrow-v2` → `main`             | 15                        | PaymentEscrow v2 — custody at authorize, per-operator settlement, settler rotation; fixes the Week-3 blocker D-039        |
| Backend         | [BE #88](https://github.com/Bl0cksmiths/Orizon-Agents-BE-Stellar/pull/88)                  | `feat/5.01-integration` → `main`      | 115                       | 5.01 — settle every paid run through escrow v2                                                                            |
| Frontend        | [FE #97](https://github.com/Bl0cksmiths/Orizon-Agents-FE-Stellar/pull/97)                  | `fix/5-audit-fe-integration` → `main` | 679                       | 5.03–5.06 — the operator guide, the demo page, the public evidence index, the litepaper and the MIT licence               |
| Reference agent | [Agent #6](https://github.com/Bl0cksmiths/Orizon-Agents-Example-Agent-Stellar/pull/6)      | `feat/5.01-fault-mode` → `main`       | 11                        | 5.01 AC5 — opt-in fault injection, so a failing agent can be tested on testnet                                            |
| UAT (Rie)       | [UAT #5](https://github.com/Bl0cksmiths/Orizon-Agents-UAT-Stellar/pull/5)                  | `uat` → `main`                        | 403 (all by `rie-hash14`) | Week-4 QA: 6.04 independent on-chain verification, the 6.02 re-check, 6.03 re-run on escrow v2, 6.08, 6.09, D-077 → D-092 |

The full list for each repo follows.
