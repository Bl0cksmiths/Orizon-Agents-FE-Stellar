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

---

## Merged this week — 42 PRs

### Backend — [Orizon-Agents-BE-Stellar](https://github.com/Bl0cksmiths/Orizon-Agents-BE-Stellar) · 14 PRs · 737 commits landed on `main` · +52,596 / −1,966

| PR                                                                       | Deliverable                                                                                                 | Merged (UTC)     | head → base                                   | Commits | Lines            |
| ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- | ---------------- | --------------------------------------------- | ------- | ---------------- |
| [#87](https://github.com/Bl0cksmiths/Orizon-Agents-BE-Stellar/pull/87)   | **Week-3 carry-over** — QA money-path fixes, Epic 3 and 4 hardening, refund tagging and the reconcile sweep | 2026-09-27 18:04 | `feat/refund-tag-and-reconcile` → `main`      | 231     | +15,213 / −1,388 |
| [#88](https://github.com/Bl0cksmiths/Orizon-Agents-BE-Stellar/pull/88)   | **5.01** Settle through escrow v2, bind authorizations to plans, fresh reputation, lifecycle harness        | 2026-09-28       | `feat/5.01-integration` → `main`              | 115     | +11,842 / −158   |
| [#89](https://github.com/Bl0cksmiths/Orizon-Agents-BE-Stellar/pull/89)   | **5.02** Verifiable adoption metrics, operator readiness, and the onboarding kit                            | 2026-09-28       | `feat/5.02-integration` → `main`              | 48      | +7,305 / −3      |
| [#94](https://github.com/Bl0cksmiths/Orizon-Agents-BE-Stellar/pull/94)   | **5.03–5.05** Friction coverage, demo tools, SOW metrics, MIT licence and audit fixes                       | 2026-09-29       | `fix/5-audit-integration` → `main`            | 214     | +12,719 / −142   |
| [#95](https://github.com/Bl0cksmiths/Orizon-Agents-BE-Stellar/pull/95)   | **5.02 / 5.05** Friction entries from the first outside-operator trial; Epic 5 progress                     | 2026-09-30       | `docs/friction-first-external-trial` → `main` | 11      | +588 / −40       |
| [#96](https://github.com/Bl0cksmiths/Orizon-Agents-BE-Stellar/pull/96)   | **5.01** Declare the escrow v2 test buyer in the team wallet register                                       | 2026-09-30       | `chore/declare-v2-test-keys` → `main`         | 3       | +8 / −2          |
| [#97](https://github.com/Bl0cksmiths/Orizon-Agents-BE-Stellar/pull/97)   | **5.01** Docs: escrow v2 live on testnet, with the team runs' evidence                                      | 2026-09-30       | `docs/escrow-v2-live` → `main`                | 36      | +815 / −48       |
| [#98](https://github.com/Bl0cksmiths/Orizon-Agents-BE-Stellar/pull/98)   | **5.04** The demo description's limitations derived from the verified rows                                  | 2026-09-30       | `fix/demo-evidence-limitations` → `main`      | 9       | +393 / −19       |
| [#99](https://github.com/Bl0cksmiths/Orizon-Agents-BE-Stellar/pull/99)   | **5.01** Recorded the first real dispute credit                                                             | 2026-09-30       | `docs/first-dispute-credit` → `main`          | 10      | +116 / −21       |
| [#100](https://github.com/Bl0cksmiths/Orizon-Agents-BE-Stellar/pull/100) | **5.01 AC4** A dispute survives a backend restart                                                           | 2026-09-30       | `fix/dispute-survives-restart` → `main`       | 8       | +650 / −73       |
| [#101](https://github.com/Bl0cksmiths/Orizon-Agents-BE-Stellar/pull/101) | **5.01 AC5** Partial delivery proved; multi-agent plans in the harness                                      | 2026-09-30       | `feat/partial-delivery-proof` → `main`        | 6       | +896 / −56       |
| [#102](https://github.com/Bl0cksmiths/Orizon-Agents-BE-Stellar/pull/102) | **5.01 AC4 + AC5** Live evidence for both                                                                   | 2026-09-30       | `docs/5.01-ac4-ac5-evidence` → `main`         | 10      | +332 / −1        |
| [#103](https://github.com/Bl0cksmiths/Orizon-Agents-BE-Stellar/pull/103) | **Accurate figures** The overview reports only measured values                                              | 2026-10-01       | `feat/real-overview-metrics` → `main`         | 9       | +1,412 / −419    |
| [#113](https://github.com/Bl0cksmiths/Orizon-Agents-BE-Stellar/pull/113) | **Accurate figures** The registry mirror reports when it is fully synced                                    | 2026-10-02       | `feat/registry-sync-status` → `main`          | 13      | +772 / −61       |

> **#87 is Week-3 work merged inside the Week-4 window.** It was merged at 18:04 UTC on Sunday 2026-09-27, which is 02:04 on Monday 2026-09-28 in Manila. It consolidates Week 3's QA-driven fixes and the refund reconcile sweep, and it is listed here because it did not appear in the Week-3 bundle. Without it, the week's own backend PRs added 505 commits and +37,540 / −735 to `main`.
