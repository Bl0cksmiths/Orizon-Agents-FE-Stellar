# Local screenshots — Epic 4 dispute interface (`local-*`)

**Status: all 6 captured (2026-09-26, 19:39–19:43 PHT).** Every PNG was opened
and checked by eye after capture.

These six frames were **captured locally on 2026-09-26**, from commit
**`5105a8b`** (`origin/main`, "Merge pull request #76 from
Bl0cksmiths/fix/4.07-fe-epic-4-hardening"), served by `next dev` out of a
detached worktree at that commit, **against stubbed API responses drawn from
the end-to-end test fixtures** in `e2e/mocks.ts` — the same harness
`e2e/disputes.spec.ts` and `e2e/dispute-receipt.spec.ts` use. **Every
transaction hash shown is a fixture: it exists on no ledger, and the Stellar
Expert link beside it resolves to nothing. No wallet was connected to anything
real; nothing was signed, paid or submitted.** They show the **shipped
interface**, not a run on the deployed service.

**Why local.** This feature cannot be exercised on the deployed stack. A
contract-level defect stops `PaymentEscrow.charge` moving the payer's funds, so
no workflow settles there; and the dispute window is stamped at settlement, so
no window is ever opened and no dispute can be raised. These frames are
therefore the only way to show what shipped. They are evidence of the
**interface**, not evidence of a settlement, a refund or a rating having
happened.

These are separate from the numbered (`01-…`, `12-…`) shots in this folder and
from their `README.md`, which cover public web pages.

## Manifest

The standing sentence, once, for all six: **every transaction hash in these
frames is a test fixture from `e2e/mocks.ts` — it exists on no ledger, and the
Stellar Expert link beside it resolves to nothing.** It is repeated per shot
below.

| #   | Filename                                     | What it shows                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |  Size  | Fixture hashes in the frame                                                                                                                                                         |
| --- | -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :----: | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `local-01-dispute-action-open-window.png`    | Story 4.05 settlement view on `/app/trace?task=…`: total charged 0.063 USDC, the payer, the settlement time, the charge and seal transactions; **"DISPUTE WINDOW OPEN · 22h 59m left"** with the closing instant; the terms (an upheld dispute credits 50% of the step's charge, paid by the platform, never clawed back from the agent; the platform decides, no on-chain arbitration); and the three steps — the two delivered ones each with a price, a **DISPUTE** button and "credits 0.0045 / 0.027 USDC if upheld", the failed one marked **NOT CHARGED** with "Nothing was charged for this step, so there is nothing to dispute" | 651 KB | Charge `a41c7e0d…4b1f7c29`, seal `0e9d4c71…7d93f4a8`, payer address `GBRPYHIL…W7QC7OX2H` — fixtures, on no ledger; the Stellar Expert links beside them resolve to nothing          |
| 2   | `local-02-dispute-dialog.png`                | Story 4.05 dispute form for one step: **"Dispute step 2"**, the step named (`Step 2 · code.gen`, "calculator app, 3 files"), what is at stake (charged 0.054 USDC / credited if upheld 0.027 USDC), the three terms including the **50%** policy share, the reason field with a reason typed into it, and the **SIGN AND SUBMIT** control                                                                                                                                                                                                                                                                                                 | 444 KB | None — no transaction hash appears in this frame. Nothing was signed or submitted: the form was filled to show the enabled control, then closed                                     |
| 3   | `local-03-receipt-open-dispute.png`          | Story 4.06 receipt for a dispute in `open`: badge **UNDER REVIEW**, when it was raised and last updated, the next-step sentence ("The platform is reviewing this dispute; if it is upheld, the step's credit is paid to your wallet and code.gen's reputation records the dispute."), the credit line stated as a promise ("Up to 0.027 USDC **would** be credited … funded by the platform, not clawed back from the agent") and the buyer's own reason                                                                                                                                                                                  | 654 KB | None — no transaction hash appears in this frame, because nothing has been paid                                                                                                     |
| 4   | `local-04-receipt-credited.png`              | Story 4.06 receipt for a **credited** dispute with a **confirmed** refund and a **confirmed** rating: badge **REFUNDED**, "Done: you received 0.027 USDC, and it cost code.gen a dispute rating on its reputation", the credit line, then the two on-chain rows — **Refund transfer** (CONFIRMED ON STELLAR, full hash, "VIEW REFUND ON STELLAR.EXPERT") and **Dispute rating against code.gen** (CONFIRMED ON STELLAR, full hash, "VIEW RATING ON STELLAR.EXPERT")                                                                                                                                                                       | 591 KB | Refund `63e65866…50984327`, rating `e46d4a71…b40136b30` — fixtures, on no ledger; both Stellar Expert links resolve to nothing                                                      |
| 5   | `local-05-receipt-crediting-unconfirmed.png` | **The state this epic exists to get right.** A credit recorded whose transfer is **not** confirmed on-chain: the badge reads **REFUND IN PROGRESS**, never "Refunded"; the sentence says "The platform recorded this credit as paid, but the refund transfer is not confirmed on Stellar yet; the platform reconciles it by hand — you will not be paid twice, and will not be skipped."; the credit line stays a promise ("Up to 0.027 USDC **to be** credited"); the **Refund transfer** row reads **NO TRANSACTION ON RECORD** with no hash and no link, beside a **Dispute rating** row that is confirmed                             | 550 KB | Rating `e46d4a71…b40136b30` only — a fixture, on no ledger; its Stellar Expert link resolves to nothing. The refund row deliberately carries no hash: that is the state being shown |
| 6   | `local-06-receipt-rejected.png`              | Story 4.06 receipt for a **rejected** dispute: badge **REJECTED**, "The platform did not uphold this dispute: no credit was issued, code.gen's reputation is unchanged, and the reason is below", the buyer's reason, and **WHY IT WAS REJECTED** with the platform's own words                                                                                                                                                                                                                                                                                                                                                           | 479 KB | None — no transaction hash and no link appears in this frame, because nothing was paid                                                                                              |

## Notes on the frames

> **Crops.** #1 is the Receipt panel element alone (976 × 997 CSS px) — the site
> header, the trace log below it and the rest of the page are outside the
> frame. #2 is the dialog element alone. #3–#6 are one step's row inside the
> Receipt panel (926 CSS px wide, the panel's full inner width), which is where
> a dispute receipt is drawn; the panel header and the other steps are outside
> the frame. Nothing inside any frame was retouched.

> **Note on #2.** The dialog's body scrolls at desktop width (the dialog is
> capped at 46rem tall), and the frame is the form as it opens. Just below the
> visible area sit the character counter and the line "Submitting asks the
> wallet that paid, GBRP…OX2H, to sign a message. Signing costs nothing, and no
> transaction is sent." Nothing was signed: after the frame was taken the
> dialog was closed, and no `POST /api/disputes` was made.

> **Note on the 50%.** The credited fraction on screen comes from the fixture
> policy in `e2e/mocks.ts` (`credited_fraction: 0.5`), chosen there so a "50%"
> in the UI can only have been served by the policy and never hard-coded in the
> copy. The backend's own default is a full credit. Read the figure as "the UI
> prints the policy it is served", not as the platform's published share.

> **Note on the times and the amounts.** "Settled 1h ago", "22h 59m left",
> "Raised … 40m ago" and the USDC figures are all fixture values computed
> relative to the capture, shown in GMT+8 (Asia/Manila). They describe no real
> workflow.

> **Note on file sizes.** Captured in a 1280 × 1100 viewport at a device pixel
> ratio of 2. To keep the PDF small, #1 was resized to 1.25× and reduced to 128
> colours; #4, #5 and #6 were kept at their captured size and reduced to 256
> colours; #2 and #3 are untouched 2× captures. Resizing and colour reduction
> were the only post-processing; no crop was applied after capture and no pixel
> was painted.

## Reproduce

`local-capture.spec.ts` beside these PNGs is the script that made them. Copy it
into `e2e/` of a checkout of `5105a8b` and run:

```bash
E2E_PORT=3211 npx playwright test e2e/local-capture.spec.ts --workers=1
```

It drives the real `/app/trace` page with every `/api/*` call answered by
`e2e/mocks.ts`: the trace stream replays a finished run, the disputes read is
stubbed, and the wallet is the specs' restored-session stand-in. It connects to
no backend, signs nothing and sends nothing. `E2E_PORT` keeps it off any dev
server already running.
