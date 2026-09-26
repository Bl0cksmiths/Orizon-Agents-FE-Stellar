# Technical documentation & demo evidence — Week 3

Source for [`../Technical-Documentation-and-Demo-Evidence.pdf`](../Technical-Documentation-and-Demo-Evidence.pdf):
a step-by-step, illustrated guide to what shipped in Week 3 on Stellar testnet
for **Deliverable D3 — dispute window and partial-credit refund** (Epic 4),
with every link a reviewer needs to check it for themselves, and a plain
statement of what is **not** evidenced yet. 23 A4 pages, 25 screenshots, every URL clickable.

Milestone M3 · Week 3 · sprint week Mon 2026-09-21 → Fri 2026-09-25, evidence
assembled 2026-09-26. Stellar **testnet** only.

## Pages

| Page  | Section                                                                                                                     |
| ----- | --------------------------------------------------------------------------------------------------------------------------- |
| 1     | Cover — programme, milestone, sprint week, network, team, week totals, contents                                             |
| 2–3   | Links at a glance — app, API, the five repositories, design records, contracts, the two transactions, the 14 merged PRs, QA |
| 4–7   | **Walkthrough A** — the dispute path as the buyer sees it, A1–A6 (**local fixture frames**)                                 |
| 8–11  | **Walkthrough B** — the money path and its six safeguards, B1–B6                                                            |
| 12–16 | **Walkthrough C** — verify on the live API and on-chain, C1–C8                                                              |
| 17–20 | **Walkthrough D** — independent QA, D1–D4                                                                                   |
| 21    | Why D3 has no evidence run yet — the gating defect                                                                          |
| 22    | The path to the D3 evidence run, in order                                                                                   |
| 23    | Demo video — there is **no** Week-3 recording; the Week-2 post, labelled as Week 2’s                                        |

Step-by-step contents, as the cover prints them:

| Step | Title                                                                       | Page |
| ---- | --------------------------------------------------------------------------- | ---- |
| A1   | The settlement, and the window that opens on it                             | 4    |
| A2   | Raising a dispute on one step, with a wallet signature                      | 5    |
| A3   | An open dispute: a promise, not a payment                                   | 6    |
| A4   | A credited dispute, with both artifacts confirmed on-chain                  | 6    |
| A5   | A credit recorded whose transfer has not confirmed                          | 7    |
| A6   | A rejection, with the platform’s reason                                     | 7    |
| B1   | The claim row is written before the signature                               | 8    |
| B2   | The precondition is a clause of the statement that writes                   | 8    |
| B3   | The three-way clamp, and a hard ceiling before anything is signed           | 9    |
| B4   | The adjudication door fails closed, and the switch ships off                | 10   |
| B5   | Nothing reads as done until the chain confirms it                           | 10   |
| B6   | The window is stamped on the settlement, never recomputed                   | 11   |
| C1   | `GET /api/stellar/network` — testnet, the contracts, and an open decision   | 12   |
| C2   | `GET /readiness` — our signer is the ledger’s authorised scorer             | 12   |
| C3   | `GET /openapi.json` — six dispute routes, and no operator security scheme   | 13   |
| C4   | The six routes in the interactive docs                                      | 13   |
| C5   | The refund switch, answered live                                            | 14   |
| C6   | How independent QA presents the two transactions                            | 14   |
| C7   | The refund transfer on Stellar Expert                                       | 15   |
| C8   | The `kind="dispute"` rating on Stellar Expert                               | 16   |
| D1   | The public UAT repository: suites, drills and evidence                      | 17   |
| D2   | The defect register, and the two defects that are not public                | 18   |
| D3   | Eleven found against our own hardening build — including one our fix caused | 19   |
| D4   | The verdict: no-go                                                          | 20   |

## Screenshots

**Two kinds, never mixed, and the builder enforces the distinction.**

1. **Walkthrough A — six local fixture frames (`local-*.png`).** Captured
   **2026-09-26, 19:39–19:43 PHT** from the shipped interface at frontend
   commit `5105a8b`, served by `next dev` out of a detached worktree and
   answered entirely by the end-to-end suite’s stubs (`e2e/mocks.ts`).
   **Every transaction hash in them is a fixture: it exists on no ledger, and
   the Stellar Expert link beside it resolves to nothing.** No wallet was
   connected to anything real; nothing was signed, paid or submitted. They are
   evidence of the _interface_, never of a settlement, a refund or a rating
   having happened. They were produced by
   [`../screenshots/local-capture.spec.ts`](../screenshots/local-capture.spec.ts)
   and are documented in
   [`../screenshots/local-README.md`](../screenshots/local-README.md); they are
   **copied** into this folder unaltered, and the originals in `../screenshots/`
   are not modified by anything here.

   These frames exist because the deployment cannot show this path at all —
   see page 21. Each is marked `"fixture": true` in `shots.json`; the builder
   gives them an amber border, says so in every caption, and **fails the build**
   if one is placed on a page that does not carry the standing warning.

