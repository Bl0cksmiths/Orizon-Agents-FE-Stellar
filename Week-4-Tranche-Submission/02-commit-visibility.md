# 02 — Public commit visibility (multi-contributor proof)

**SDF rule (approval email + onboarding deck):** every approved proposal member must have at least one **visible public commit every week**, relevant to their assigned role — and _"volume from one contributor does not satisfy it."_

**Verdict for Week 4: met — both approved members have public, role-relevant commits on `main`.**

Counting window: commits on `origin/main` in the five public repositories, **2026-09-28 → 2026-10-02**, the sprint week (Manila time, UTC+8, which is the time zone of every commit counted). Merge commits are listed separately and not counted as authored work. Because QA's branch was merged on the morning of 2026-10-03, when this bundle was assembled, each table also gives the figure with 2026-10-03 included, the convention the Week-3 bundle used.

## The commands

Every number below comes from these commands, the same ones the Week-3 bundle used, run after `git fetch origin` in each clone. Anyone with the public repositories can reproduce them.

```bash
# authored commits (excludes merges), per person, per repo — sprint week
git log origin/main \
  --since=2026-09-28T00:00:00 --until=2026-10-03T00:00:00 \
  --no-merges --author=algorexph@gmail.com --oneline | wc -l

# the same with the assembly day included
git log origin/main \
  --since=2026-09-28T00:00:00 --until=2026-10-04T00:00:00 \
  --no-merges --author=algorexph@gmail.com --oneline | wc -l

# merge commits in the same window, grouped by the identity that made them
git log origin/main \
  --since=2026-09-28T00:00:00 --until=2026-10-03T00:00:00 \
  --merges --format='%ae' | sort | uniq -c

# the dates the authored commits fall on
git log origin/main \
  --since=2026-09-28T00:00:00 --until=2026-10-04T00:00:00 \
  --no-merges --author=algorexph@gmail.com --format='%ad' --date=short \
  | sort | uniq -c

# how many touch exactly one file
for c in $(git log origin/main --since=2026-09-28T00:00:00 \
    --until=2026-10-03T00:00:00 --no-merges \
    --author=algorexph@gmail.com --format=%H); do
  git diff-tree --no-commit-id --name-only -r "$c" | wc -l
done | grep -cx 1
```

For Rie, the author filter is `--author=rie-hash14`. Cross-checked against GitHub's own view of the same history, which counts a person's authored and merge commits together:

```bash
gh api --paginate \
  "repos/Bl0cksmiths/Orizon-Agents-BE-Stellar/commits?sha=main&author=ALGOREX-PH\
&since=2026-09-27T16:00:00Z&until=2026-10-02T16:00:00Z" --jq '.[].sha' | wc -l
# -> 524   (499 authored + 25 merges)
```

The frontend query returns **1,311** (1,274 authored + 1 web-squashed commit + 36 merges).

## Danielle (Dan) — lead engineer

