# 03 — Deliverable D3: Dispute Window & Partial-Credit Refund (testnet)

**SOW §6.1 D3:** _a **dispute tx hash** and the corresponding **partial-refund tx** on Stellar Expert (testnet), plus a recording of the dispute UI on the trace/receipt view._

## Status: build complete and merged; the on-chain evidence run on the live deployment is not yet captured

**Read this before anything else in this document.** Every part of D3 is built, merged to `main` in both repositories, hardened in a dedicated pass, and independently tested by QA. What D3 asks for as *evidence* — a refund transaction and a dispute-rating transaction produced by the live deployment, plus a recording of the dispute UI in that same session — **does not exist yet**, for two reasons that are both on the public record:

1. **No workflow settles on the deployment**, so no step is disputable. `PaymentEscrow.charge` cannot move the payer's funds, so no settlement record is written and no dispute window opens — QA defect **D-050** ([BE #67](https://github.com/Bl0cksmiths/Orizon-Agents-BE-Stellar/issues/67)), behind the contract defect **D-039** ([contracts #3](https://github.com/Bl0cksmiths/Orizon-Agents-Smart-Contract-Stellar/issues/3)).
2. **Dispute refunds are switched off on the deployment**, so nothing could be upheld even if a dispute existed — QA defect **D-051** ([BE #68](https://github.com/Bl0cksmiths/Orizon-Agents-BE-Stellar/issues/68)). Verified again while writing this document; see [The live deployment](#the-live-deployment-read-2026-09-26).

Two **real testnet transactions** do exist — a refund transfer and a `kind="dispute"` rating — produced by QA running the real backend against a drill ReputationLedger with a test asset. They prove the code path. They are **not Deliverable 3**, and this document says why in [The evidence that exists](#the-evidence-that-exists-and-what-it-is-not). Independent QA's own verdict on the story is **no-go**. Nothing in this bundle presents a drill capture as live behaviour.

| What shipped                                                     | Status               | Evidence                                                                                                                                                         |
| ---------------------------------------------------------------- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 24-hour dispute window, stamped on the settlement record          | Merged 2026-09-21    | [BE #60](https://github.com/Bl0cksmiths/Orizon-Agents-BE-Stellar/pull/60) · [BLO-30](https://linear.app/bl0cksmiths/issue/BLO-30) · ADR 0007 D1                     |
| Payer-only disputes, proved by a wallet signature                 | Merged 2026-09-21    | [BE #60](https://github.com/Bl0cksmiths/Orizon-Agents-BE-Stellar/pull/60) · ADR 0007 D2                                                                            |
| Settler-funded partial credit, payable exactly once               | Merged 2026-09-21    | [BE #62](https://github.com/Bl0cksmiths/Orizon-Agents-BE-Stellar/pull/62) · [BLO-31](https://linear.app/bl0cksmiths/issue/BLO-31) · ADR 0002, ADR 0008              |
| `kind="dispute"` rating on the ReputationLedger, under a derived id | Merged 2026-09-21    | [BE #63](https://github.com/Bl0cksmiths/Orizon-Agents-BE-Stellar/pull/63) · [BLO-32](https://linear.app/bl0cksmiths/issue/BLO-32) · ADR 0009 D1                     |
| Dispute action and receipt on the trace view                      | Merged 2026-09-21    | [FE #68](https://github.com/Bl0cksmiths/Orizon-Agents-FE-Stellar/pull/68) + [BE #64](https://github.com/Bl0cksmiths/Orizon-Agents-BE-Stellar/pull/64) · [BLO-33](https://linear.app/bl0cksmiths/issue/BLO-33) |
| A receipt that never reads as done before the chain confirms it   | Merged 2026-09-22    | [FE #69](https://github.com/Bl0cksmiths/Orizon-Agents-FE-Stellar/pull/69) + [BE #65](https://github.com/Bl0cksmiths/Orizon-Agents-BE-Stellar/pull/65) · [BLO-34](https://linear.app/bl0cksmiths/issue/BLO-34) |
| Hardening pass over the whole dispute money path                  | Merged 2026-09-25    | [BE #75](https://github.com/Bl0cksmiths/Orizon-Agents-BE-Stellar/pull/75) + [FE #76](https://github.com/Bl0cksmiths/Orizon-Agents-FE-Stellar/pull/76) — see [`04`](./04-money-path-safety.md) |
| All six dispute routes served by the deployment                   | Live                 | `GET /openapi.json` — [table below](#the-live-deployment-read-2026-09-26)                                                                                          |
| The platform's signer is authorised to write the dispute rating   | Live                 | `GET /readiness` → `ratings.writer: scorer`                                                                                                                       |
| Independent QA across seven sub-stories                           | Complete, verdict no-go | [BLO-42](https://linear.app/bl0cksmiths/issue/BLO-42) and [`docs/uat/evidence/6.03-dispute-refund-rating.md`](https://github.com/Bl0cksmiths/Orizon-Agents-UAT-Stellar/blob/main/docs/uat/evidence/6.03-dispute-refund-rating.md) |
| Refunds enabled on the deployment                                 | **No**               | `POST /api/disputes/{id}/uphold` → `503 dispute_refunds_disabled` (D-051)                                                                                          |
| A dispute raised on the deployment                                | **No**               | no run settles (D-050, behind D-039)                                                                                                                              |
| The refund tx and the dispute-rating tx **from the deployment**   | **Not captured**     | [outstanding work](#what-is-outstanding-for-d3)                                                                                                                   |
| The recording of the dispute UI                                   | **Not captured**     | [outstanding work](#what-is-outstanding-for-d3)                                                                                                                   |

## The window

**When a paid workflow settles, its buyer has 24 hours to dispute any step of it.** The clock starts at settlement — the moment the charge and the attestation land on-chain — because before the charge there is no money at stake and nothing to credit back.

**The closing time is written once, onto the settlement record, and never recomputed.** `SettlementRecord.window_closes_at` is stamped at settlement from the value of `DISPUTE_WINDOW_SECONDS` (shipped at `86400.0`) in force at that instant, and every later check compares against that stored field rather than re-evaluating `settled_at + config`.

That is the difference between a promise and a setting. If the deadline were recomputed on read, retuning the window afterwards would silently move deadlines for work already done — shortening it would close windows a buyer was told were open, lengthening it would reopen windows an operator had been told were closed and whose earnings they believed final. Neither is an outcome anyone would trace back to the config change that caused it. The stamp makes the knob mean what an operator expects: it governs workflows that settle *after* the change, and nothing that already happened. The reasoning is in [ADR 0007 D1](https://github.com/Bl0cksmiths/Orizon-Agents-BE-Stellar/blob/main/docs/decisions/0007-dispute-window.md), and it is written beside the setting in `app/config.py` and on the field in `dispute_store.SettlementRecord`, because it is exactly the kind of apparently redundant field a later cleanup deletes.

A dispute raised after the window has closed is refused, and the refusal **states when it closed** rather than only that it did — a window whose length is discovered on rejection is not recourse. Timestamps are epoch seconds from the service's own clock, never the database's, so no timezone conversion sits between what the buyer was promised and what is read back. The per-task read returns the server's `now` alongside the deadline, so the buyer's countdown corrects for a client clock that has drifted.

The window closing deletes nothing: not the dispute record, not the settlement record, and not a dispute opened before it closed.

**Settlement had to become durable for any of this to be answerable.** Before [BE #60](https://github.com/Bl0cksmiths/Orizon-Agents-BE-Stellar/pull/60), the job id was a local variable inside the settlement function, the payer was a function parameter, and there was no per-step charge and no settlement timestamp anywhere. The in-memory task store could not hold them either: it is capped at 200 entries, it **evicts terminal tasks first** — precisely the set a buyer disputes — and it is lost on restart, which a free-tier instance performs whenever it idles. So a `SettlementRecord` carrying the payer, the job id, the authorization id, the charge and seal transactions, what actually moved on-chain, each step's price and delivery flag, and both timestamps is written inside the settlement path, in Postgres, append-only. `settled_usdc` is what the charge actually moved rather than what the plan quoted, so a credit can never exceed what the buyer really paid.

## Who may dispute, and how they prove it

**Only the payer.** The address that authorized the escrow and whose funds actually moved is recorded with the settlement, and it is the only address that can open a dispute against that workflow.

**Proof is an ed25519 signature from that wallet — no account, no password, no session.** Three steps:

1. **Ask for a challenge** on the job and the step. `POST /api/disputes/challenge` returns a single-use nonce, the exact message to sign, and when the challenge expires.
2. **Sign that message** with the wallet that paid. The message is `orizon-dispute:v1:{job_id_hex}:{step_index}:{nonce}` — domain-separated, versioned, and covering *what is being authorized*, so a captured signature cannot be replayed against a different step or a different workflow. Both encodings real wallets produce are accepted: the SEP-53 framing Freighter implements, and the raw-bytes form. Verification goes through the SDK's `verify_message` rather than a hand-built second copy of the framing.
3. **Post the signature** with the written reason.

The frontend checks the challenge before the wallet is asked to sign it — the returned message must name the job and step the buyer asked about, because a wallet should not be asked to sign a message the client did not expect.

**Why not the capability token the story card proposed.** The task read token is a fine credential for reading a trace and the wrong one for authorizing a payout, for three compounding reasons: it is process-local memory, so it does not survive the restart the 24-hour window is measured against; it is evicted in lockstep with its task, terminal tasks first, so it is often gone well before the window is; and its guard `TASK_AUTH_REQUIRED` ships off so the public demo stays open, which means an endpoint trusting it would accept a dispute from anyone holding a task id. A dispute is a write that ends with funds leaving the platform wallet and a permanent low rating on an operator's on-chain record. The full argument is [ADR 0007 D2](https://github.com/Bl0cksmiths/Orizon-Agents-BE-Stellar/blob/main/docs/decisions/0007-dispute-window.md).

**The cost of that choice, stated.** The wallet that paid must be *connected* at dispute time; remembering the address is not enough. And a buyer who no longer controls the wallet that paid cannot dispute — there is no account to recover into. That is the same trade permissionless payment makes everywhere else in this marketplace, and it is disclosed rather than discovered.

**A non-payer is offered nothing, and is never sent the complaint text.** A connected wallet that is not the payer sees no Dispute button and no disabled button — no action of any kind. The buyer's own words are removed from the data the page receives, not merely hidden by the panel: without a task token or the operator key, the backend itself sends `reason: ""` and `rejection_reason: null`. QA proved this from the outside (6.03f, FS-06): with another wallet and with no wallet, in fresh browser contexts, neither the payer's reason nor the adjudicator's rejection reason appeared in the rendered DOM, in the page source as served, or in any response the browser received. Closing that hole was part of the hardening pass — before [BE #75](https://github.com/Bl0cksmiths/Orizon-Agents-BE-Stellar/pull/75) a task id alone returned both free-text fields to an anonymous caller.

**What can be disputed.** A step that was *settled*: a workflow is charged as a whole but disputed a step at a time, because a step is the unit with a price, an agent and an outcome. A step that never delivered was never charged, so there is nothing to credit and nothing to dispute — the settlement record keeps a `delivered` flag per step precisely so that stays answerable a day later, when the run's trace is long gone. One dispute per step: a second dispute against the same step returns **the original dispute, unchanged**, rather than an error the buyer must act on. A different step of the same workflow is a separate dispute and is allowed. A simulated run — no wallet, no authorization — charges nothing, settles nothing and has no window.

**The reason is mandatory and is kept**, up to 500 characters; a longer one is refused outright rather than accepted and stored in part. It stays on the record whether the dispute is upheld or rejected, because it is the evidence trail an adjudication actually reads.

## What an upheld dispute pays, and who pays it

The credit is a **stated policy, not a case-by-case judgement**. `DISPUTE_CREDITED_FRACTION` ships at `1.0` — the whole of what the disputed step cost. It is a *partial* refund of the **workflow**: the steps that did deliver stay paid, and their agents keep their earnings.

**The amount transferred is the smallest of three numbers:**

| bound                                                            | why it exists                                                                            |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| the amount **frozen on the dispute when it was opened**           | the buyer can never be paid less than they were shown, and never more                     |
| the step's price × the **policy fraction in force at adjudication** | the policy is honoured as it stands                                                       |
| **what the workflow's charge actually moved on-chain**            | the platform never refunds money it did not collect                                       |

With the shipped policy those are normally the same number. They can differ, because the per-step figure starts life as the plan's *quoted* price while the charge's total is what was really submitted. One consequence is worth stating rather than leaving to be discovered: because the frozen amount is only ever an upper bound, *lowering* the fraction does reach disputes already open, while *raising* it cannot. The guarantee is one-directional on purpose. A credit above `MAX_REFUND_USDC` (shipped at `1.0`) is refused outright, before anything is signed.

**The credit is funded by the platform, and never clawed back from the agent.** It is a `transfer` from the settler's own wallet to the buyer over the asset contract — not a reversal of the original charge, and not a seizure of anything the agent was paid. The deployed `PaymentEscrow` has **no refund entrypoint and never takes custody**: `charge` sends funds from the payer straight to the agent's owner, so there is nothing held anywhere to reverse. An operator's settled earnings are final. The alternatives — adding a `refund` entrypoint, or holding funds in escrow until the window closes — were both rejected for this sprint because each requires redeploying `PaymentEscrow` and therefore **re-publishing the four testnet contract ids that SOW §6.1 lists as submitted evidence**. The reasoning and the rejected options are in [ADR 0002](https://github.com/Bl0cksmiths/Orizon-Agents-BE-Stellar/blob/main/docs/decisions/0002-partial-credit-refund.md).

**A claim row is taken before the transfer is signed, so a credit is payable exactly once.** Upholding happens in a fixed order:

1. The dispute is recorded `upheld` — a compare-and-set, so a second adjudicator cannot quietly overrule the first.
2. A **refund claim** is taken on that dispute: a row in a table, so it survives a restart, and only one caller can ever hold it. The dispute moves to `crediting`. If the claim cannot be taken, **nothing is signed at all**.
3. The amount is computed and checked against the cap **before** any transaction is built.
4. The settler signs the transfer to the buyer.
5. On success the dispute becomes `credited` with the refund transaction hash on its record, and the claim is dropped.
6. **Only then** — the credit landed and recorded — the dispute rating is written.

Two adjudicators clicking at the same moment, a retried request, a process redeployed mid-flight: all meet the same row, and only one gets past it. A repeat uphold of a `credited` dispute signs **no transfer** and returns the same refund hash.

**When the transfer definitively fails**, the claim is released and the dispute returns to `upheld`, payable again — a buyer who was not paid stays payable. **When the transfer times out, nothing is retried:** the dispute stays in `crediting` with the in-flight hash recorded, for a person to reconcile against the chain. That is a deliberate trade of *paying late rather than ever paying twice*, because the asset contract has no more of an undo than the escrow does.

**Adjudication is a permissioned, trusted operation, and it is disclosed everywhere rather than implied.** A person reviews the reason and the settled record and decides; no contract weighs the claim and no escrow releases on a verdict. There is **no on-chain arbitration** in this sprint. A rejection must say why: the note is required, 1–500 characters, and is returned to the buyer as `rejection_reason`, because a rejection with no explanation is worse than no dispute system at all. Opening a dispute proves nothing and costs the agent nothing until it is upheld.

**The two adjudication routes fail closed, and are the only routes in the service that do.** Every other route treats an unset `API_KEY` as "the demo is open"; `uphold` and `reject` treat it as *refuse*, on every network including testnet, and they refuse while `DISPUTE_REFUNDS_ENABLED` is false — the shipped default. The asymmetry is deliberate: a server-signed charge can only spend an allowance the payer already authorised on-chain, while an upheld dispute spends the platform's own balance on an adjudicator's say-so with nothing on-chain to bound it. And turning the switch on without a key is not a silent weakness — `DISPUTE_REFUNDS_ENABLED=true` alone makes the process **refuse to start** unless `API_KEY` is set, and the error says why. There is no order of setting the two in which the rule does not bite.

## The negative on-chain rating

An upheld, paid dispute has one more consequence, and it is the one that falls on the agent: the settler writes a rating against it on the **ReputationLedger** `CDCSOBEVZUPQZV5GV4D6KYHZCLNGW2KXY74RUHSZ3EZUXF34DPW422ZT`, `kind = "dispute"`, scored **10 out of 100**, weighted by the step's quoted price exactly as every other rating is. It is written only once the credit has landed and been recorded, so no agent is ever rated for a dispute whose buyer was not paid. It moves the agent's `disputed` count and `dispute_rate_bps`, and the next plan decomposed after it lands is routed on the new score rather than a cached one — which is where D3 closes the loop back onto [D2's reputation-gated routing](../Week-2-Tranche-Submission/03-deliverable-D2-reputation-routing.md).

**It is written under a derived job id, because the contract's replay guard keys on `(agent_id, job_id)`.** `ReputationLedger.submit` checks `Rated(agent_id, job_id)` *before* it reads `kind`, and the settler has already auto-rated every step under that exact pair at settlement — so a dispute rating under the settled job id would be refused as a replay of the automatic one. The derivation is:

```
dispute_job_id(job_id, step) = job_id[:8] ‖ sha256(job_id ‖ "orizon-dispute:v1" ‖ step)[:8]
```

with the step packed as two big-endian bytes. Both halves do a job:

- **The second half carries the step**, so two upheld disputes against the same agent in the same job derive two different ids and produce two ratings, rather than one rating and a refusal. The first version of this derivation, chosen in the 4.01 spike, hashed the job alone and would have collided exactly there. It was replaced in [ADR 0009 D1](https://github.com/Bl0cksmiths/Orizon-Agents-BE-Stellar/blob/main/docs/decisions/0009-dispute-rating.md) **before a single rating had ever been written under it**, which is the only moment it could be replaced at no cost — the ledger's guard remembers every key it has seen, for ever, with no expiry and no admin override.
- **The first half is the sealed job's own bytes**, so a reviewer on Stellar Expert can tie the rating to the attested job **without reading our code**. The job id appears verbatim as an argument of `PaymentEscrow.charge`, of `AttestationRegistry.seal`, and of every automatic rating for that job. Open the dispute rating, read its `job_id` argument, open the workflow's seal, and the **first sixteen hex characters are the same**. Two unrelated 16-byte job ids share a prefix with probability 2⁻⁶⁴.

A reviewer who wants the other half — that the rating is for *this step*, not merely for this job — can recompute it:

```bash
python3 -c 'import hashlib,sys; j=bytes.fromhex(sys.argv[1]); s=int(sys.argv[2]); print((j[:8]+hashlib.sha256(j+b"orizon-dispute:v1"+s.to_bytes(2,"big")).digest()[:8]).hex())' <job_id_hex> <step_index>
```

For job `000102030405060708090a0b0c0d0e0f`, step `0`, that prints `00010203040506071e6388cbecdde018` — run on 2026-09-26 while writing this document, and the first golden vector in `tests/test_dispute_job_id.py`, which pins the derivation so it can never drift from what is already on the ledger.

**The replay guard is also the rating's idempotency.** Refunds need a durable mutex because the asset contract will execute a second transfer as readily as the first; ratings need none, because the ledger refuses a second rating under a key it has already seen, at simulation, before any transaction exists. So retrying a rating is always safe and retrying an unconfirmed refund never is. Upholding a `credited` dispute again re-attempts **the rating alone**.

**A rating that does not land never touches the refund.** The buyer keeps the credit, the dispute stays `credited`, and the record — not an exception — says what happened: `rating_tx` set or empty, and `rating_confirmed` true only once the ledger has vouched for it. A hash alone cannot prove the agent was rated, because a hash is recorded for a submission that timed out as well as for one that succeeded.

**Two honest limits.** The settler's earlier automatic rating for that step is never withdrawn — the ledger has no entrypoint that amends a rating — so a dispute is a second, separate record beside the first rather than a correction, and both count toward the score at the same weight. And cache invalidation after a rating reaches only the current process, which is enough at one worker but would leave a second worker serving the pre-dispute score for up to the 15-second read TTL (QA's D-066).

## The receipt the buyer reads

On the trace view of a settled workflow — `https://orizons.xyz/app/trace?task=<task_id>` — a receipt panel sits above the Trace and Artifact tabs. It shows what was charged, the payer, the charge and seal transactions, and the dispute window: open with a live countdown, or closed with the time it closed. Each step then shows its own state:

| step                                     | what the buyer is offered                                                                     |
| ---------------------------------------- | --------------------------------------------------------------------------------------------- |
| settled, window open, and you paid        | a **Dispute** button, with what an upheld dispute would credit                                 |
| already disputed                          | its status — "Under review", "Refund in progress", "Refunded", "Rejected"                      |
| nothing was charged for it                | the price struck through, and "Nothing was charged for this step, so there is nothing to dispute" |
| window closed, or you are not the payer   | no action of any kind, and **no disabled button**                                               |

The dispute form states the terms before the buyer commits, taken from the backend's own policy rather than hard-coded in the interface: the credited fraction, that the platform funds the credit and never claws it back from the agent, and that the platform decides the claim with no on-chain arbitration. Then the mandatory reason with its 500-character counter, then a note that the wallet will sign a message, which costs nothing and sends no transaction.

**The receipt updates itself.** While a dispute is unresolved it polls — every 30 s under review, every 5 s while a credit is being sent, not at all once final or while the tab is hidden — so during the evidence recording the receipt flips from "Under review" to "Refunded" with both Stellar Expert links **without a reload**, while the adjudicator upholds.

**Nothing reads as done until the chain says so**, and that is enforced in the type rather than by careful copy: each on-chain artifact is `confirmed`, `pending` or `none`, and only `confirmed` may look like success. The badge follows the confirmation, not the raw status — a dispute recorded `credited` whose transfer is not confirmed reads "Refund in progress", never a green "Refunded" above a sentence admitting it is unconfirmed. An older backend that cannot report confirmation reads as pending, never as success.

Hashes are painted **in full**, in monospace, wrapping. In a recording a link cannot be inspected, so the characters on screen are the only thing a reviewer can match against Stellar Expert; a truncated hash proves sixteen characters.

The panel is accessibility-checked (axe, 0 violations, including the open dialog) and readable at 360 px with both 64-character hashes whole and no horizontal scrolling. A status change is announced once through a polite live region, and a poll that changes nothing announces nothing.

The hardening pass [FE #76](https://github.com/Bl0cksmiths/Orizon-Agents-FE-Stellar/pull/76) removed the last places where this panel asserted more than it knew — copy that said a refund "is being sent" when none had been submitted, a caption reading "what you received" over an empty record, a terminal "Nothing on this workflow was charged" that a single failed re-read could make permanent, and a clock offset that rendered the window open after the server had stopped accepting disputes. Details are in [`04`](./04-money-path-safety.md).

## The live deployment, read 2026-09-26

All four readings below were taken directly against `https://orizon-agents-be-stellar.onrender.com` on 2026-09-26. Anyone can repeat them; the first request may take 30–60 s while the free-tier instance wakes.

### Network and contract ids — `GET /api/stellar/network`

```
network: testnet · rpc: https://soroban-testnet.stellar.org
passphrase: "Test SDF Network ; September 2015"
```

| Contract            | Id                                                         |
| ------------------- | ---------------------------------------------------------- |
| AgentRegistry       | `CAPHXWU53UZUZJGV7IAE57NNMH3YYB5MTWO6YA53KKMXSFVLOITBJ3GQ` |
| ReputationLedger    | `CDCSOBEVZUPQZV5GV4D6KYHZCLNGW2KXY74RUHSZ3EZUXF34DPW422ZT` |
| PaymentEscrow       | `CBJPTMAPMGODGZCZ2IMEQSRUX3WGUXNMKDTNN2KMJ3NFGYZ5OJ5525PI` |
| AttestationRegistry | `CBYUZKOET43UXTBXZUJIBBJW5ODGD2J2AZVVXCR3QONGOCAHOXQQHEGK` |
| Asset SAC           | `CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC` |

Unchanged since Week 2 — Epic 4 required no contract change, and the dispute rating is written through the ReputationLedger already deployed then.

**The configured asset is not USDC, and the interface says "USDC".** The endpoint reports `asset: "native"`, and that SAC is the **native XLM Stellar Asset Contract on testnet** — independently confirmed by deriving it from the asset (`Asset.native().contract_id(TESTNET)` returns exactly `CDLZFC3S…CYSC`). Every amount in the product — plan prices, charges, credits, the receipt's "0.1 USDC credited to your wallet" — is **labelled USDC while the deployment moves test XLM**. The label is wrong on the deployment today. Choosing and configuring the refund asset is one of the outstanding items below, and until it is decided the label and the asset should not be presented as agreeing.

### Ratings writer — `GET /readiness`

```json
{"status":"ready","llm":"ok","stellar":"configured","signer":"configured","pdax":"configured",
 "cold_start":{"routable":true,"lower_bound_bps":5677,"floor_bps":5500,"margin_bps":177},
 "ratings":{"writer":"scorer",
            "signer":"GDB4N25UYM3YNTTAWX7LSGI2P7OR62QZQXRNQWAGF5TFVENDKCTTCDHP",
            "scorer":"GDB4N25UYM3YNTTAWX7LSGI2P7OR62QZQXRNQWAGF5TFVENDKCTTCDHP"}}
```

`ratings.writer: scorer` means the deployment's signing key **is** the ReputationLedger's authorised Scorer, so a dispute rating it signs can land. That authorization is itself on-chain, from Week 2: [`216e1b5f…01f8`](https://stellar.expert/explorer/testnet/tx/216e1b5f6ade4d75ec671bcda27b462bfd373d041b1ba2150d76002ee8d201f8). This is the one live precondition for D3 that **holds**.

### The dispute routes — `GET /openapi.json`

All six routes are served:

| Method | Path                                  |
| ------ | ------------------------------------- |
| POST   | `/api/disputes/challenge`             |
| POST   | `/api/disputes`                       |
| GET    | `/api/disputes/{dispute_id}`          |
| POST   | `/api/disputes/{dispute_id}/uphold`   |
| POST   | `/api/disputes/{dispute_id}/reject`   |
| GET    | `/api/tasks/{task_id}/disputes`       |

**But the document declares no security scheme at all** — `components.securitySchemes` is absent, as is any top-level or per-operation `security`. The 4.07 hardening merge adds one. So the deployed build **predates backend `08efeda`** ([BE #75](https://github.com/Bl0cksmiths/Orizon-Agents-BE-Stellar/pull/75), merged 2026-09-25) and does not carry that pass's fixes — including the reproducible double-payment fix and the disclosure fix on the buyer's own words. The deployment is behind `main`, and it must be redeployed before refunds are switched on. Render does not auto-deploy from this organisation, so the deploy is a manual step.

### The refund switch — `POST /api/disputes/{dispute_id}/uphold`

With no credential:

```
HTTP 503
{"detail":"dispute_refunds_disabled",
 "error":{"code":"dispute_refunds_disabled","message":"dispute refunds disabled","request_id":"66a1c0ff44554c5e"}}
```

**Refunds are switched off on the deployment.** `DISPUTE_REFUNDS_ENABLED` ships `false` and has not been turned on, so the route refuses before it looks at the adjudicator key — the same answer a bogus key gets. This is QA's **D-051** ([BE #68](https://github.com/Bl0cksmiths/Orizon-Agents-BE-Stellar/issues/68)). It is a configuration state, not a defect in the code, and it is the correct default for a deployment whose money path has not yet been deliberately turned on.

## The evidence that exists, and what it is not

QA's roll-up — [`docs/uat/evidence/6.03-dispute-refund-rating.md`](https://github.com/Bl0cksmiths/Orizon-Agents-UAT-Stellar/blob/main/docs/uat/evidence/6.03-dispute-refund-rating.md), run 2026-09-26 — is the authority on what has and has not been produced. Its finding: **on the deployment no step can be disputed and nothing can be upheld, so no criterion that needs money to move can be proven there today.**

The closest real evidence comes from the **6.03f drill**. The real backend (`08efeda`) ran on this machine against real PostgreSQL 17.6 with the real trace page (`5105a8b`), against the 6.03e drill's **own** ReputationLedger on testnet and a **test asset named UATUSD**. One uphold through `POST /api/disputes/{id}/uphold` produced two real testnet transactions:

| artifact                   | transaction                                                                                                                                                                       | ledger  | re-read on Horizon                    |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ------------------------------------- |
| refund transfer            | [`a5baac43…01b8`](https://stellar.expert/explorer/testnet/tx/a5baac432b582787df0a632b3bc12916c51e12575a8f77bf267fd45b728701b8) | 4865810 | `successful: true`, 2026-09-25T16:10:37Z |
| `kind="dispute"` rating    | [`7138e4e3…7184`](https://stellar.expert/explorer/testnet/tx/7138e4e36e47f4f4404b2212aad5584d2f8fb941b387da76acae4c3b4cc07184) | 4865811 | `successful: true`, 2026-09-25T16:10:42Z |

Both hashes are copied from QA's file, and both were re-read on Horizon while assembling this document — `successful: true` at the ledgers she recorded. The drill also demonstrated the receipt reaching "Refunded" with both links in the **same open document**, with a marker set on `window` still present afterwards, so the page never reloaded.

**These transactions prove the code path. They are not Deliverable 3.** Three things about them are not the deliverable, and any one of them would be enough:

- **The asset is not USDC.** The transfer moved UATUSD, the drill's own test asset.
- **The ledger is not the platform's.** The rating went to the drill's ReputationLedger, not `CDCSOBEV…22ZT`, so it does not appear in the reputation the live planner routes on.
- **The service is not the deployment.** They were signed on a developer machine, not by `orizon-agents-be-stellar.onrender.com`. The source account on both transactions is `GA45ITAK…EGZ2` — not the deployment's signer `GDB4N25U…CDHP`, which anyone can confirm on Stellar Expert.

So D3 stays open until **one run on the deployment** produces both transactions, with the recording captured in that same session.

**Nothing else in the Week-3 test evidence is on-chain at all.** The frontend's 149 end-to-end tests run against a mocked backend with fixture hashes that exist on no ledger; both frontend PRs say so in their own bodies. They are test evidence, not SOW §6.1 evidence.

**QA's verdict on story 6.03 is no-go.** Of the card's eight criteria, one is blocked on the deployment and four fail in code (D-060, D-054, D-066, D-075 — the open dialog still asking for a signature at the window's close, a non-finite `MAX_REFUND_USDC` removing the cap, cross-process cache invalidation, and a rating-failure log line missing the amount). Seven distinct duplicate-payment paths were attacked against the card's minimum of four, and all seven hold at `08efeda`. Fifteen refund, dispute, adjudication and config suites were run against the current code: **587 passed, 1 skipped**, with nothing signed on any network. The full defect register is [`docs/uat/defects.md`](https://github.com/Bl0cksmiths/Orizon-Agents-UAT-Stellar/blob/main/docs/uat/defects.md); 25 of this week's 27 defects are filed as public GitHub issues, and two money-path defects (D-053, D-058) are held privately while the deployment cannot be patched.

## What is outstanding for D3

Concrete, in order, and none of it is development work on the dispute path:

1. **Make a charge land.** `PaymentEscrow.charge` cannot move the payer's funds, so no run settles and no dispute window ever opens — [contracts #3](https://github.com/Bl0cksmiths/Orizon-Agents-Smart-Contract-Stellar/issues/3) (D-039), surfacing as [BE #67](https://github.com/Bl0cksmiths/Orizon-Agents-BE-Stellar/issues/67) (D-050). This is the one true prerequisite: without it there is nothing to dispute, whoever drives the run.
2. **Deploy the current `main`** (backend `08efeda` or later). `GET /openapi.json` will show a security scheme once it has. This carries the hardening pass's money-path and disclosure fixes.
3. **Set `API_KEY`** in the Render dashboard — at least **8 printable ASCII characters, no surrounding whitespace**. The boot validator refuses anything else, by name, rather than booting clean and then answering 401 to the operator's own key: below 8 characters the log redaction filter will not mask the value, so a shorter key prints itself into any log line that quotes it.
4. **Set `DISPUTE_REFUNDS_ENABLED=true`** in the same pass. Setting it without `API_KEY` makes the process refuse to start, deliberately, so the two go together.
5. **Confirm `DATABASE_URL` is set.** Without it the dispute store falls back to memory and the whole 24-hour window becomes a promise that ends at the next restart — which a free-tier instance performs whenever it idles. No endpoint reports it, so it is checked in the dashboard.
6. **Confirm `MAX_REFUND_USDC` is unset or a finite positive number** (D-054): a non-finite value silently removes the refund cap.
7. **Decide the refund asset.** The deployment is configured with the native XLM SAC while every amount in the interface is labelled USDC. Either configure a USDC SAC or correct the label; do not capture D3 evidence while the two disagree.
8. **Capture one live session on the deployment:** a settled run, a dispute raised by the paying wallet, an uphold through `POST /api/disputes/{dispute_id}/uphold` — the API rather than the operator script, so the running service's cached score is invalidated (D-066) — producing the refund transaction and the `kind="dispute"` rating transaction, with the screen recording running continuously from before the dispute is raised until the receipt flips to "Refunded" with both Stellar Expert links. The checklist is [`docs/uat/checklists/6.03f-phone-and-screen-reader.md`](https://github.com/Bl0cksmiths/Orizon-Agents-UAT-Stellar/blob/main/docs/uat/checklists/6.03f-phone-and-screen-reader.md).

That session is what turns the table at the top of this document from "not captured" to a pair of hashes. Nothing about it requires writing more of D3.

## Verify live

| What                          | URL                                                                            |
| ----------------------------- | ------------------------------------------------------------------------------ |
| Network + contract ids        | https://orizon-agents-be-stellar.onrender.com/api/stellar/network               |
| Ratings writer + cold start   | https://orizon-agents-be-stellar.onrender.com/readiness                         |
| The six dispute routes        | https://orizon-agents-be-stellar.onrender.com/openapi.json                      |
| The refund switch, today      | `curl -X POST https://orizon-agents-be-stellar.onrender.com/api/disputes/x/uphold` → `503 dispute_refunds_disabled` |
| The trace / receipt view      | `https://orizons.xyz/app/trace?task=<task_id>` — no settled run to show yet      |
| Buyer- and operator-facing docs | [`docs/disputes.md`](https://github.com/Bl0cksmiths/Orizon-Agents-BE-Stellar/blob/main/docs/disputes.md) |
| Design records                | [ADR 0002](https://github.com/Bl0cksmiths/Orizon-Agents-BE-Stellar/blob/main/docs/decisions/0002-partial-credit-refund.md) · [ADR 0007](https://github.com/Bl0cksmiths/Orizon-Agents-BE-Stellar/blob/main/docs/decisions/0007-dispute-window.md) · [ADR 0008](https://github.com/Bl0cksmiths/Orizon-Agents-BE-Stellar/blob/main/docs/decisions/0008-refund-execution.md) · [ADR 0009](https://github.com/Bl0cksmiths/Orizon-Agents-BE-Stellar/blob/main/docs/decisions/0009-dispute-rating.md) |
| Independent QA evidence       | [6.03 roll-up](https://github.com/Bl0cksmiths/Orizon-Agents-UAT-Stellar/blob/main/docs/uat/evidence/6.03-dispute-refund-rating.md) · [6.03a](https://github.com/Bl0cksmiths/Orizon-Agents-UAT-Stellar/blob/main/docs/uat/evidence/6.03a-dispute-path.md) · [6.03f](https://github.com/Bl0cksmiths/Orizon-Agents-UAT-Stellar/blob/main/docs/uat/evidence/6.03f-dispute-ui.md) |
