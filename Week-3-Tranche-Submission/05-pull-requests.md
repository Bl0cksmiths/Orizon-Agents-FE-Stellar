# 05 — Pull requests (Week-3 window)

**GitHub Pull Request / Weekly Branch Evidence**

**Sprint week:** Mon 2026-09-21 → Fri 2026-09-25 (evidence assembled 2026-09-26)
**Milestone:** M3 · Week 3 — Dispute Window & Partial-Credit Refund (Deliverable **D3**, Epic 4)
**Network:** Stellar **testnet** only (SOW §3.6)

Every non-dependabot PR **merged 2026-09-21 → 2026-09-26** across the five public repos, all in the `Bl0cksmiths` org, default branch `main`. PRs already listed in the Week-2 bundle are **not** repeated here.

Merges are performed by the web-merge identity `ALGOREX-PH` (Dan). Each PR's **Commits** tab shows the individual author and date of every commit — that is where Rie's (`rie-hash14`) contributions are visible on the UAT PR.

---

## How a reviewer verifies each PR

Every link below opens a public PR. On each one:

| Criterion                            | Where to look on the PR page                                                 |
| ------------------------------------ | ---------------------------------------------------------------------------- |
| **Branch used this week**            | The header line: _"ALGOREX-PH merged N commits into `main` from `<branch>`"_ |
| **Commits made during the week**     | **Commits** tab — each commit is dated 2026-09-21 → 2026-09-26               |
| **Code changes for the deliverable** | **Files changed** tab — the diff for the story named in the title            |
| **Contributions per team member**    | **Commits** tab — the author avatar/login on each commit                     |

---

## Team contributions this week

