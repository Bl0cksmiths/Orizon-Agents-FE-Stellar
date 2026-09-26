# 02 — Public commit visibility (multi-contributor proof)

**SDF rule (approval email + onboarding deck):** every approved proposal member must have at least one **visible public commit every week**, relevant to their assigned role — and _"volume from one contributor does not satisfy it."_

**Verdict for Week 3: met — both approved members have public, role-relevant commits.**

Counting window: commits **authored 2026-09-21 → 2026-09-26** on `origin/main` in the five public repositories. Merge commits are listed separately and not counted as authored work. The sprint week itself ran Mon 2026-09-21 → Fri 2026-09-25; the window is held open to 2026-09-26 because Rie's QA branch was merged that morning, and because this bundle was assembled on the 26th.

## The commands

Every number below comes from these commands, run after `git fetch origin` in each clone. Anyone with the public repositories can reproduce them.

```bash
# authored commits (excludes merges), per person, per repo
git log origin/main \
  --since=2026-09-21T00:00:00 --until=2026-09-27T00:00:00 \
  --no-merges --author=algorexph@gmail.com --oneline | wc -l

# merge commits in the same window, grouped by the identity that made them
git log origin/main \
  --since=2026-09-21T00:00:00 --until=2026-09-27T00:00:00 \
  --merges --format='%ae' | sort | uniq -c

# the dates the authored commits fall on
git log origin/main \
  --since=2026-09-21T00:00:00 --until=2026-09-27T00:00:00 \
  --no-merges --author=algorexph@gmail.com --format='%ad' --date=short \
  | sort | uniq -c
```

Cross-checked against GitHub's own view of the same history, which counts a person's authored and merge commits together:

```bash
gh api --paginate \
  "repos/Bl0cksmiths/Orizon-Agents-BE-Stellar/commits?sha=main&author=ALGOREX-PH\
&since=2026-09-21T00:00:00Z&until=2026-09-26T23:59:59Z" --jq '.[].sha' | wc -l
# -> 717   (687 authored + 30 merges)
```

The frontend query returns **234** (221 authored + 13 merges). These are the 717 / 234 / 951 figures quoted in the bundle [`README`](./README.md).

## Danielle (Dan) — lead engineer