| Repo                                                                                                        | Authored, 28 Sep – 2 Oct | Incl. 3 Oct | Dates                    | Merge commits             |
| ----------------------------------------------------------------------------------------------------------- | ------------------------ | ----------- | ------------------------ | ------------------------- |
| [Orizon-Agents-BE-Stellar](https://github.com/Bl0cksmiths/Orizon-Agents-BE-Stellar)                         | 499                      | 499         | 28, 29, 30 Sep; 1, 2 Oct | 25                        |
| [Orizon-Agents-FE-Stellar](https://github.com/Bl0cksmiths/Orizon-Agents-FE-Stellar)                         | 1,274                    | 1,303       | 28 Sep – 3 Oct, daily    | 36                        |
| [Orizon-Agents-Smart-Contract-Stellar](https://github.com/Bl0cksmiths/Orizon-Agents-Smart-Contract-Stellar) | 17                       | 17          | 28, 29, 30 Sep           | 3                         |
| [Orizon-Agents-Example-Agent-Stellar](https://github.com/Bl0cksmiths/Orizon-Agents-Example-Agent-Stellar)   | 11                       | 11          | 28 Sep                   | 1                         |
| [Orizon-Agents-UAT-Stellar](https://github.com/Bl0cksmiths/Orizon-Agents-UAT-Stellar)                       | 0                        | 0           | —                        | 1 (Rie's PR #5, on 3 Oct) |
| **Total**                                                                                                   | **1,801 authored**       | **1,830**   |                          | **65 merges**             |

Per day: backend 175 (28th), 212 (29th), 66 (30th), 24 (1st), 22 (2nd); frontend 116 (28th), 698 (29th), 197 (30th), 165 (1st), 98 (2nd) and 29 on the 3rd; contracts 15, 1, 1 (28th–30th); reference agent 11 (28th). Unlike Week 3, there is no idle day: every day of the sprint week carries commits on `main`.

Author identity: `Danielle Bagaforo Meer <algorexph@gmail.com>`, with the web-merge identity `Danielle Meer <55391597+ALGOREX-PH@users.noreply.github.com>` (GitHub `ALGOREX-PH`) on the pull-request merges — 14 backend, 19 frontend, 3 contracts, 1 reference agent and the UAT merge. The remaining 11 backend and 17 frontend merges are his own lane merges inside the feature branches. One frontend commit, [`b14d4cb`](https://github.com/Bl0cksmiths/Orizon-Agents-FE-Stellar/commit/b14d4cb97804caff48d1075a285fea068431bfc8) (frontend PR #99, squash-merged on GitHub), carries the web identity as its author and is the "+1" in the cross-check above.

Two things in the frontend figure, stated so the number is read correctly:

- **59 of the 1,274 are the litepaper's own history.** Frontend [#97](https://github.com/Bl0cksmiths/Orizon-Agents-FE-Stellar/pull/97) imported the litepaper, which had been written in its own repository, under `litepaper/` with its history kept. Those 59 commits are Dan's, authored on 2026-09-29, and are counted because they are on `main` and in the window; without them the frontend figure is 1,215.
- **The Week-3 consolidation is counted only where it was written inside the window.** Frontend [#88](https://github.com/Bl0cksmiths/Orizon-Agents-FE-Stellar/pull/88) and backend [#87](https://github.com/Bl0cksmiths/Orizon-Agents-BE-Stellar/pull/87) merged at 02:04–02:05 on 2026-09-28, Manila time. All 193 of #88's commits were authored before the window and none is counted. Of #87's, 17 were authored between 01:05 and 01:36 on the 28th — the refund reconcile sweep that keeps a dispute credit from being paid twice or skipped — and they are in the backend's 499. [`05-pull-requests.md`](./05-pull-requests.md) lists both PRs as carry-over.

**What the commits are.** The six stories of Epic 5 and the escrow v2 switch that unblocked them — see [`01-tasks-completed.md`](./01-tasks-completed.md) for each:

- **5.01 — escrow v2 and the settlement path** (contracts [#4](https://github.com/Bl0cksmiths/Orizon-Agents-Smart-Contract-Stellar/pull/4), [#6](https://github.com/Bl0cksmiths/Orizon-Agents-Smart-Contract-Stellar/pull/6); backend [#88](https://github.com/Bl0cksmiths/Orizon-Agents-BE-Stellar/pull/88), [#100](https://github.com/Bl0cksmiths/Orizon-Agents-BE-Stellar/pull/100), [#101](https://github.com/Bl0cksmiths/Orizon-Agents-BE-Stellar/pull/101); frontend [#89](https://github.com/Bl0cksmiths/Orizon-Agents-FE-Stellar/pull/89), [#101](https://github.com/Bl0cksmiths/Orizon-Agents-FE-Stellar/pull/101); reference agent [#6](https://github.com/Bl0cksmiths/Orizon-Agents-Example-Agent-Stellar/pull/6)).
- **5.02 — adoption metrics and operator onboarding** (backend [#89](https://github.com/Bl0cksmiths/Orizon-Agents-BE-Stellar/pull/89), frontend [#90](https://github.com/Bl0cksmiths/Orizon-Agents-FE-Stellar/pull/90)).
- **5.03 to 5.06 — the guide, the demo, the evidence index and the litepaper**, plus the MIT licences (backend [#94](https://github.com/Bl0cksmiths/Orizon-Agents-BE-Stellar/pull/94), frontend [#97](https://github.com/Bl0cksmiths/Orizon-Agents-FE-Stellar/pull/97), contracts [#5](https://github.com/Bl0cksmiths/Orizon-Agents-Smart-Contract-Stellar/pull/5), frontend [#122](https://github.com/Bl0cksmiths/Orizon-Agents-FE-Stellar/pull/122)).
- **Accurate public figures** — the console and home page now show only measured numbers (backend [#103](https://github.com/Bl0cksmiths/Orizon-Agents-BE-Stellar/pull/103), [#113](https://github.com/Bl0cksmiths/Orizon-Agents-BE-Stellar/pull/113); frontend [#113](https://github.com/Bl0cksmiths/Orizon-Agents-FE-Stellar/pull/113), [#121](https://github.com/Bl0cksmiths/Orizon-Agents-FE-Stellar/pull/121)).

**One edit per commit.** Of Dan's 1,801 authored commits in the sprint week, **1,573 touch exactly one file** — 440 of 499 in the backend (none touches more than 7), 1,114 of 1,274 in the frontend (none more than 11), 12 of 17 in the contracts and 7 of 11 in the reference agent. Each commit is visible on the PR it belongs to — see [`05-pull-requests.md`](./05-pull-requests.md).

**Where to see them**

- Backend: [commits on `main` by `ALGOREX-PH`, 28 Sep – 2 Oct](https://github.com/Bl0cksmiths/Orizon-Agents-BE-Stellar/commits/main?author=ALGOREX-PH&since=2026-09-28&until=2026-10-02)
- Frontend: [commits on `main` by `ALGOREX-PH`, 28 Sep – 2 Oct](https://github.com/Bl0cksmiths/Orizon-Agents-FE-Stellar/commits/main?author=ALGOREX-PH&since=2026-09-28&until=2026-10-02)
- Contracts: [commits on `main`](https://github.com/Bl0cksmiths/Orizon-Agents-Smart-Contract-Stellar/commits/main) · Reference agent: [commits on `main`](https://github.com/Bl0cksmiths/Orizon-Agents-Example-Agent-Stellar/commits/main)
- Or the **Commits** tab of any Week-4 PR listed in [`05-pull-requests.md`](./05-pull-requests.md).

## Rieselle (Rie) — PM + QA

| Repo                                                                                  | Authored, 28 Sep – 2 Oct | Incl. 3 Oct (on `main`)                                                                       | Identity                                                       |
| ------------------------------------------------------------------------------------- | ------------------------ | --------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| [Orizon-Agents-UAT-Stellar](https://github.com/Bl0cksmiths/Orizon-Agents-UAT-Stellar) | **352**                  | **403** (all in [UAT PR #5](https://github.com/Bl0cksmiths/Orizon-Agents-UAT-Stellar/pull/5)) | `rie-hash14` (`276933516+rie-hash14@users.noreply.github.com`) |

Her 403 commits on `main` are dated 2026-10-01 (54), 2026-10-02 (298) and 2026-10-03 (51), and every one sits in [UAT PR #5](https://github.com/Bl0cksmiths/Orizon-Agents-UAT-Stellar/pull/5/commits) (`uat` → `main`, merged 2026-10-03). **401 of the 403 touch exactly one file** (350 of the 352 in the sprint week); the other two touch two. By area, 151 land in `docs/uat/`, 136 in `tools/`, 115 in `tests/` and 3 in `docs/evidence/`. Her week's testing ran against escrow v2, which went live on testnet on 2026-09-30; none of her commits is dated 28–30 September on any branch.

The commits are real and **role-relevant** (QA) — independent verification of the week's deliverable and of every public claim made about it:

- **6.04 — independent verification of every on-chain claim** (criteria OV-01 to OV-08), with a re-check of **6.02** (reputation floor) and a re-run of **6.03** (dispute, refund and rating) on escrow v2.
- **6.08 — dispute and refund on escrow v2** (DE-01 to DE-06) and **6.09 — operator onboarding, readiness and the Ecosystem page** (OB-01 to OB-09), with a phone checklist.
- **Eight new Playwright specs** — `attestations`, `dispute-escrow-v2`, `evidence-index`, `external-operators`, `operator-onboarding`, `public-artifacts`, `sow-checklist`, `sow-metrics` — and six existing specs updated for escrow v2.
- **Four new verification tools** under `tools/`: `attestation-verify`, `onchain-verify`, `sow-metrics-verify` and `e2e-run`, which re-derive the evidence index's claims from the chain rather than from our API.
- **QA records:** defect write-ups **D-077 → D-092**, nine new evidence reports, and updates to the test plan, the traceability matrix and the sign-off report.

Authored — not `Co-authored-by:` — so they satisfy the "the commit author must be the member" rule. (The PR itself was opened and merged from Dan's account; the **Commits** tab shows `rie-hash14` as the author of each commit.)

**Work in progress, not counted.** A further 75 of her commits sit on branches not yet merged to `main` — 67 for story 6.07 (the escrow v2 payment path on the live dApp) on the `uat-607-*` branches, and 8 for 6.10 (re-verifying the public evidence index) pushed on 2026-10-03, four of them to `uat` after PR #5 merged. They are public on those branches; they are not in the figures above because they are not on `main`.

**Where to see them:** [UAT PR #5 → Commits](https://github.com/Bl0cksmiths/Orizon-Agents-UAT-Stellar/pull/5/commits) — GitHub's banner there says it shows the most recent 250 of the 403. The full listing, filtered on her commit address, is [here](https://github.com/Bl0cksmiths/Orizon-Agents-UAT-Stellar/commits/main?author=276933516%2Brie-hash14%40users.noreply.github.com); GitHub's `?author=<login>` filter does not return her commits.

## What counts / doesn't (per the rule)

- **Counts:** commits and PRs in the public repos, authored by an approved member, relevant to their role. Met by both.
- **Does not count:** private repos, unpushed work, tracker-only activity, or a co-author trailer. None relied on here.
- **Not counted as Week-4 work:** unmerged branches (Rie's 75 above), and the commits of the two Week-3 consolidation PRs that were authored before the window (see Dan's section).
