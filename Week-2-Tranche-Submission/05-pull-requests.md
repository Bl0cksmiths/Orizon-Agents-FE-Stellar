# 05 — Pull requests (Week-2 window)

**GitHub Pull Request / Weekly Branch Evidence**

**Sprint week:** Mon 2026-09-14 → Fri 2026-09-18 (window opens after the Week-1 bundle closed on 2026-09-12)
**Milestone:** M2 · Week 2 — Reputation-Gated Routing (Deliverable **D2**) + the external agent execution path (Epic 2)
**Network:** Stellar **testnet** only (SOW §3.6)

Every non-dependabot PR **merged after the Week-1 bundle (2026-09-12) through Fri 2026-09-18** across the five public repos, all in the `Bl0cksmiths` org, default branch `main`. PRs already listed in the Week-1 bundle (FE #41, BE #40, UAT #1) are **not** repeated here.

Merges are performed by the web-merge identity `ALGOREX-PH` (Dan). Each PR's **Commits** tab shows the individual author and date of every commit — that is where Rie's (`rie-hash14`) contributions are visible on the UAT PRs.

---

## How a reviewer verifies each PR

Every link below opens a public PR. On each one:

| Criterion                            | Where to look on the PR page                                                 |
| ------------------------------------ | ---------------------------------------------------------------------------- |
| **Branch used this week**            | The header line: _"ALGOREX-PH merged N commits into `main` from `<branch>`"_ |
| **Commits made during the week**     | **Commits** tab — each commit is dated 2026-09-12 → 2026-09-18               |
| **Code changes for the deliverable** | **Files changed** tab — the diff for the story named in the title            |
| **Contributions per team member**    | **Commits** tab — the author avatar/login on each commit                     |

---

## Team contributions this week

| Team member                      | GitHub       | Role                    | Week-2 PRs                                                                | Commits                           |
| -------------------------------- | ------------ | ----------------------- | ------------------------------------------------------------------------- | --------------------------------- |
| **Danielle Bagaforo Meer** (Dan) | `ALGOREX-PH` | Lead engineer           | 26 PRs across FE, BE, UAT, contracts, reference agent                     | 1,080 authored                    |
| **Rieselle Saure** (Rie)         | `rie-hash14` | Project management + QA | [UAT #3](https://github.com/Bl0cksmiths/Orizon-Agents-UAT-Stellar/pull/3) | **141** (137 authored + 4 merges) |

---

## Primary evidence — one PR per repo

If a single link per repo is required, these are the Week-2 PRs whose branches are named for the week or carry the week's largest deliverable:

| Repo            | PR                                                                                    | Branch (head → base)                 | Commits                   | Covers                                                             |
| --------------- | ------------------------------------------------------------------------------------- | ------------------------------------ | ------------------------- | ------------------------------------------------------------------ |
| Backend         | [BE #59](https://github.com/Bl0cksmiths/Orizon-Agents-BE-Stellar/pull/59)             | `feat/week-2-dan` → `main`           | 124                       | BLO-121 planner-outage fallback, observable ratings, log redaction |
| Frontend        | [FE #62](https://github.com/Bl0cksmiths/Orizon-Agents-FE-Stellar/pull/62)             | `feat/week-2-dan` → `main`           | 34                        | BLO-121 fallback-plan notice on the plan card                      |
| UAT (Rie)       | [UAT #3](https://github.com/Bl0cksmiths/Orizon-Agents-UAT-Stellar/pull/3)             | `uat` → `main`                       | 142 (141 by `rie-hash14`) | Week-2 QA: 6.02, 6.05, 6.06 + defect log                           |
| Contracts       | [SC #2](https://github.com/Bl0cksmiths/Orizon-Agents-Smart-Contract-Stellar/pull/2)   | `feat/3.07-track-addresses` → `main` | 3                         | 3.07 deployed address book tracked in git                          |
| Reference agent | [Agent #1](https://github.com/Bl0cksmiths/Orizon-Agents-Example-Agent-Stellar/pull/1) | `fix/readme-and-pinning` → `main`    | 11                        | 2.04 reference agent runnable from its README                      |

The full list for each repo follows.

---

## Merged this week — 27 PRs

### Backend — [Orizon-Agents-BE-Stellar](https://github.com/Bl0cksmiths/Orizon-Agents-BE-Stellar) · 13 PRs · 548 commits · +25,452 / −697

| PR                                                                     | Deliverable                                                                   | Merged     | head → base                                 | Commits | Lines         |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ---------- | ------------------------------------------- | ------- | ------------- |
| [#41](https://github.com/Bl0cksmiths/Orizon-Agents-BE-Stellar/pull/41) | Production hardening — money-route auth + guard consistency                   | 2026-09-15 | `prod-hardening` → `main`                   | 14      | +429 / −33    |
| [#43](https://github.com/Bl0cksmiths/Orizon-Agents-BE-Stellar/pull/43) | **2.01** Bind an operator endpoint to an on-chain agent id                    | 2026-09-15 | `feat/2.01-binding` → `main`                | 64      | +3,994 / −161 |
| [#44](https://github.com/Bl0cksmiths/Orizon-Agents-BE-Stellar/pull/44) | External step path — crash, rating and planner-injection fixes                | 2026-09-15 | `fix/external-step-hardening` → `main`      | 15      | +1,065 / −13  |
| [#45](https://github.com/Bl0cksmiths/Orizon-Agents-BE-Stellar/pull/45) | **2.02** Verifiable, bounded external dispatch                                | 2026-09-15 | `feat/2.02-dispatch` → `main`               | 38      | +2,144 / −22  |
| [#47](https://github.com/Bl0cksmiths/Orizon-Agents-BE-Stellar/pull/47) | **2.03** External step failure semantics + rating consequences                | 2026-09-15 | `feat/2.03-failure-semantics` → `main`      | 38      | +2,348 / −53  |
| [#48](https://github.com/Bl0cksmiths/Orizon-Agents-BE-Stellar/pull/48) | **2.04** Reference agent contract, published deadline                         | 2026-09-15 | `feat/2.04-reference-agent` → `main`        | 18      | +889 / −12    |
| [#49](https://github.com/Bl0cksmiths/Orizon-Agents-BE-Stellar/pull/49) | **2.06** Settlement evidence endpoint (operator dashboard)                    | 2026-09-16 | `feat/2.06-operator-dashboard` → `main`     | 22      | +1,564 / −1   |
| [#51](https://github.com/Bl0cksmiths/Orizon-Agents-BE-Stellar/pull/51) | **3.02** Excluded agents + the floor on the decompose response                | 2026-09-16 | `feat/3.02-floor-visibility` → `main`       | 26      | +1,560 / −43  |
| [#52](https://github.com/Bl0cksmiths/Orizon-Agents-BE-Stellar/pull/52) | **3.03** Routing-time read hardening + degradation visibility                 | 2026-09-16 | `feat/3.03-degradation-visibility` → `main` | 15      | +501 / −5     |
| [#56](https://github.com/Bl0cksmiths/Orizon-Agents-BE-Stellar/pull/56) | **3.05 / 3.06 / 3.07** Bound flag, cold-start guarantee, contract-drift check | 2026-09-16 | `consolidate/week-2-backend` → `main`       | 24      | +2,132 / −11  |
| [#57](https://github.com/Bl0cksmiths/Orizon-Agents-BE-Stellar/pull/57) | Epic 2 hardening — kill switches, dispatch security, rating semantics         | 2026-09-16 | `feat/epic-2-hardening` → `main`            | 41      | +4,241 / −152 |
| [#58](https://github.com/Bl0cksmiths/Orizon-Agents-BE-Stellar/pull/58) | Epic 3 hardening — floor held after planning, enriched plan steps             | 2026-09-18 | `feat/epic-3-hardening` → `main`            | 109     | +1,710 / −144 |
| [#59](https://github.com/Bl0cksmiths/Orizon-Agents-BE-Stellar/pull/59) | **BLO-121** planner fallback, observable ratings, log redaction               | 2026-09-18 | `feat/week-2-dan` → `main`                  | 124     | +2,875 / −47  |

### Frontend — [Orizon-Agents-FE-Stellar](https://github.com/Bl0cksmiths/Orizon-Agents-FE-Stellar) · 10 PRs · 516 commits · +18,369 / −530

| PR                                                                     | Deliverable                                                                   | Merged     | head → base                             | Commits | Lines         |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ---------- | --------------------------------------- | ------- | ------------- |
| [#48](https://github.com/Bl0cksmiths/Orizon-Agents-FE-Stellar/pull/48) | Production hardening — a11y, skills-input UX, SSE guard                       | 2026-09-15 | `prod-hardening-fe` → `main`            | 48      | +953 / −69    |
| [#50](https://github.com/Bl0cksmiths/Orizon-Agents-FE-Stellar/pull/50) | **2.01** Operator endpoint binding UI                                         | 2026-09-15 | `feat/2.01-bind-ui` → `main`            | 23      | +2,957 / −4   |
| [#51](https://github.com/Bl0cksmiths/Orizon-Agents-FE-Stellar/pull/51) | **2.05** Endpoint binding step in the registration flow                       | 2026-09-16 | `feat/2.05-binding-step` → `main`       | 30      | +1,291 / −64  |
| [#52](https://github.com/Bl0cksmiths/Orizon-Agents-FE-Stellar/pull/52) | **2.06** Operator dashboard                                                   | 2026-09-16 | `feat/2.06-operator-dashboard` → `main` | 62      | +2,815 / −6   |
| [#54](https://github.com/Bl0cksmiths/Orizon-Agents-FE-Stellar/pull/54) | **3.02** Floor visibility contract (types + guards)                           | 2026-09-16 | `feat/3.02-floor-visibility` → `main`   | 15      | +297 / −3     |
| [#56](https://github.com/Bl0cksmiths/Orizon-Agents-FE-Stellar/pull/56) | **3.04** Plan card — reputation, source and exclusions                        | 2026-09-16 | `feat/3.04-plan-card` → `main`          | 38      | +2,317 / −50  |
| [#59](https://github.com/Bl0cksmiths/Orizon-Agents-FE-Stellar/pull/59) | **3.05 / 3.07** Marketplace standing + contract-address parity                | 2026-09-16 | `consolidate/week-2-frontend` → `main`  | 56      | +2,421 / −56  |
| [#60](https://github.com/Bl0cksmiths/Orizon-Agents-FE-Stellar/pull/60) | Epic 2 hardening — rebind coverage + transaction links                        | 2026-09-16 | `feat/epic-2-hardening` → `main`        | 10      | +251 / −3     |
| [#61](https://github.com/Bl0cksmiths/Orizon-Agents-FE-Stellar/pull/61) | Epic 3 hardening — green CI, honest reputation surfaces, live contract parity | 2026-09-18 | `feat/epic-3-hardening` → `main`        | 200     | +3,967 / −257 |
| [#62](https://github.com/Bl0cksmiths/Orizon-Agents-FE-Stellar/pull/62) | **BLO-121** fallback-plan notice on the plan card                             | 2026-09-18 | `feat/week-2-dan` → `main`              | 34      | +1,100 / −18  |

### UAT — [Orizon-Agents-UAT-Stellar](https://github.com/Bl0cksmiths/Orizon-Agents-UAT-Stellar) · 2 PRs · 157 commits

| PR                                                                    | Deliverable                                                                                                        | Merged     | head → base                    | Commits                                                   | Lines       |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ---------- | ------------------------------ | --------------------------------------------------------- | ----------- |
| [#3](https://github.com/Bl0cksmiths/Orizon-Agents-UAT-Stellar/pull/3) | **Rie's Week-2 QA** — 6.02 reputation floor, 6.05 external dispatch, 6.06 operator surfaces, defects D-036 → D-049 | 2026-09-17 | `uat` → `main`                 | 142 (**141 by `rie-hash14`**, dated 2026-09-12 / 16 / 17) | +4,217 / −6 |
| [#2](https://github.com/Bl0cksmiths/Orizon-Agents-UAT-Stellar/pull/2) | Test-suite fixes behind the UAT run's false failures                                                               | 2026-09-15 | `fix/test-suite-bugs` → `main` | 15                                                        | +214 / −57  |

What UAT #3 contains (25 files):

- **6.02 — reputation floor:** a ~1,000-line Playwright spec, `tests/reputation-floor.spec.ts`.
- **6.05 — external dispatch:** `tests/external-dispatch.spec.ts`, `docs/uat/evidence/6.05-external-dispatch.md`, and a test operator endpoint (`tools/operator-endpoint/`) that verifies Orizon's signed dispatches.
- **6.06 — operator surfaces:** `tests/operator-surfaces.spec.ts`, `docs/uat/evidence/6.06-operator-surfaces.md`, and a wallet + phone checklist.
- **QA records:** defect log (D-036 → D-049), test plan, traceability matrix, sign-off report and runbook.


### Smart contracts — [Orizon-Agents-Smart-Contract-Stellar](https://github.com/Bl0cksmiths/Orizon-Agents-Smart-Contract-Stellar) · 1 PR · 3 commits

| PR                                                                               | Deliverable                                                         | Merged     | head → base                          | Commits | Lines    |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ---------- | ------------------------------------ | ------- | -------- |
| [#2](https://github.com/Bl0cksmiths/Orizon-Agents-Smart-Contract-Stellar/pull/2) | **3.07** Track the deployed address book (testnet + mainnet) in git | 2026-09-16 | `feat/3.07-track-addresses` → `main` | 3       | +38 / −2 |

No contract was redeployed this week; the published testnet contract ids are unchanged.

### Reference agent — [Orizon-Agents-Example-Agent-Stellar](https://github.com/Bl0cksmiths/Orizon-Agents-Example-Agent-Stellar) · 1 PR · 11 commits

| PR                                                                              | Deliverable                                                | Merged     | head → base                       | Commits | Lines     |
| ------------------------------------------------------------------------------- | ---------------------------------------------------------- | ---------- | --------------------------------- | ------- | --------- |
| [#1](https://github.com/Bl0cksmiths/Orizon-Agents-Example-Agent-Stellar/pull/1) | **2.04** Make the reference agent runnable from its README | 2026-09-16 | `fix/readme-and-pinning` → `main` | 11      | +67 / −11 |

> **Note:** this repository was **created this week (2026-09-15)**. Its initial build — signed-dispatch verification, SEP-53 message framing, replay and deadline checks, the response builder, its test suite, the README and a Render blueprint (≈45 commits, all dated 2026-09-15) — was pushed directly to `main` before PR #1, so it is visible in the commit history rather than in a PR: [commits on `main`](https://github.com/Bl0cksmiths/Orizon-Agents-Example-Agent-Stellar/commits/main).

---

## Week-2 totals

| Repo            | PRs    | Commits   | Lines                |
| --------------- | ------ | --------- | -------------------- |
| Backend         | 13     | 548       | +25,452 / −697       |
| Frontend        | 10     | 516       | +18,369 / −530       |
| UAT             | 2      | 157       | +4,431 / −63         |
| Smart contracts | 1      | 3         | +38 / −2             |
| Reference agent | 1      | 11        | +67 / −11            |
| **Total**       | **27** | **1,235** | **+48,357 / −1,303** |

Commit counts are GitHub's per-PR totals (they include the lane-merge commits inside each PR). Line counts include tests and documentation. Not counted: the reference agent's ≈45 direct-to-`main` build commits noted above.