2. **Everything else — 19 shots captured 2026-09-26, 20:01–20:23 PHT** from the
   live testnet deployment and from public GitHub, Stellar Expert and X pages.
   **No wallet was connected and nothing was signed, paid or submitted.** The
   one write request made during capture is the one every reviewer is invited
   to repeat: a `POST` to the uphold route against a dispute id that exists on
   no deployment, on a deployment whose refund switch is off, refused with
   `503 dispute_refunds_disabled` before it reaches any money.

The PNGs are unaltered — the numbered outlines in the PDF are drawn by the
builder from the rectangles in `shots.json`.

### Manifest

| File                                         | Step                                                            | Source                                                                                                             |
| -------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `local-01-dispute-action-open-window.png`    | A1 — settlement view, the open window and the three steps       | **fixture** · `../screenshots/` · the shipped `/app/trace` receipt panel, stubbed                                  |
| `local-02-dispute-dialog.png`                | A2 — the dispute dialog, filled and not submitted               | **fixture** · `../screenshots/`                                                                                    |
| `local-03-receipt-open-dispute.png`          | A3 — a dispute in `open` (“Under review”)                       | **fixture** · `../screenshots/`                                                                                    |
| `local-04-receipt-credited.png`              | A4 — `credited`, both artifacts confirmed                       | **fixture** · `../screenshots/`                                                                                    |
| `local-05-receipt-crediting-unconfirmed.png` | A5 — credit recorded, transfer unconfirmed                      | **fixture** · `../screenshots/`                                                                                    |
| `local-06-receipt-rejected.png`              | A6 — `rejected`, with the platform’s reason                     | **fixture** · `../screenshots/`                                                                                    |
| `b1-adr-0008-claim-before-signing.png`       | B1 — ADR 0008, decision D2                                      | https://github.com/Bl0cksmiths/Orizon-Agents-BE-Stellar/blob/main/docs/decisions/0008-refund-execution.md          |
| `b2-disputes-runbook-credit.png`             | B3 — the runbook on what an upheld dispute pays                 | https://github.com/Bl0cksmiths/Orizon-Agents-BE-Stellar/blob/main/docs/disputes.md                                 |
| `b3-disputes-runbook-operators.png`          | B5 — the runbook on where the records live                      | https://github.com/Bl0cksmiths/Orizon-Agents-BE-Stellar/blob/main/docs/disputes.md                                 |
| `b4-adr-0007-window-stamped.png`             | B6 — ADR 0007, decision D1                                      | https://github.com/Bl0cksmiths/Orizon-Agents-BE-Stellar/blob/main/docs/decisions/0007-dispute-window.md            |
| `c1-api-network.png`                         | C1 — `GET /api/stellar/network` (live body, formatted)          | https://orizon-agents-be-stellar.onrender.com/api/stellar/network                                                  |
| `c2-api-readiness.png`                       | C2 — `GET /readiness` (live body, formatted)                    | https://orizon-agents-be-stellar.onrender.com/readiness                                                            |
| `c3-openapi-facts.png`                       | C3 — queries against the live OpenAPI document, and its answers | https://orizon-agents-be-stellar.onrender.com/openapi.json                                                         |
| `c4-docs-dispute-routes.png`                 | C4 — the `disputes` group of the interactive docs               | https://orizon-agents-be-stellar.onrender.com/docs                                                                 |
| `c5-uphold-refunds-disabled.png`             | C5 — the live `POST …/uphold` request and its `503` response    | https://orizon-agents-be-stellar.onrender.com/docs                                                                 |
| `c8-qa-deliverable-3-evidence.png`           | C6 — QA’s own “Deliverable 3 evidence”, section 2               | https://github.com/Bl0cksmiths/Orizon-Agents-UAT-Stellar/blob/main/docs/uat/evidence/6.03-dispute-refund-rating.md |
| `c6-drill-refund-tx.png`                     | C7 — the refund transfer, ledger 4865810                        | https://stellar.expert/explorer/testnet/tx/a5baac432b582787df0a632b3bc12916c51e12575a8f77bf267fd45b728701b8        |
| `c7-drill-rating-tx.png`                     | C8 — the `kind="dispute"` rating, ledger 4865811                | https://stellar.expert/explorer/testnet/tx/7138e4e36e47f4f4404b2212aad5584d2f8fb941b387da76acae4c3b4cc07184        |
| `d1-uat-repository.png`                      | D1 — the UAT repository’s file listing                          | https://github.com/Bl0cksmiths/Orizon-Agents-UAT-Stellar                                                           |
| `d4-defect-issue-table.png`                  | D2 — the register’s own defect-to-issue table                   | https://github.com/Bl0cksmiths/Orizon-Agents-UAT-Stellar/blob/main/docs/uat/defects.md                             |
| `d2-defect-d-067.png`                        | D3 — the register’s entry for D-067                             | https://github.com/Bl0cksmiths/Orizon-Agents-UAT-Stellar/blob/main/docs/uat/defects.md                             |
| `d3-qa-recommendation.png`                   | D4 — QA’s recommendation, in her own words                      | https://github.com/Bl0cksmiths/Orizon-Agents-UAT-Stellar/blob/main/docs/uat/evidence/6.03-dispute-refund-rating.md |
| `e1-be-issue-67.png`                         | p. 21 — D-050, the dispute path unreachable                     | https://github.com/Bl0cksmiths/Orizon-Agents-BE-Stellar/issues/67                                                  |
| `e2-contracts-issue-3.png`                   | p. 21 — D-039, the escrow charge                                | https://github.com/Bl0cksmiths/Orizon-Agents-Smart-Contract-Stellar/issues/3                                       |
| `f1-week-2-video-post.png`                   | p. 23 — the **Week-2** build post                               | https://x.com/OrizonAgents402/status/2101103657043255772                                                           |

