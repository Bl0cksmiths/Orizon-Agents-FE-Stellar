# Screenshots — evidence manifest

**Status: ✅ all 14 captured (2026-09-19, 14:59–15:13 PHT).** #1–#13 are
full-page PNGs of public pages taken in a 1440×900 viewport; #14 is an element
capture (see its note). Every PNG was opened and checked by eye after capture. The underlying artifact is also linked by URL
below so a reviewer can verify it live. The same images, captioned, are in
[`../Proof-of-Deliverables.pdf`](../Proof-of-Deliverables.pdf) (cover, two summary pages, then one page per screenshot).

All shots were captured on 2026-09-19 from the live testnet deployment and public
GitHub / Stellar Expert pages.

## Manifest

| # | Filename | What it shows | Captured | Source URL |
|---|----------|---------------|:--------:|------------|
| 1 | `01-orizons-plan-card.png` | Story 3.04 plan card for the demo intent “tetris game in html” (preset button → Decompose; nothing authorized, simulated or paid): floor 2.75 applied, each step's reputation + source; every agent carries the ≈3.50 starting estimate and clears the floor (“the floor acted on no agents”) | ✅ 825 KB | https://orizons.xyz/app/orchestrator |
| 2 | `02-orizons-agents-standing.png` | Story 3.05 marketplace standing: selection floor stated once above the table; “external” provenance mark on on-chain agents (seeded rows unmarked); “not yet operational” and “delisted by operator” marks; every agent clears the floor | ✅ 1200 KB | https://orizons.xyz/app/agents |
| 3 | `03-orizons-operator-dashboard.png` | Story 2.06 operator dashboard (“My Agents”) as a visitor sees it (connect-wallet prompt); once the owner connects, it lists their agents with standing, binding and Settlement panels | ✅ 373 KB | https://orizons.xyz/app/operator |
| 4 | `04-orizons-bind.png` | Stories 2.01/2.05 endpoint binding by owner-wallet signature (no wallet connected; `weather_bot` and the URL are the form's placeholders) | ✅ 793 KB | https://orizons.xyz/app/bind |
| 5 | `05-be-readiness.png` | Backend `/readiness` (BE #58/#59): `cold_start` routable, lower bound 5677 vs floor 5500 bps (177 bps margin); `ratings.writer: "scorer"` — production writes on-chain ratings. Body re-indented in the browser for legibility, content unchanged | ✅ 59 KB | https://orizon-agents-be-stellar.onrender.com/readiness |
| 6 | `06-be-pr-59.png` | Backend PR #59 (`feat/week-2-dan`, 124 commits, merged 2026-09-18): BLO-121 planner-outage fallback, observable ratings, log redaction | ✅ 829 KB | https://github.com/Bl0cksmiths/Orizon-Agents-BE-Stellar/pull/59 |
| 7 | `07-fe-pr-62.png` | Frontend PR #62 (`feat/week-2-dan`, 34 commits, merged 2026-09-18): the plan card's planner-fallback notice + “Ask the planner again” | ✅ 565 KB | https://github.com/Bl0cksmiths/Orizon-Agents-FE-Stellar/pull/62 |
| 8 | `08-uat-pr-3-rie-commits.png` | UAT PR #3 commits tab: 142 commits, **141 by `rie-hash14`** (21 on 12 Sep, 50 on 16 Sep, 70 on 17 Sep) + 1 merge of main by ALGOREX-PH — 6.02 floor, 6.05 external dispatch, 6.06 operator surfaces, defects D-036→D-049 | ✅ 1352 KB | https://github.com/Bl0cksmiths/Orizon-Agents-UAT-Stellar/pull/3/commits |
| 9 | `09-be-pull-requests.png` | Backend PRs merged 2026-09-13..18 — **13 total** (#41 … #59) | ✅ 241 KB | https://github.com/Bl0cksmiths/Orizon-Agents-BE-Stellar/pulls?q=is%3Apr+is%3Amerged+merged%3A2026-09-13..2026-09-18 |
| 10 | `10-fe-pull-requests.png` | Frontend PRs merged 2026-09-13..18 — **10 total** (#48 … #62) | ✅ 199 KB | https://github.com/Bl0cksmiths/Orizon-Agents-FE-Stellar/pulls?q=is%3Apr+is%3Amerged+merged%3A2026-09-13..2026-09-18 |
| 11 | `11-contracts-pr-2.png` | Contracts PR #2 (story 3.07, merged 2026-09-16): the deployed address book is now tracked in git | ✅ 343 KB | https://github.com/Bl0cksmiths/Orizon-Agents-Smart-Contract-Stellar/pull/2 |
| 12 | `12-reference-agent-repo.png` | Story 2.04 reference external agent repo (created 2026-09-15): one-file agent that verifies Orizon's signed dispatches; five-step README | ✅ 1701 KB | https://github.com/Bl0cksmiths/Orizon-Agents-Example-Agent-Stellar |
| 13 | `13-set-scorer-tx-stellar-expert.png` | Admin tx `set_scorer(GDB4…CDHP)` on the ReputationLedger `CDCS…22ZT` (2026-09-19, Successful, ledger 4755006, 06:16:57 UTC) — makes production's key the ledger's authorized scorer, so every paid run's ratings are written on-chain; verified by the #5 `ratings` check | ✅ 97 KB | https://stellar.expert/explorer/testnet/tx/216e1b5f6ade4d75ec671bcda27b462bfd373d041b1ba2150d76002ee8d201f8 |
| 14 | `14-week-2-x-post.png` | Week-2 public build post from @OrizonAgents402, **published 2026-09-19 at 08:18 PHT** (00:18 UTC). Captured through X's own embed renderer — see note | ✅ 105 KB | https://x.com/OrizonAgents402/status/2101103657043255772 (rendered via https://platform.twitter.com/embed/Tweet.html?id=2101103657043255772) |

> Note on #14: `x.com/OrizonAgents402/status/2101103657043255772` renders a
> **blank page** to a logged-out headless browser (no post content in three
> tries, waits of 15–40 s), so that frame was not kept. The shot is X's official embed view
> of the same post id — the embed card element only (550×697), not a
> 1440×900 frame. Post text, author, time and like count match the
> syndication record for that id (`created_at` 2026-09-19T00:18:43Z).

> These frames prove the floor is stated and applied before payment; they do
> not show any agent being excluded by it, and nothing in them should be
> described as an exclusion.
>
> Note on the PDF: tall pages (#2, #6, #7, #8, #12) appear in the PDF as
> labelled excerpts (vertical slices) of the PNG so the text stays legible at
> A4 width; the gap bars say what was left out. #5 is trimmed to the top 520 px
> of its frame (the rest is blank). The PNGs here are complete.

## Reproduce

```bash
node Week-2-Tranche-Submission/screenshots/capture-screenshots.mjs        # all 14
node Week-2-Tranche-Submission/screenshots/capture-screenshots.mjs 01 14  # just some
node Week-2-Tranche-Submission/screenshots/build-proof-pdf.mjs            # → ../Proof-of-Deliverables.pdf
```

The capture script is read-only: it never connects a wallet, authorizes,
simulates or pays; it wakes the Render backend first (free tier can take ~60 s)
and retries each shot once with doubled waits. `build-proof-pdf.mjs` writes
`Proof-of-Deliverables.html` next to it and prints it with Chromium (A4).

Requires Chromium's system deps (one-time, needs sudo in a real terminal):
`sudo apt-get install -y libnspr4 libnss3 libasound2t64` — or `npx playwright install-deps chromium`.
