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

### Frontend — [Orizon-Agents-FE-Stellar](https://github.com/Bl0cksmiths/Orizon-Agents-FE-Stellar) · 23 PRs · 1,545 commits landed on `main` · +103,457 / −2,771

| PR                                                                       | Deliverable                                                                                     | Merged (UTC)     | head → base                                 | Commits | Lines            |
| ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- | ---------------- | ------------------------------------------- | ------- | ---------------- |
| [#88](https://github.com/Bl0cksmiths/Orizon-Agents-FE-Stellar/pull/88)   | **Week-3 carry-over** — QA receipt fixes, Epic 3 and 4 hardening                                | 2026-09-27 18:05 | `fix/e4-frontend` → `main`                  | 203     | +21,976 / −1,580 |
| [#89](https://github.com/Bl0cksmiths/Orizon-Agents-FE-Stellar/pull/89)   | **5.01** Custody-honest authorize, per-step payouts, reclaim, and the escrow v2 switch          | 2026-09-28       | `feat/5.01-escrow-v2-ui` → `main`           | 85      | +5,303 / −204    |
| [#90](https://github.com/Bl0cksmiths/Orizon-Agents-FE-Stellar/pull/90)   | **5.02** The ecosystem adoption page and the operator onboarding checklist                      | 2026-09-28       | `feat/5.02-ecosystem-ui` → `main`           | 31      | +3,812 / −0      |
| [#97](https://github.com/Bl0cksmiths/Orizon-Agents-FE-Stellar/pull/97)   | **5.03–5.06** Operator guide, demo page, evidence index, litepaper, MIT licence and audit fixes | 2026-09-29       | `fix/5-audit-fe-integration` → `main`       | 679     | +60,448 / −542   |
| [#98](https://github.com/Bl0cksmiths/Orizon-Agents-FE-Stellar/pull/98)   | **5.05** Evidence index updated to the post-deploy state                                        | 2026-09-29       | `chore/evidence-post-deploy` → `main`       | 34      | +123 / −69       |
| [#99](https://github.com/Bl0cksmiths/Orizon-Agents-FE-Stellar/pull/99)   | **5.05** The second outside operator recorded (squash-merged)                                   | 2026-09-29       | `chore/evidence-post-deploy` → `main`       | 16      | +44 / −32        |
| [#100](https://github.com/Bl0cksmiths/Orizon-Agents-FE-Stellar/pull/100) | **5.03 / 5.04** Guide and demo script refreshed for 2026-09-30                                  | 2026-09-30       | `docs/epic5-refresh` → `main`               | 21      | +147 / −77       |
| [#101](https://github.com/Bl0cksmiths/Orizon-Agents-FE-Stellar/pull/101) | **5.01** Pin the testnet escrow v2                                                              | 2026-09-30       | `chore/pin-escrow-v2` → `main`              | 6       | +59 / −11        |
| [#102](https://github.com/Bl0cksmiths/Orizon-Agents-FE-Stellar/pull/102) | **Fix** The outside-agent artifact guard and mid-word name wrapping, found in the first v2 runs | 2026-09-30       | `fix/artifact-guard-and-name-wrap` → `main` | 18      | +841 / −87       |
| [#103](https://github.com/Bl0cksmiths/Orizon-Agents-FE-Stellar/pull/103) | **5.05** Evidence: escrow v2 team runs and the live routing exclusion                           | 2026-09-30       | `chore/evidence-escrow-v2` → `main`         | 33      | +377 / −70       |
| [#104](https://github.com/Bl0cksmiths/Orizon-Agents-FE-Stellar/pull/104) | **5.03 / 5.06** Docs: escrow v2 is live on testnet (guide v1.1.0, litepaper 0.5)                | 2026-09-30       | `docs/escrow-v2-live` → `main`              | 71      | +796 / −598      |
| [#105](https://github.com/Bl0cksmiths/Orizon-Agents-FE-Stellar/pull/105) | **5.05** Evidence index: support for a metric removed from the requirements                     | 2026-09-30       | `feat/evidence-descoped-metric` → `main`    | 14      | +463 / −179      |
| [#106](https://github.com/Bl0cksmiths/Orizon-Agents-FE-Stellar/pull/106) | **5.05** The same, with its tests and documentation                                             | 2026-09-30       | `feat/evidence-descoped-metric` → `main`    | 3       | +129 / −2        |
| [#107](https://github.com/Bl0cksmiths/Orizon-Agents-FE-Stellar/pull/107) | **5.05** Outside registration evidence marked present                                           | 2026-09-30       | `chore/evidence-d1c-present` → `main`       | 3       | +2 / −37         |
| [#108](https://github.com/Bl0cksmiths/Orizon-Agents-FE-Stellar/pull/108) | **5.05** Dispute and refund evidence marked present after the first credit                      | 2026-09-30       | `chore/evidence-dispute-refund` → `main`    | 28      | +92 / −68        |
| [#111](https://github.com/Bl0cksmiths/Orizon-Agents-FE-Stellar/pull/111) | **Quality** Responsive pass over the public pages, 360–1920 px                                  | 2026-10-01       | `feat/responsive-public` → `main`           | 33      | +591 / −68       |
| [#110](https://github.com/Bl0cksmiths/Orizon-Agents-FE-Stellar/pull/110) | **Quality** Redesigned, accessible marketing navigation                                         | 2026-10-01       | `feat/nav-redesign` → `main`                | 36      | +2,395 / −190    |
| [#112](https://github.com/Bl0cksmiths/Orizon-Agents-FE-Stellar/pull/112) | **Quality** The console made responsive from 360 to 1920 px                                     | 2026-10-01       | `feat/responsive-console` → `main`          | 57      | +1,281 / −139    |
| [#113](https://github.com/Bl0cksmiths/Orizon-Agents-FE-Stellar/pull/113) | **Accurate figures** Network stats on the console and home page measured, not invented          | 2026-10-01       | `feat/accurate-network-stats` → `main`      | 52      | +3,508 / −276    |
| [#120](https://github.com/Bl0cksmiths/Orizon-Agents-FE-Stellar/pull/120) | **Quality** Agent registry table without the id column                                          | 2026-10-02       | `feat/registry-no-id-column` → `main`       | 27      | +494 / −78       |
| [#109](https://github.com/Bl0cksmiths/Orizon-Agents-FE-Stellar/pull/109) | **5.05** Evidence: reviewer fixes — outside registrations linked, live API dates, disclosures   | 2026-10-02       | `chore/evidence-reviewer-fixes` → `main`    | 40      | +482 / −67       |
| [#121](https://github.com/Bl0cksmiths/Orizon-Agents-FE-Stellar/pull/121) | **Accurate figures** The hero and console never publish a partial registry count                | 2026-10-02       | `fix/hero-complete-stats` → `main`          | 19      | +2,740 / −240    |
| [#122](https://github.com/Bl0cksmiths/Orizon-Agents-FE-Stellar/pull/122) | **5.04 / D4** The demo published in two parts                                                   | 2026-10-02       | `feat/publish-demo-video` → `main`          | 29      | +1,793 / −604    |

> **Rows are in merge order**, which is not number order: #111 merged before #110, and #109 merged after #120. #88 is Week-3 work merged at 02:05 on 2026-09-28 Manila time, listed because it did not appear in the Week-3 bundle; without it, the week's own frontend PRs added 1,341 commits and +81,603 / −1,313 to `main`. **#97 is large for two reasons**: it consolidates six story lanes (5.03–5.06, the licence and an audit pass, replacing the closed #91–#96), and it imports the litepaper with its own 59-commit history under `litepaper/` (14,867 of its lines). #98 and #99 share a branch: #99 was squash-merged on top of it.

### Smart contracts — [Orizon-Agents-Smart-Contract-Stellar](https://github.com/Bl0cksmiths/Orizon-Agents-Smart-Contract-Stellar) · 3 PRs · 20 commits · +37,240 / −506

| PR                                                                               | Deliverable                                                                                                                                                                                  | Merged (UTC) | head → base                       | Commits | Lines          |
| -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | --------------------------------- | ------- | -------------- |
| [#4](https://github.com/Bl0cksmiths/Orizon-Agents-Smart-Contract-Stellar/pull/4) | **5.01** PaymentEscrow v2: custody at authorize, per-operator settlement, settler rotation (fixes [#3](https://github.com/Bl0cksmiths/Orizon-Agents-Smart-Contract-Stellar/issues/3), D-039) | 2026-09-28   | `feat/escrow-v2` → `main`         | 15      | +37,215 / −505 |
| [#5](https://github.com/Bl0cksmiths/Orizon-Agents-Smart-Contract-Stellar/pull/5) | **SOW §6.3 m11** Add the MIT licence                                                                                                                                                         | 2026-09-29   | `chore/mit-license` → `main`      | 1       | +21 / −0       |
| [#6](https://github.com/Bl0cksmiths/Orizon-Agents-Smart-Contract-Stellar/pull/6) | **5.01** Record the testnet escrow v2 deployment in the address book                                                                                                                         | 2026-09-30   | `chore/deploy-escrow-v2` → `main` | 1       | +4 / −1        |

> **#4's line count is mostly generated test snapshots.** 35,640 of its 37,215 added lines are the 32 `test_snapshots/*.json` files the Soroban test harness writes; the hand-written change is about 1,575 lines across 11 files — the escrow itself (`payment-escrow/src/lib.rs`, +248 / −83), its tests (+1,011 / −93), an interface document and the testnet deploy script. The contracts carry 47 tests (32 for the escrow), none of them using `mock_all_auths`, so every authorization in them is a real signature check.

### Reference agent — [Orizon-Agents-Example-Agent-Stellar](https://github.com/Bl0cksmiths/Orizon-Agents-Example-Agent-Stellar) · 1 PR · 12 commits · +776 / −9

| PR                                                                              | Deliverable                                                 | Merged (UTC) | head → base                     | Commits | Lines     |
| ------------------------------------------------------------------------------- | ----------------------------------------------------------- | ------------ | ------------------------------- | ------- | --------- |
| [#6](https://github.com/Bl0cksmiths/Orizon-Agents-Example-Agent-Stellar/pull/6) | **5.01 AC5** Opt-in fault injection for integration testing | 2026-09-28   | `feat/5.01-fault-mode` → `main` | 11      | +776 / −9 |

### UAT — [Orizon-Agents-UAT-Stellar](https://github.com/Bl0cksmiths/Orizon-Agents-UAT-Stellar) · 1 PR · 404 commits · +8,816 / −288

| PR                                                                    | Deliverable                                                                                                                                         | Merged (UTC) | head → base    | Commits                                | Lines         |
| --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | -------------- | -------------------------------------- | ------------- |
| [#5](https://github.com/Bl0cksmiths/Orizon-Agents-UAT-Stellar/pull/5) | **Rie's Week-4 QA** — 6.04 independent on-chain verification, the 6.02 re-check, the 6.03 re-run on escrow v2, 6.08 and 6.09, defects D-077 → D-092 | 2026-10-03   | `uat` → `main` | 403 (**all by `rie-hash14`**), 1–3 Oct | +8,816 / −288 |

What UAT #5 contains (66 files): eight new Playwright specs and six updated ones; four new verification tools (`tools/attestation-verify/`, `tools/onchain-verify/`, `tools/sow-metrics-verify/`, `tools/e2e-run/`); nine new evidence reports under `docs/uat/evidence/`; a phone and onboarding checklist; and the defect register, test plan, traceability matrix and sign-off report brought up to 2026-10-02. [`01-tasks-completed.md`](./01-tasks-completed.md) describes each card and her verdicts. Her story 6.07 and 6.10 work is on branches not yet merged, and is not counted here.

---

## Week-4 totals

| Repo            | PRs    | Commits   | Lines                 |
| --------------- | ------ | --------- | --------------------- |
| Backend         | 14     | 737       | +52,596 / −1,966      |
| Frontend        | 23     | 1,545     | +103,457 / −2,771     |
| Smart contracts | 3      | 20        | +37,240 / −506        |
| Reference agent | 1      | 12        | +776 / −9             |
| UAT             | 1      | 404       | +8,816 / −288         |
| **Total**       | **42** | **2,718** | **+202,885 / −5,540** |

Without the two Week-3 carry-over PRs (backend #87, frontend #88), the week's own 40 PRs landed **2,282 commits** on `main`. Line counts include tests, documentation, the contracts' generated test snapshots (35,640 lines) and the imported litepaper (14,867 lines).

**How these numbers were counted.** The per-PR **Commits** figure is GitHub's own total for that PR — the number its Commits tab shows — read with `gh api repos/<owner>/<repo>/pulls/<n> --jq .commits`, not with `gh pr view --json commits`, which caps its list at 100 entries. The per-PR **Lines** figures are GitHub's `additions` / `deletions` for the PR.

The per-PR columns are not summed into the repo rows, because PRs that share history would count the same work twice (frontend #98 and #99 share a branch). Each repo row is instead measured directly on `main`, from the commit before the week's first merge to the week's last merge:

```bash
# backend: main before #87 .. main after #113
git rev-list --count 08efeda..83ffbf5   # -> 737
git diff --shortstat 08efeda..83ffbf5   # -> 265 files, +52,596 / -1,966

# frontend: main before #88 .. main after #122
git rev-list --count bf931b4..049f3d5   # -> 1545
git diff --shortstat bf931b4..049f3d5   # -> 539 files, +103,457 / -2,771
```

The contracts range is `88aa554..06dc139` (20 commits), the reference agent's `38a9510..653664a` (12) and UAT's the single merge `2ae7535..0e5b340` (404, of which 403 are Rie's and one is the merge). The week's own figures quoted above use `68c91ca..83ffbf5` for the backend (505 commits, +37,540 / −735) and `09b1372..049f3d5` for the frontend (1,341 commits, +81,603 / −1,313).
