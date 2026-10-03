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
- **The Week-3 frontend consolidation is not counted.** Frontend [#88](https://github.com/Bl0cksmiths/Orizon-Agents-FE-Stellar/pull/88) and backend [#87](https://github.com/Bl0cksmiths/Orizon-Agents-BE-Stellar/pull/87) merged at 02:04–02:05 on 2026-09-28, Manila time, inside this window, but their commits were authored before it and fall outside every count above. [`05-pull-requests.md`](./05-pull-requests.md) lists them as carry-over.

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