The three rendered boxes (`c1`, `c2`, `c3`, `c5`) are the **live responses**,
re-printed by the capture script: `c1` and `c2` are `JSON.stringify` of the
parsed body, so no value is changed; `c3` prints each query against the live
OpenAPI document beside the answer it returns; `c5` prints the request the
browser sent and the body it received. **The capture fails rather than
contradict the document** if a value the PDF quotes has changed — `network`
`testnet`, `asset` `native`, the four contract ids and the asset SAC,
`ratings.writer` `"scorer"` with signer `GDB4N25U…CDHP`, exactly six dispute
routes, an **absent** `components.securitySchemes`, and a `503` whose code is
`dispute_refunds_disabled`. The two Stellar Expert pages assert `Successful`
and their ledger numbers.

The light, text-dense pages (GitHub, Stellar Expert, the API) are captured at
2× pixel density. GitHub markdown sections are wrapped in place and captured as
elements, because these documents run to tens of thousands of pixels; long
sections are clipped from their heading down rather than shrunk to
illegibility. The X post is drawn by X’s embed renderer
(https://platform.twitter.com/embed/Tweet.html?id=2101103657043255772), because
x.com renders a blank page to a logged-out headless browser.

## Files

- `capture.mjs` — captures every non-fixture PNG and writes `shots.json` (each
  shot’s source URL, capture time, region size and outline rectangles). It never
  touches `../screenshots/`, and never overwrites the six hand-written
  `local-*` manifest entries.
- `build-pdf.mjs` — writes `Technical-Documentation-and-Demo-Evidence.html` and
  prints it with Chromium to `../Technical-Documentation-and-Demo-Evidence.pdf`
  (A4, the same typography and colours as Week 2). It fits the screenshots to
  each page, fails if any page overflows, and fails if a fixture frame lands on
  a page without the standing warning.
- `shots.json` — the manifest. `"fixture": true` marks the six local frames.

## Reproduce

Run from the frontend repo root:

```bash
node Week-3-Tranche-Submission/technical-documentation/capture.mjs            # all shots
node Week-3-Tranche-Submission/technical-documentation/capture.mjs c1 e       # just some (filename prefixes)
node Week-3-Tranche-Submission/technical-documentation/build-pdf.mjs          # → ../Technical-Documentation-and-Demo-Evidence.pdf
```

The capture script wakes the backend first (`/health`, up to ~90 s on a cold
start) and retries each page once with doubled waits. The six `local-*` frames
are **not** reproduced by it — they come from
`../screenshots/local-capture.spec.ts`, which needs a checkout of frontend
`5105a8b`.

## Live readings taken while this was assembled (2026-09-26)

| Reading                          | Result                                                                                                                                                                                                        |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/stellar/network`       | `200` · `network: testnet` · `asset: "native"` · asset SAC `CDLZFC3S…CYSC` (testnet native XLM) · the four Week-2 contract ids, unchanged                                                                     |
| `GET /readiness`                 | `200` · `status: ready` · `ratings.writer: "scorer"` · signer = scorer = `GDB4N25UYM3YNTTAWX7LSGI2P7OR62QZQXRNQWAGF5TFVENDKCTTCDHP`                                                                           |
| `GET /openapi.json`              | `200` · OpenAPI 3.1.0 · 75 paths / 76 operations · **six** dispute routes · `components` holds only `schemas`; `components.securitySchemes` **absent**, no top-level `security`, **no** operation carries one |
| `POST /api/disputes/{id}/uphold` | **`503`** `dispute_refunds_disabled`, with no credential and a dispute id that exists on no deployment                                                                                                        |
| Horizon `a5baac43…01b8`          | `successful: true` · ledger **4865810** · `2026-09-25T16:10:37Z` · source `GA45ITAKDGISRHVKCRLZWOFZAE3QQJH34I3CZZZUSHJRFS72QLRJEGZ2`                                                                          |
| Horizon `7138e4e3…7184`          | `successful: true` · ledger **4865811** · `2026-09-25T16:10:42Z` · same source account                                                                                                                        |

The two transactions are **real and confirmed, and are not Deliverable 3**: the
asset is the drill’s own `UATUSD`, the ledger is the drill’s own
ReputationLedger, and the source account is the drill’s settler rather than the
deployment’s signer. The document says so on every page that shows them.
