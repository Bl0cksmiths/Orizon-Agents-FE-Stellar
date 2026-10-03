# Technical documentation & demo evidence — Week 4

Source for [`../Technical-Documentation-and-Demo-Evidence.pdf`](../Technical-Documentation-and-Demo-Evidence.pdf):
a step-by-step, illustrated guide to what shipped in Week 4 on Stellar testnet —
**escrow v2 and the money path working end to end, and Deliverable D4, the
ecosystem validation package** (Epic 5) — with every link a reviewer needs to
check it for themselves, and a plain statement of what is still open. 19 A4
pages, 20 screenshots, every URL clickable.

Milestone M4 · Week 4 · sprint week Mon 2026-09-28 → Fri 2026-10-02, evidence
assembled 2026-10-03. Stellar **testnet** only.

## Pages

| Page  | Section                                                                                                                                      |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | Cover — programme, milestone, sprint week, network, team, week totals, contents                                                              |
| 2–3   | Links at a glance — D4's live pages, the API, the repositories, design records, contracts, the key transactions, the PRs this document cites |
| 4–5   | **Walkthrough A** — listing an agent as an outside operator does, A1–A3 (D1, D4)                                                             |
| 6–10  | **Walkthrough B** — the money path on escrow v2, B1–B7 (D2, D3, D4)                                                                          |
| 11–14 | **Walkthrough C** — verify the deployment and the chain yourself, C1–C6                                                                      |
| 15–16 | **Walkthrough D** — independent QA, D1–D2                                                                                                    |
| 17    | The demo, published in two parts, with its 14 transactions                                                                                   |
| 18    | The public evidence index — the §6.2 checklist and the §6.3 metrics                                                                          |
| 19    | What is still open — QA sign-off, outside payments, open defects                                                                             |

## Screenshots

**Every frame is of the live deployment or a public page.** Unlike Week 3,
there are no local fixture frames: with escrow v2 live, everything this
document shows could be captured from the real service.

1. **Close-ups in this folder (5)** — captured by [`capture.mjs`](./capture.mjs)
   at 2x on 2026-10-03, recorded in [`shots.json`](./shots.json):
   `b1-escrow-v2-why.png` (the contracts repository's escrow v2 interface
   document), `b2-adr-0010-escrow-v2.png` (backend ADR 0010),
   `c1-api-network.png` and `c2-api-readiness.png` (the live API's responses,
   re-indented, with the fields the text cites tinted; the capture fails if a
   live value no longer matches the text), and `d1-qa-epic-6-status.png`
   (QA's sign-off report). Each GitHub document is shown as one section, from
   its heading.
2. **Full-page frames borrowed from [`../screenshots/`](../screenshots/) (15)**
   — read from there, not copied, so the two PDFs show the same captures. Their
   sources, times and crops are in that folder's
   [manifest](../screenshots/README.md). Three of them —
   `d2a-plan-card-onchain-score-desktop-1440.png`,
   `d2b-routing-exclusion-desktop-1440.png` and
   `d3c-dispute-refunded-desktop-1440.png` — were captured from the live site on
   2026-09-30 for the public evidence index, and their captions say so.

No wallet was connected and nothing was signed, paid or submitted for any of
them.

## Rebuild

```bash
node Week-4-Tranche-Submission/technical-documentation/capture.mjs     # the 5 close-ups
node Week-4-Tranche-Submission/technical-documentation/build-pdf.mjs   # the PDF
```

The builder writes `Technical-Documentation-and-Demo-Evidence.html` here for
inspection, prints it with Playwright's Chromium, and refuses to finish if any
page's content overflows. Under WSL, use Playwright's own Chromium, not a
Windows Chrome.
