# 02 — Public commit visibility (multi-contributor proof)

**SDF rule (approval email + onboarding deck):** every approved proposal member
must have at least one **visible public commit every week**, relevant to their
assigned role — and *"volume from one contributor does not satisfy it."*

**Verdict for Week 1: ✅ both approved members have public, role-relevant commits.**
(Linear: [BLO-106 / 7.04](https://linear.app/bl0cksmiths/issue/BLO-106) — Done.)

## Danielle (Dan) — lead engineer

| Repo | Authored commits (this week) | Merge commits |
|------|------------------------------|---------------|
| [Orizon-Agents-BE-Stellar](https://github.com/Bl0cksmiths/Orizon-Agents-BE-Stellar) | 81 | 5 |
| [Orizon-Agents-FE-Stellar](https://github.com/Bl0cksmiths/Orizon-Agents-FE-Stellar) | 48 | 7 |
| **Total** | **129 authored** | **12 merges** |

Author identity: `Danielle Bagaforo Meer <algorexph@gmail.com>` (web-merge identity `Danielle Meer <…ALGOREX-PH…>`). Work spans the whole registration build — see [`01-dan-tasks-completed.md`](./01-dan-tasks-completed.md).

## Rieselle (Rie) — PM + QA

| Repo | Authored commits (this week) | Identity |
|------|------------------------------|----------|
| [Orizon-Agents-UAT-Stellar](https://github.com/Bl0cksmiths/Orizon-Agents-UAT-Stellar) | **99** | `rie-hash14` (`276933516+rie-hash14@users.noreply.github.com`) |

Dates: 96 commits on 2026-09-10, 3 on 2026-09-12 — within the Week-1 window.
The commits are real and **role-relevant** (QA): an end-to-end Playwright UAT
suite that runs against the **live deployment**, plus the full UAT document set
(test plan, runbook, traceability, defects, sign-off report, wallet/browser
matrix). Authored — not `Co-authored-by:` — so they satisfy the "the commit
author must be the member" rule.

## What counts / doesn't (per the rule)

- **Counts:** commits + PRs in the public repos, authored by an approved member, relevant to their role. ✅ met by both.
- **Does not count:** private repos, unpushed work, Linear-only activity, or a co-author trailer. None relied on here.

Full audit: `docs/evidence/week-1-commit-visibility.md` in the backend repo.
