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