| Team member                      | GitHub       | Role                    | Week-3 PRs                                                                | Commits                           |
| -------------------------------- | ------------ | ----------------------- | ------------------------------------------------------------------------- | --------------------------------- |
| **Danielle Bagaforo Meer** (Dan) | `ALGOREX-PH` | Lead engineer           | 13 PRs across BE and FE, plus the merge of Rie's UAT PR                   | 908 authored                      |
| **Rieselle Saure** (Rie)         | `rie-hash14` | Project management + QA | [UAT #4](https://github.com/Bl0cksmiths/Orizon-Agents-UAT-Stellar/pull/4) | **280** (268 authored + 12 merges) |

Per-person counts, the commands behind them and the per-repo split are in [`02-commit-visibility.md`](./02-commit-visibility.md).

---

## Primary evidence — one PR per repo

If a single link per repo is required, these are the Week-3 PRs that carry the week's named deliverable:

| Repo            | PR                                                                        | Branch (head → base)                     | Commits                    | Covers                                                                        |
| --------------- | ------------------------------------------------------------------------- | ---------------------------------------- | -------------------------- | ----------------------------------------------------------------------------- |
| Backend         | [BE #60](https://github.com/Bl0cksmiths/Orizon-Agents-BE-Stellar/pull/60) | `feat/4.02-dispute-window` → `main`      | 113                        | 4.02 — the dispute window, the dispute routes, and the durable settlement record a dispute is judged against |
| Frontend        | [FE #68](https://github.com/Bl0cksmiths/Orizon-Agents-FE-Stellar/pull/68) | `feat/4.05-dispute-action` → `main`      | 119                        | 4.05 — the receipt panel and the per-step dispute action on the trace view    |
| UAT (Rie)       | [UAT #4](https://github.com/Bl0cksmiths/Orizon-Agents-UAT-Stellar/pull/4) | `uat` → `main`                           | 280 (268 by `rie-hash14`)  | Week-3 QA: the seven 6.03 dispute sub-suites, five drills, D-050 → D-076      |
| Contracts       | —                                                                         | —                                        | 0                          | No PR this week; Epic 4 needed no contract change                             |
| Reference agent | —                                                                         | —                                        | 0                          | No PR this week; the reference agent is unaffected by the dispute path        |

D3's second half, the settler-executed partial-credit refund, is [BE #62](https://github.com/Bl0cksmiths/Orizon-Agents-BE-Stellar/pull/62) (reviewed on [#61](https://github.com/Bl0cksmiths/Orizon-Agents-BE-Stellar/pull/61) — see the note under the backend table). The full list for each repo follows.

---

## Merged this week — 14 PRs

### Backend — [Orizon-Agents-BE-Stellar](https://github.com/Bl0cksmiths/Orizon-Agents-BE-Stellar) · 8 PRs · 718 commits landed on `main` · +23,256 / −1,089

| PR                                                                     | Deliverable                                                                        | Merged     | head → base                                                  | Commits                 | Lines          |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------ | ----------------------- | -------------- |
| [#60](https://github.com/Bl0cksmiths/Orizon-Agents-BE-Stellar/pull/60) | **4.02** Dispute window state and the dispute endpoint                             | 2026-09-21 | `feat/4.02-dispute-window` → `main`                          | 113                     | +5,870 / −25   |
| [#61](https://github.com/Bl0cksmiths/Orizon-Agents-BE-Stellar/pull/61) | **4.03** Settler-executed partial-credit refund — **review PR, did not reach `main`** | 2026-09-21 | `feat/4.03-partial-credit-refund` → `feat/4.02-dispute-window` | 139                     | +6,002 / −91   |
| [#62](https://github.com/Bl0cksmiths/Orizon-Agents-BE-Stellar/pull/62) | **4.03** The same work, landed on `main`                                            | 2026-09-21 | `feat/4.03-partial-credit-refund` → `main`                   | 139                     | +6,002 / −91   |
| [#63](https://github.com/Bl0cksmiths/Orizon-Agents-BE-Stellar/pull/63) | **4.04** Negative on-chain rating for an upheld dispute                            | 2026-09-21 | `feat/4.04-dispute-rating` → `main`                          | 346 (includes 4.03's 139) | +10,637 / −179 |
| [#64](https://github.com/Bl0cksmiths/Orizon-Agents-BE-Stellar/pull/64) | **4.05** (backend) Settlement view for the dispute receipt                         | 2026-09-21 | `feat/4.05-dispute-receipt-api` → `main`                     | 47                      | +847 / −61     |
| [#65](https://github.com/Bl0cksmiths/Orizon-Agents-BE-Stellar/pull/65) | **4.06** (backend) What a dispute receipt needs to be truthful                     | 2026-09-22 | `feat/4.06-dispute-receipt-record` → `main`                   | 92                      | +1,455 / −213  |
| [#75](https://github.com/Bl0cksmiths/Orizon-Agents-BE-Stellar/pull/75) | **4.07** Epic 4 hardening — dispute money path, disclosure, settlement ratings      | 2026-09-25 | `fix/4.07-epic-4-hardening` → `main`                         | 113                     | +5,180 / −514  |
| [#42](https://github.com/Bl0cksmiths/Orizon-Agents-BE-Stellar/pull/42) | Chore — untrack evidence/ops docs, keep dev docs only                              | 2026-09-22 | `chore-untrack-docs` → `main`                                | 1                       | +4 / −834      |

> **Note on #61 and #62 — 4.03 was merged twice, and the first merge did not count.** #61 was opened stacked on `feat/4.02-dispute-window` on the assumption that #60 was still open and that GitHub would retarget #61 to `main` once #60 merged. #60 had already merged, and GitHub only retargets a stacked PR when its base branch is **deleted** — so merging #61 put 4.03 into a branch that was already merged and dead, and none of it reached `main`. #62 carries exactly the reviewed work, unchanged, into `main`; the two PRs have identical diffs (+6,002 / −91, 19 files) because they are the same branch. The review discussion, design decisions and verification are all on #61. A reviewer comparing branches will see both merges, and this is what they are.
>
> The same stacking is why **#63 reads as 346 commits**: `feat/4.04-dispute-rating` was cut from `feat/4.03-partial-credit-refund` while #62 was still open, so GitHub compares it against `main` and counts 4.03's 139 commits inside it. #63 deliberately targets `main` rather than a feature branch, for the reason above. Whichever of the two merged first, `main` received each commit once.

### Frontend — [Orizon-Agents-FE-Stellar](https://github.com/Bl0cksmiths/Orizon-Agents-FE-Stellar) · 5 PRs · 297 commits landed on `main` · +16,502 / −42

| PR                                                                     | Deliverable                                                                       | Merged     | head → base                             | Commits            | Lines         |
| ---------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ---------- | --------------------------------------- | ------------------ | ------------- |
| [#65](https://github.com/Bl0cksmiths/Orizon-Agents-FE-Stellar/pull/65) | **Week-2 evidence** — the written summary pages in `Proof-of-Deliverables.pdf`     | 2026-09-21 | `week-2-pdf-summary` → `main`           | 15                 | +248 / −38    |
| [#66](https://github.com/Bl0cksmiths/Orizon-Agents-FE-Stellar/pull/66) | **Week-2 evidence** — `Technical-Documentation-and-Demo-Evidence.pdf`, 17 pages    | 2026-09-21 | `week-2-tech-docs` → `main`             | 63 (48 unique)     | +2,637 / −38  |
| [#68](https://github.com/Bl0cksmiths/Orizon-Agents-FE-Stellar/pull/68) | **4.05** Dispute action on the trace / receipt view                                | 2026-09-21 | `feat/4.05-dispute-action` → `main`     | 119                | +8,433 / −4   |
| [#69](https://github.com/Bl0cksmiths/Orizon-Agents-FE-Stellar/pull/69) | **4.06** Dispute status and refund receipt display                                 | 2026-09-22 | `feat/4.06-dispute-receipt` → `main`    | 71                 | +3,454 / −94  |
| [#76](https://github.com/Bl0cksmiths/Orizon-Agents-FE-Stellar/pull/76) | **4.07** (frontend) Epic 4 hardening — the receipt stops stating what it cannot show | 2026-09-25 | `fix/4.07-fe-epic-4-hardening` → `main` | 39                 | +2,281 / −209 |

> **#65 and #66 are the Week-2 evidence documents, not Week-3 development.** Both PDFs were built on 2026-09-19 and merged on the morning of 2026-09-21, so they fall in this window as merges. Their 63 commits are authored 2026-09-19 and are therefore **excluded** from the Week-3 authored-commit counts in [`02-commit-visibility.md`](./02-commit-visibility.md). GitHub reports 63 commits on #66 because its branch was cut before #65 landed; 48 of them are unique to it.

### UAT — [Orizon-Agents-UAT-Stellar](https://github.com/Bl0cksmiths/Orizon-Agents-UAT-Stellar) · 1 PR · 280 commits · +6,178 / −21

| PR                                                                    | Deliverable                                                                                                                | Merged     | head → base    | Commits                                                              | Lines        |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ---------- | -------------- | -------------------------------------------------------------------- | ------------ |
| [#4](https://github.com/Bl0cksmiths/Orizon-Agents-UAT-Stellar/pull/4) | **Rie's Week-3 QA** — the seven 6.03 dispute sub-suites, five drills, the 6.05/6.06 reruns, and defects D-050 → D-076       | 2026-09-26 | `uat` → `main` | 280 (**268 by `rie-hash14`** + 12 of her lane merges), 24–26 Sep      | +6,178 / −21 |

What UAT #4 contains (44 files):

- **6.03 — dispute, refund and rating,** in seven sub-suites with an evidence report each: `tests/dispute-path.spec.ts` (6.03a), `tests/dispute-refusals.spec.ts` (6.03b, with an idempotency report of its own), `tests/dispute-eligibility.spec.ts` (6.03c), `tests/durability.spec.ts` (6.03d), `tests/reputation-consequence.spec.ts` (6.03e), the dispute UI (6.03f) and `tests/adjudication-door.spec.ts` (6.03g).
- **Five drills** written to reach behaviour the live deployment cannot show with refunds switched off: `tools/adjudication-drill/`, `tools/dispute-ui-drill/`, `tools/rating-log-drill/`, `tools/reputation-drill/`, `tools/restart-drill/` — each with a README, and three with their own Playwright config and browser spec.
- **Reruns against the week's build:** `tests/external-dispatch.spec.ts` (6.05) with a captured dispatch record dated 2026-09-24, and `tests/operator-surfaces.spec.ts` (6.06).
- **QA records:** defect write-ups D-050 → D-076 (1,009 lines added to `docs/uat/defects.md`), the rewritten test plan, the traceability matrix with its issue links, the sign-off report and a phone + screen-reader checklist.

### Smart contracts — [Orizon-Agents-Smart-Contract-Stellar](https://github.com/Bl0cksmiths/Orizon-Agents-Smart-Contract-Stellar) · 0 PRs · 0 commits

No PR was opened or merged this week, and `main` has had no commit since 2026-09-16. Epic 4 required no contract change: an upheld dispute's negative rating is written through the ReputationLedger already deployed in Week 2, and the credit is a settler-signed transfer of the existing asset. The published testnet contract ids are unchanged — they are listed in the bundle [`README`](./README.md).

### Reference agent — [Orizon-Agents-Example-Agent-Stellar](https://github.com/Bl0cksmiths/Orizon-Agents-Example-Agent-Stellar) · 0 PRs · 0 commits

No PR was opened or merged this week, and `main` has had no commit since 2026-09-16. The dispute path sits between the buyer, the platform settler and the ReputationLedger; nothing in it changes the contract an external operator's agent implements.

---

## Week-3 totals

| Repo            | PRs    | Commits   | Lines                |
| --------------- | ------ | --------- | -------------------- |
| Backend         | 8      | 718       | +23,256 / −1,089     |
| Frontend        | 5      | 297       | +16,502 / −42        |
| UAT             | 1      | 280       | +6,178 / −21         |
| Smart contracts | 0      | 0         | —                    |
| Reference agent | 0      | 0         | —                    |
| **Total**       | **14** | **1,295** | **+45,936 / −1,152** |

**How these numbers were counted.** The per-PR **Commits** figure is GitHub's own total for that PR — the number its Commits tab shows — cross-checked against `git rev-list --count <merge>^1..<merge>^2` on the merge commit. The two agree on every PR except the two already explained above: FE #66, where GitHub's merge base predates FE #65 (63 against 48), and BE #62, whose head was already reachable from `main` when it merged, so its merge has no second parent to count against — its 139 is the same branch, counted on #61. GitHub's own per-PR commit field was read with `gh api repos/<owner>/<repo>/pulls/<n> --jq .commits`, not with `gh pr view --json commits`, which caps its list at 100 entries. The per-PR **Lines** figures are GitHub's `additions` / `deletions` for the PR.

The per-PR columns deliberately **do not sum** to the repo rows above, and the repo rows are not sums of them. Three backend PRs carry overlapping history (#61 and #62 are the same branch; #63 was cut from it), so adding their commits and diffs would count the same work up to three times. Each repo row is instead measured directly on `main`:

```bash
# commits the week's merges actually added to main (backend)
git rev-list --count 5822729..08efeda   # main before PR #60 .. main after PR #75
# -> 718

# the net change to main across the same range
git diff --shortstat 5822729..08efeda
# -> 64 files changed, 23256 insertions(+), 1089 deletions(-)
```

The frontend range is `d718619..5105a8b` (297 commits, +16,502 / −42) and UAT's is the single merge `2ae7535^1..2ae7535` (280 commits, +6,178 / −21). Line counts include tests and documentation. The frontend total includes the 63 Week-2 evidence commits noted above; the backend total includes one commit authored 2026-09-15 that rode in on the #42 chore.