| Repo                                                                                                        | Authored commits (this week) | Dates          | Merge commits |
| ----------------------------------------------------------------------------------------------------------- | ---------------------------- | -------------- | ------------- |
| [Orizon-Agents-BE-Stellar](https://github.com/Bl0cksmiths/Orizon-Agents-BE-Stellar)                         | 687                          | 21, 22, 25 Sep | 30            |
| [Orizon-Agents-FE-Stellar](https://github.com/Bl0cksmiths/Orizon-Agents-FE-Stellar)                         | 221                          | 21, 22, 25 Sep | 13            |
| [Orizon-Agents-UAT-Stellar](https://github.com/Bl0cksmiths/Orizon-Agents-UAT-Stellar)                       | 0                            | —              | 1             |
| [Orizon-Agents-Smart-Contract-Stellar](https://github.com/Bl0cksmiths/Orizon-Agents-Smart-Contract-Stellar) | 0                            | —              | 0             |
| [Orizon-Agents-Example-Agent-Stellar](https://github.com/Bl0cksmiths/Orizon-Agents-Example-Agent-Stellar)   | 0                            | —              | 0             |
| **Total**                                                                                                   | **908 authored**             |                | **44 merges** |

Per day: backend 488 (21st), 90 (22nd), 109 (25th); frontend 115 (21st), 68 (22nd), 38 (25th). Wednesday the 23rd and Thursday the 24th carry no commits on `main` in either repo; the whole 4.07 hardening pass is authored on the 25th (114 backend commits, 40 frontend).

Author identity: `Danielle Bagaforo Meer <algorexph@gmail.com>`, with the web-merge identity `Danielle Meer <55391597+ALGOREX-PH@users.noreply.github.com>` (GitHub `ALGOREX-PH`) on the 6 backend and 5 frontend PR merges that produced a merge commit on `main` — backend #61 merged into a feature branch and #62's head was already reachable from `main`, so neither did, as [`05-pull-requests.md`](./05-pull-requests.md) explains. The remaining 24 backend and 8 frontend merges are his own lane merges inside the feature branches.

**What the commits are.** The five Epic 4 stories and the hardening pass that followed them:

- **4.02 — dispute window** (BE [#60](https://github.com/Bl0cksmiths/Orizon-Agents-BE-Stellar/pull/60)): the bounded window, the four dispute routes, the wallet-signature payer proof, and the durable settlement record a dispute is judged against.
- **4.03 — partial-credit refund** (BE [#61](https://github.com/Bl0cksmiths/Orizon-Agents-BE-Stellar/pull/61) / [#62](https://github.com/Bl0cksmiths/Orizon-Agents-BE-Stellar/pull/62)): uphold and reject behind a fail-closed adjudicator check, and the settler-funded credit with its durable mutex and caps.
- **4.04 — negative on-chain rating** (BE [#63](https://github.com/Bl0cksmiths/Orizon-Agents-BE-Stellar/pull/63)): an upheld dispute writes a 10/100 `dispute`-kind rating to the ReputationLedger under a derived job id, so it costs the agent its routing standing.
- **4.05 — dispute action** (BE [#64](https://github.com/Bl0cksmiths/Orizon-Agents-BE-Stellar/pull/64), FE [#68](https://github.com/Bl0cksmiths/Orizon-Agents-FE-Stellar/pull/68)): the settlement view the receipt needs, and the receipt panel and per-step dispute action on the trace view.
- **4.06 — dispute status and receipt** (BE [#65](https://github.com/Bl0cksmiths/Orizon-Agents-BE-Stellar/pull/65), FE [#69](https://github.com/Bl0cksmiths/Orizon-Agents-FE-Stellar/pull/69)): what was actually credited, whether the rating landed, a required buyer-facing rejection reason, and a receipt that polls itself to the resolution.
- **4.07 — Epic 4 hardening** (BE [#75](https://github.com/Bl0cksmiths/Orizon-Agents-BE-Stellar/pull/75), FE [#76](https://github.com/Bl0cksmiths/Orizon-Agents-FE-Stellar/pull/76)): audits driven against the running service, then fix lanes — a reproducible double payment, a stranded refund mutex, an unpayable-dispute wedge, a disclosure hole on the buyer's own words, a denial of service on the dispute window, secrets printed by a failed boot, and receipt copy that claimed a transfer nobody had submitted.

**One edit per commit.** The count is high because the work is pushed a change at a time rather than in batches: of Dan's 908 authored commits this week, **849 touch exactly one file** (663 of 687 in the backend, 186 of 221 in the frontend), and none touches more than five. Each commit is visible on the PR it belongs to — see [`05-pull-requests.md`](./05-pull-requests.md).

**Where to see them**

- Backend: [commits on `main` by `ALGOREX-PH`, 21–25 Sep](https://github.com/Bl0cksmiths/Orizon-Agents-BE-Stellar/commits/main?author=ALGOREX-PH&since=2026-09-21&until=2026-09-25)
- Frontend: [commits on `main` by `ALGOREX-PH`, 21–25 Sep](https://github.com/Bl0cksmiths/Orizon-Agents-FE-Stellar/commits/main?author=ALGOREX-PH&since=2026-09-21&until=2026-09-25)
- Or the **Commits** tab of any Week-3 PR listed in [`05-pull-requests.md`](./05-pull-requests.md).

## Rieselle (Rie) — PM + QA

| Repo                                                                                  | Authored commits (this week)                | Identity                                                       |
| ------------------------------------------------------------------------------------- | ------------------------------------------- | -------------------------------------------------------------- |
| [Orizon-Agents-UAT-Stellar](https://github.com/Bl0cksmiths/Orizon-Agents-UAT-Stellar) | **268** (+ 12 merges of her own test lanes) | `rie-hash14` (`276933516+rie-hash14@users.noreply.github.com`) |

All 280 of her commits this week (268 authored + 12 merges) are dated 2026-09-24 (55 authored), 2026-09-25 (123) and 2026-09-26 (90), and all sit in [UAT PR #4](https://github.com/Bl0cksmiths/Orizon-Agents-UAT-Stellar/pull/4/commits) (`uat` → `main`, merged 2026-09-26). Every one of the 268 touches exactly one file; by area, 131 land in `docs/uat/`, 110 in `tools/` and 27 in `tests/`.

The commits are real and **role-relevant** (QA) — Week-3 test coverage of the week's deliverable, plus the drills needed to exercise a money path the deployment has switched off:

- **6.03 — dispute, refund and rating,** in seven sub-suites with an evidence report each: the dispute path, the refusals and idempotency, eligibility, durability across a restart, the reputation consequence, the dispute UI, and the adjudication door. Playwright specs `tests/dispute-path.spec.ts`, `dispute-refusals.spec.ts`, `dispute-eligibility.spec.ts`, `durability.spec.ts`, `reputation-consequence.spec.ts`, `adjudication-door.spec.ts`.
- **Five drills** she wrote to reach behaviour the live deployment cannot show: `tools/adjudication-drill/`, `tools/dispute-ui-drill/`, `tools/rating-log-drill/`, `tools/reputation-drill/` and `tools/restart-drill/` — each a runnable harness with its own README, and three of them with their own Playwright config and browser spec.
- **Reruns of earlier coverage** against the week's build: `tests/external-dispatch.spec.ts` (6.05) and `tests/operator-surfaces.spec.ts` (6.06), with a captured dispatch record dated 2026-09-24.
- **QA records:** defect write-ups **D-050 → D-076**, a rewritten test plan, the traceability matrix with its issue links, the sign-off report and a phone + screen-reader checklist.

Authored — not `Co-authored-by:` — so they satisfy the "the commit author must be the member" rule. (The PR itself was opened and merged from Dan's account; the **Commits** tab shows `rie-hash14` as the author of each commit.)

**Where to see them:** [UAT PR #4 → Commits](https://github.com/Bl0cksmiths/Orizon-Agents-UAT-Stellar/pull/4/commits). GitHub's `?author=<login>` filter on the commit listing does not return her commits, so the PR's Commits tab is the link to use; the same listing filtered on her commit address does return them, [here](https://github.com/Bl0cksmiths/Orizon-Agents-UAT-Stellar/commits/main?author=276933516%2Brie-hash14%40users.noreply.github.com).

## The two repositories with no commits this week

Stated plainly rather than left out:

| Repo                                                                                                        | Commits 21–26 Sep | Last commit on `main` |
| ----------------------------------------------------------------------------------------------------------- | ----------------- | --------------------- |
| [Orizon-Agents-Smart-Contract-Stellar](https://github.com/Bl0cksmiths/Orizon-Agents-Smart-Contract-Stellar) | **0**             | 2026-09-16            |
| [Orizon-Agents-Example-Agent-Stellar](https://github.com/Bl0cksmiths/Orizon-Agents-Example-Agent-Stellar)   | **0**             | 2026-09-16            |

Epic 4 required no contract change and no change to the reference agent: the dispute rating is written through the ReputationLedger already deployed in Week 2, and the refund is a settler-signed transfer of the existing asset. Neither repository was touched, and neither is presented as having been.

## What counts / doesn't (per the rule)

- **Counts:** commits and PRs in the public repos, authored by an approved member, relevant to their role. Met by both.
- **Does not count:** private repos, unpushed work, Linear-only activity, or a co-author trailer. None relied on here.
- **Not counted as Week-3 authored work:** the 63 commits behind frontend PRs [#65](https://github.com/Bl0cksmiths/Orizon-Agents-FE-Stellar/pull/65) and [#66](https://github.com/Bl0cksmiths/Orizon-Agents-FE-Stellar/pull/66), the Week-2 evidence documents. They merged on 2026-09-21 and so appear in [`05-pull-requests.md`](./05-pull-requests.md) as Week-3 merges, but they were authored on 2026-09-19 and fall outside this window.
