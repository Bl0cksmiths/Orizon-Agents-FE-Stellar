# Demo recording: shot list

This is the operational checklist for recording the 5.04 demo ([BLO-38](https://linear.app/bl0cksmiths/issue/BLO-38)). The scenes, the narration and the rules for cutting are in [`script.md`](./script.md). This file covers the session itself: what must be true before you press record, whose wallet is where, which tabs are open, what to capture, when to retake, and how the video is cut, captioned and published.

**Stellar testnet only.** Nothing in this session touches mainnet, and no mainnet account may be visible on screen at any point.

## 1. Pre-flight

### GO / NO-GO

Run the backend's demo pre-flight from the backend repo root (`scripts/demo_preflight`; every flag is in the backend's `docs/operators/demo-recording.md`). Run it the morning of the session and again right before the camera rolls: the second run is also the warm-up.

```bash
source .venv/bin/activate
python -m scripts.demo_preflight \
    --buyer "$BUYER_PUBLIC_KEY" --operator "$OPERATOR_PUBLIC_KEY" --cap 0.5 \
    --with-decompose "the intent the video types" \
    --out-dir docs/evidence/5.04/preflight
```

It exits 0 only on GO. Exit 4 is a failed check and exit 5 a check it could not run; neither is a GO.

The pre-flight answers **GO** or **NO-GO**. **Record only on GO.** A NO-GO is not something to work around on camera: fix the item it names, or move the session. It must cover every row of [What must be deployed before recording](./script.md#what-must-be-deployed-before-recording), at minimum:

- [ ] Testnet confirmed three ways: the API's `/api/stellar/network`, RPC `getNetwork` and Horizon all read `Test SDF Network ; September 2015`.
- [ ] Escrow v2: the API names the v2 id, `version()` returns 2, and `settler()` is the deployment signer.
- [ ] The backend is `feat/5.02-integration` or later: `/api/ecosystem/adoption`, `/api/agents/{id}/readiness` and the dispute read-grant routes are all served.
- [ ] Refunds are on: `/readiness` reads `disputes.reconcile.enabled: true` and `disputes.store: "postgres"`. An uphold without a key proves nothing here: it answers 401 whether refunds are on or off.
- [ ] `/readiness` reads `ratings.writer: scorer`, and `cold_start.routable: true` (`lower_bound_bps` 5677 against `floor_bps` 5500).
- [ ] Every page the recording visits answers: `/`, `/app/register`, `/app/bind`, `/app/operator`, `/app/orchestrator`, `/app/agents`, `/app/ecosystem` and `/guide/list-your-agent`. So do the pages the S12 card names: `/evidence`, `/demo` and `/litepaper`.
- [ ] The wallet balances cover the session with room for one full retake: the buyer covers the cap plus fees and reserve, the operator covers the registration fee, and the settler covers settle, seal, ratings, refund and dispute rating.
- [ ] The faulty test agent reads `lower_bound_bps` ≤ 5489 (5443 expected), `source: onchain`, not stale, and is bound and listed.
- [ ] At least 3 routable agents clear the floor, so the S05 agent is **excluded** and not "kept below floor".
- [ ] The operator's reference agent answers `GET /` with `"ok": true` and no `fault_injection`.
- [ ] Optionally, with `--with-decompose`: one decompose of the rehearsed intent shows the floor applied, one `excluded` notice with no `awaiting_fresh_read`, and no planner fallback. This is the pre-flight's only write: a single LLM call that signs nothing.

### Rehearsal (the day before)

- [ ] Register a **rehearsal** agent from the operator wallet, with the **same skills and price** the on-camera agent will use, and bind it. Decompose the rehearsed buyer intent until the plan routes to it at least 3 times out of 3. Then **delist it** ("⚙ manage" → "Confirm delist" on `/app/agents`), so it cannot compete with the on-camera agent. A delisted agent gets no notice on the plan card.
- [ ] Do one full dry run of the buyer path against the rehearsal agent. Read the step's delivered output, and **write the dispute reason for S08 from it**: one or two sentences that are true of what that step actually delivered for this intent. If nothing about the output is genuinely wrong, change the intent or the agent until something honest can be said. Never dispute work you would accept.
- [ ] Make the faulty test agent and its three real runs ([procedure](./script.md#how-the-below-floor-agent-is-made-honestly)). Write **no** further rating against it after that.

### The recording machine

- [ ] **A dedicated browser profile for each window**: "Orizon demo · operator" and "Orizon demo · buyer". Never use a personal profile. Each profile has no history, no saved logins, and no autofill suggestions that could pop up over a field.
- [ ] **Capture at 1920×1080**, at 30 or 60 fps, with OBS (or similar). Record the browser window, not the whole desktop. The browser window is maximised at 1920×1080 on a display set to 100% OS scaling.
- [ ] **Browser zoom 125%** in both profiles, set per site for `orizons.xyz` and `stellar.expert`. The plan card's floor figures and the receipt's hashes are 10–11 px text at 100%. Before recording, check that at 125% the 64-character hashes on the receipt still show **whole**, wrapped and never truncated.
- [ ] **Hide the bookmarks bar** (Ctrl+Shift+B), use an empty new-tab page, and use the default theme.
- [ ] **Extensions: Freighter only**, pinned to the toolbar. Remove or disable every other extension in these profiles (password managers, ad blockers, grammar tools), because each can inject UI or show a badge.
- [ ] **Freighter on testnet, with exactly one account in each profile.** The operator profile holds only the operator account and the buyer profile only the buyer account. **No mainnet account is imported into either profile**, so no account switcher can ever show one. Open Freighter once before recording and confirm the network pill reads Testnet.
- [ ] **Notifications off.** Turn on OS Do Not Disturb or Focus, quit chat apps and mail, and silence the phone.
- [ ] **Cursor highlight on**, for example PowerToys Mouse Highlighter or OBS cursor emphasis: a soft ring for clicks. Nothing flashy.
- [ ] **Microphone.** The narration is recorded **as a separate voice-over** from `narration.txt`, after the screen capture, in a quiet room with a headset or USB mic. Peaks sit around −12 dBFS, there is 10 s of room tone at the start for noise reduction, and each scene is its own take. The screen session itself is recorded without a mic.
- [ ] **Terminal** for S08: a large font (≥ 18 pt), a dark theme, the prompt shortened to `$ `, and the backend repo as the working directory. `HISTCONTROL=ignorespace` is set, and `ORIZON_API_KEY` is loaded from a file **off camera**. The key's value is never typed, echoed or shown.

## 2. Wallets

Four roles and four different accounts. No account plays two roles on camera, because the ecosystem counts and the payout proofs both depend on the payer, the payee and the platform being distinguishable.

| Role                                                         | Who holds it                                                                                                                                   | Used in                              | Rules                                                                                                                                                                                                                                                                                               |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Operator**                                                 | **Preferred: the external operator from 5.02**, in their own Freighter on their own machine. **Fallback: a team wallet**, disclosed on camera. | S02, S03, S07, S09 (operator window) | Funded from Friendbot. Holds **no** other agent that could compete for the S04 intent (the rehearsal agent is delisted). If it is a team wallet: use S02's disclosure narration, add the wallet to `team_wallets.json`, and do not present the registration as the §6.1 D1 "externally owned" hash. |
| **Buyer**                                                    | A team wallet                                                                                                                                  | S04–S09 (buyer window)               | Not the operator, the settler, or the faulty agent's owner. It is named in `team_wallets.json`, so its settlement shows as "team-funded". Funded for the cap, fees and reserve, with room for a retake.                                                                                             |
| **Faulty agent owner**                                       | A third team wallet                                                                                                                            | before the session only              | Owns only the faulty test agent, is named in `team_wallets.json`, and is never on camera.                                                                                                                                                                                                           |
| **Platform (settler, scorer, sealer, dispute-credit payer)** | The deployment signer `GDB4N25…CDHP`, and escrow v2's settler once it is deployed                                                              | server-side, in S07–S09              | Funded for settle, seal, ratings, refund and dispute rating. It never appears in a browser.                                                                                                                                                                                                         |
| **Adjudicator**                                              | The team, holding the deployment's `API_KEY`                                                                                                   | S08 (terminal)                       | The key lives in an environment variable. It is never on screen.                                                                                                                                                                                                                                    |

### If the operator is external

- [ ] **Written consent before the session.** The external operator agrees that their on-camera agent will be disputed and will carry a **permanent** 10/100 `dispute` rating on the testnet ReputationLedger. The ledger has no entrypoint to amend a rating. Keep the consent (an email or message) with the evidence sheet. **If they decline, use a team operator wallet** and disclose it.
- [ ] **Their key never touches a team machine.** They record the operator window on their own machine, with the same capture settings (§1: an OBS profile file is sent in advance), while on a call with the team so the scenes happen in order. The two recordings are intercut in post. The events on screen stay in their real order, and each window's clock is visible in at least one frame for syncing.
- [ ] They use a fresh browser profile set up as in §1, with Freighter holding only their operator account on testnet.

## 3. Tabs, pre-opened in order

Open the tabs left to right, in the order the script visits them. Each wallet is connected in its own window before recording starts. The explorer tabs are **not** pre-opened: each one opens from its "view on stellar.expert ▸" link during its scene, because a link opened live is the proof that the hash on screen is the hash on the explorer.

**Operator window** (profile "Orizon demo · operator", Freighter connected):

1. `https://orizons.xyz/app/register`: the form is empty and the wallet chip shows "owner · G…".
2. `https://orizons.xyz/app/operator` (My Agents): **reload it just before S07**.

In-scene: S02's link opens the registration tx; S03 navigates to `/app/bind` and then `/app/agents` in tab 1; S07's settlement entry opens `<settle_tx>`.

**Buyer window** (profile "Orizon demo · buyer", Freighter connected):

1. `https://orizons.xyz/app/orchestrator`: the intent box is empty, and the rehearsed intent is on a card beside the monitor, **not** in the clipboard history.
2. `https://orizons.xyz/app/ecosystem`
3. `https://orizons.xyz/guide/list-your-agent`, scrolled to **Trust boundaries** (for S11).
4. `https://orizons.xyz/`, the marketing hero, whose `orizon.flow` panel prices its steps in USDC (for S11's cutaway).

In-scene: S06's link opens `<authorize_tx>`; the console moves itself to `/app/trace?task=…`; S09's links open `<refund_tx>` and `<dispute_rating_tx>`.

**Terminal** (S08): the backend repo, with `API=https://orizons.xyz` and `DISPUTE_ID` exported. Read `DISPUTE_ID` off camera, right after S08's "Your dispute was raised.", from `curl -s "$API/api/tasks/$TASK_ID/disputes" | jq -r '.disputes[0].id'`.

**Off-screen reference** (a second monitor, never captured): `GET /api/stellar/reputation/<faulty_id>`, the pre-flight output, and this checklist.

## 4. Timing on the day

Render's free tier sleeps a service after about 15 minutes idle, and wakes it in 30–60 s. Dispatch to an external agent has a **5 s connect timeout**. So a sleeping operator agent **fails its step, is rated 20/100 on camera, and is not paid**. Warm-up is therefore part of the session, not an afterthought.

| When            | Do                                                                                                                                                                                                                                                                        |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T−60 min        | Run the full pre-flight. On NO-GO, stop.                                                                                                                                                                                                                                  |
| T−60 min onward | **No activity against the faulty agent**, so it gets no rating and there is no `awaiting_fresh_read` (script: [cases that must not appear](./script.md#cases-that-must-not-appear-on-camera)).                                                                            |
| T−15 min        | Set up the machine (§1), open the tabs (§3), and connect both wallets.                                                                                                                                                                                                    |
| T−5 min         | **Warm everything.** Poll `GET https://orizons.xyz/api/health` until it answers, then open `/readiness`. Hit the operator agent's endpoint with `curl -sS <endpoint>/`. Load every tab once. Re-run the pre-flight (without `--with-decompose` if one already ran today). |
| T−0             | Record S01–S03 (operator), then S04–S09 (buyer, with operator cutaways) **in one continuous session**. S10–S12 can be recorded straight after.                                                                                                                            |
| Before S06      | If more than 10 minutes have passed since the warm-up, curl the operator agent's endpoint again **off camera** before clicking Authorize.                                                                                                                                 |
| After S09       | Stop the capture. Copy the evidence (§5) **before** closing any tab.                                                                                                                                                                                                      |

S01, S11 and S12 are mostly cards and a static guide page, so they can be captured at any time. S10 is filmed after S09, so the Ecosystem page includes this session's settlement if the operator is external.

## 5. Evidence capture

Every hash in the video description comes from this session, is copied **in full** from where the UI shows it, and is re-read on Horizon as `successful: true` before it is published. A truncated hash (`tx abcdef1234…` in the trace log) is never evidence on its own: find the full hash at the source named below.

### Where each hash comes from

| Placeholder              | Scene   | Transaction                                                                          | Copy the full hash from                                                                                                                                   |
| ------------------------ | ------- | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `<register_tx>`          | S02     | `AgentRegistry.register`, signed by the operator                                     | The register success card's **⧉ copy evidence** (agent id, wallet, hash and both explorer links)                                                          |
| `<authorize_tx>`         | S06     | PaymentEscrow v2 `authorize`, signed by the buyer                                    | The plan card's "✓ transaction confirmed" hash                                                                                                            |
| `<settle_tx>`            | S07     | PaymentEscrow v2 `settle`: the operator's payout and the remainder back to the buyer | The receipt's `charge` row, or the operator's settlement entry. They are the same hash; check that they match.                                            |
| `<seal_tx>`              | S07     | `AttestationRegistry.seal`                                                           | The receipt's `seal` row                                                                                                                                  |
| `<rating_tx_1>`          | S07     | ReputationLedger `submit`: the operator's agent's automatic rating                   | The ReputationLedger's latest `rated` event for the agent on Stellar Expert (`/contract/CDCSOBEV…422ZT`), matched to the trace line's first 10 characters |
| `<refund_tx>`            | S08/S09 | SAC `transfer`, settler → buyer (the credit)                                         | The uphold JSON's `refund_tx`, which must equal the receipt's "Refund transfer"                                                                           |
| `<dispute_rating_tx>`    | S08/S09 | ReputationLedger `submit`, `kind="dispute"`, 10/100                                  | The uphold JSON's `rating_tx`, which must equal the receipt's "Dispute rating against …"                                                                  |
| `<fault_rating_tx_1..3>` | S05     | ReputationLedger `submit`, 20/100, for the faulty agent                              | Each fault run's `docs/evidence/5.04/fault-run-N/lifecycle.md` (the `rating` rows)                                                                        |

### The files

- **The lifecycle harness evidence** (backend repo, [`docs/operators/lifecycle-harness.md`](https://github.com/Bl0cksmiths/Orizon-Agents-BE-Stellar/blob/main/docs/operators/lifecycle-harness.md)). The faulty agent's three runs are harness runs, so their `lifecycle.jsonl` and `lifecycle.md` are the evidence for S05: every row has its hash, its explorer link, and the `onchain_status` RPC or Horizon answered. **Never commit or publish their `state.json`**: it holds a task read token.
- **The evidence sheet**, generated by the backend's `scripts/demo_evidence` from every take's harness evidence, which re-verifies each hash and keeps only confirmed ones in `evidence.json` for the `/demo` page: `python -m scripts.demo_evidence docs/evidence/5.04/take-1 docs/evidence/5.04/take-2 --title "Orizon Agents — Blue Belt demo (Stellar testnet)" --out-dir docs/evidence/5.04/video`. Beside it, record one row per hash above, with the scene, what it proves, the full hash, the Stellar Expert URL (`https://stellar.expert/explorer/testnet/tx/<hash>`), the source account, the ledger, the UTC time, and Horizon's `successful`. Add the external operator's written consent, the faulty agent's id, owner wallet and evidence directories, and the published video URL.

### Verify before publishing

- [ ] Re-read every hash on Horizon testnet: `curl -s https://horizon-testnet.stellar.org/transactions/<hash> | jq '{successful, ledger, created_at, source_account}'`.
- [ ] Run `python scripts/verify_registration.py` on `<register_tx>` (the 1.07 verifier; see its `--help`).
- [ ] Run `python scripts/verify_external_settlement.py --agent <id> --owner <operator G…> --tx <settle_tx> --api-base https://orizons.xyz/api --network testnet`. It reports the asset from the ledger, so on testnet it says XLM.
- [ ] Open the dispute rating on Stellar Expert. Check that the first 16 hex characters of its `job_id` equal the first 16 of the seal's `job_id`, and that `kind` is `dispute` with rating `10`.
- [ ] Check that every hash visible in the final cut is character-for-character the one in the description. Scrub the export and compare.

## 6. Retake rules

A retake replaces a whole scene, or a run of scenes from a named restart point. It is never a splice inside one. Everything signed in a failed take is real, and stays on-chain and in the evidence sheet as a failed take. It is simply not the take shown.

| What went wrong                                                                                                           | Restart from                               | Notes                                                                                                                                                                                                                                   |
| ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A slip before any wallet prompt (a typo, a misclick, a stumble in the narration)                                          | The same scene                             | Nothing was signed. Narration is recorded separately anyway.                                                                                                                                                                            |
| S02 after the registration confirmed                                                                                      | **S02, with a new agent id**               | The id is permanently taken on-chain. Keep a list of ids ready (`<handle>_demo1`, `_demo2`, …), all with the rehearsed skills and price. The abandoned agent is delisted afterwards, so it cannot compete for the intent.               |
| S03's bind was rejected or expired                                                                                        | S03                                        | Binding is a message signature, so there is no on-chain cost. "Signing cancelled — nothing was bound." is fine to retry.                                                                                                                |
| S04: the plan misses the operator's agent, or shows the planner fallback, "unverified", "relaxed", or the escrow mismatch | S04                                        | Decompose signs nothing. Re-decompose the same intent. After 3 misses, stop and re-rehearse the intent.                                                                                                                                 |
| S05: "held off … fresh reputation read", "kept below floor", "no endpoint" on the faulty agent, or `lower bound 2.75`     | S04                                        | See the script's [cases that must not appear](./script.md#cases-that-must-not-appear-on-camera). Wait 60 s and re-check the agent's reputation before retrying.                                                                         |
| S06: the wallet was rejected, or the authorize failed before confirming                                                   | S06                                        | Nothing moved. If it **confirmed** and the run then failed to start, the funds are in escrow: the plan card shows where they are and how to reclaim them. Reclaim after expiry, off camera, and restart from **S04** with a fresh plan. |
| S07: the operator's step failed (a cold endpoint gives `response_timeout` or a connect failure)                           | **S02** (a new agent)                      | The on-camera agent now carries a real 20/100, so it would no longer be a clean cold start. Warm the endpoint and start the operator segment again.                                                                                     |
| S07: settlement failed or is unconfirmed ("✕ settlement failed", "◷ settlement unconfirmed")                              | Stop                                       | This is a finding, not a retake. Record it, and do not publish until it is understood.                                                                                                                                                  |
| S08: the dispute signature was rejected                                                                                   | S08                                        | "You cancelled the signature. Nothing was sent." Sign again.                                                                                                                                                                            |
| S08/S09: the uphold returned an error, timed out, or reads `crediting` without a confirmed transfer                       | **Stop. Never re-run the uphold blindly.** | A timed-out credit may still land, and a second uphold of a `crediting` dispute is refused by design. Check the in-flight hash on Stellar Expert first. A retake of the dispute needs a **new settled run**: restart from S04.          |
| The narration overruns its scene                                                                                          | Re-record that scene's voice-over          | Trim the words, never the footage of a transaction.                                                                                                                                                                                     |

**Keep every take's hashes.** A failed take's registration, authorization or rating is real testnet activity. It goes in the evidence sheet marked "retake, not shown", so no hash on-chain is left unexplained.

## 7. Post-production

- [ ] **Cuts with markers only.** Follow the script's [cut rules](./script.md#cut-rules): every cut carries a `⏩ N s cut: reason` marker on screen for at least 1.5 s. There is no speed-up, no speed ramp, and no frame blending anywhere. The only other edits are dissolves between scenes.
- [ ] **Overlays:** the `Stellar testnet` corner tag, the `D1`–`D4` scene tag, the `OPERATOR` / `BUYER` window labels, the "Adjudicator: the Orizon team" lower third (S08), and the four limitation cards (S11). An optional zoom-in (a crop and scale of the real frame) on S05's exclusion row and on the full hashes, so they can be read on a phone.
- [ ] **Never alter UI pixels.** No blurring or covering anything except, if it ever appears by accident, a secret or a personal detail. If a secret was captured, **rotate it**; blurring it is not enough.
- [ ] **Voice-over** from `narration.txt`, one take per scene, laid over its scene. If a scene's voice runs long, re-record it shorter. Do not stretch or compress the audio or the video to fit.
- [ ] **Captions (WebVTT).** Make `captions.en.vtt` from `narration.txt` and the final timeline, with one or more cues per scene. Each cue is at most 2 lines of about 42 characters, on screen for 1–6 s. The words are exactly the narration, and the timings are taken from the edited voice-over. Check them by playing the export with the captions on. Upload the file to YouTube as English captions: not auto-generated, and not burned in.
- [ ] **Chapters with timestamps.** YouTube needs the first chapter at `0:00`, at least 3 chapters, and each chapter at least 10 s long. Start from these and adjust them to the final cut:

  ```text
  0:00 Orizon on Stellar testnet
  0:14 D1 · The operator registers an agent
  0:42 D1 · Bind an endpoint, listed
  1:00 D2 · On-chain reputation on the plan card
  1:20 D2 · A below-floor agent is excluded
  1:49 The buyer authorizes into escrow
  2:05 Settlement: the operator is paid
  2:35 D3 · Disputing a step
  3:05 D3 · The credit lands, the score falls
  3:27 D4 · Ecosystem and the integration guide
  3:42 Limitations
  4:05 Verify it yourself
  ```

  If a scene's final length drops under 10 s, merge its chapter into the one before it.

- [ ] **Duration check: 180–300 s.** Run `ffprobe -v error -show_entries format=duration -of csv=p=0 orizon-demo.mp4`. The result must be between **180 and 300**. The script's target is 255 s and its hard cap is 290 s. Also check the duration on the published page, which is what the acceptance criterion reads.
- [ ] **Export:** 1920×1080 MP4 (H.264, AAC), at the capture's frame rate. Keep the project file and the raw captures until the story is accepted.

## 8. Upload

**YouTube, visibility Public.**

- **It plays with no account.** A public, non-age-restricted YouTube video plays for a signed-out visitor, in any browser, on a phone, without an app. That is the story's "publicly viewable with no login".
- **Why Public rather than Unlisted.** An unlisted video plays for anyone **who has the link**. But it cannot be found by search or from the channel page, and it is not listed anywhere. The SOW lists "3–5 min demo video published" as a success metric, and a reviewer arriving from the SOW, the X post or the Blocksmiths channel has to be able to find it without being sent a URL. A link that gets lost in a thread should not make the evidence disappear. Public also means the Chapter Lead can check it from any device, with no forwarding needed.
- **Settings that would break "no login":**
  - **Age restriction: none.** An age-restricted video demands sign-in.
  - **Audience: "No, it's not made for kids."**
  - **Embedding allowed**, so the evidence bundle can embed it.
  - **Not a Premiere** or a scheduled release. Publish it immediately, so the URL plays the moment it is shared.
- **Check:** open the URL in a private window **signed out**, and on a phone with no YouTube app signed in, then press play. Record that check (the date and "played signed-out") in the evidence sheet.
- Title: `Orizon Agents on Stellar testnet: register, route, pay, dispute (Blue Belt demo)`.

## 9. The video description

Paste this, with every placeholder filled from §5. **Every hash is printed in full with its Stellar Expert link.** The limitations are repeated here word for word from the video.

```text
Orizon Agents: the Blue Belt sprint demo, on Stellar TESTNET only.
An operator registers an agent from their wallet, binds its endpoint, gets routed
and gets paid; a buyer routes work on on-chain reputation (with a below-floor
agent excluded), pays through escrow, disputes a step, and is credited while the
agent's score falls. Every transaction below is real and resolves on Stellar
Expert (testnet). Cuts are marked on screen; nothing is sped up.

Disclosures
- The operator wallet is <the external operator's G… | our team's wallet G…>.
- The buyer wallet (G…) and the adjudicator are the Orizon team. We raised the
  dispute for this demo, and our team upheld it.
- The excluded agent, "<faulty agent name>" (<faulty_id>, owner G…), is a
  deliberately faulty test agent we run (FAULT_MODE=hang_after:0). It failed
  three real, wallet-authorized runs, each rated 20/100 on-chain by the platform
  scorer:
  <fault_rating_tx_1> https://stellar.expert/explorer/testnet/tx/<fault_rating_tx_1>
  <fault_rating_tx_2> https://stellar.expert/explorer/testnet/tx/<fault_rating_tx_2>
  <fault_rating_tx_3> https://stellar.expert/explorer/testnet/tx/<fault_rating_tx_3>

Chapters
<the chapter list from post-production>

Transactions shown (Stellar testnet)
D1 register (operator)     <register_tx>
  https://stellar.expert/explorer/testnet/tx/<register_tx>
D2 authorize into escrow   <authorize_tx>
  https://stellar.expert/explorer/testnet/tx/<authorize_tx>
D1/D4 settle (operator paid) <settle_tx>
  https://stellar.expert/explorer/testnet/tx/<settle_tx>
D4 attestation seal        <seal_tx>
  https://stellar.expert/explorer/testnet/tx/<seal_tx>
Operator agent rated       <rating_tx_1>
  https://stellar.expert/explorer/testnet/tx/<rating_tx_1>
D3 refund (credit)         <refund_tx>
  https://stellar.expert/explorer/testnet/tx/<refund_tx>
D3 dispute rating (10/100) <dispute_rating_tx>
  https://stellar.expert/explorer/testnet/tx/<dispute_rating_tx>

External registrations and settlements (D4), from the evidence sheet
<each external registration tx and each external settlement tx, with its link>

Contracts (testnet)
AgentRegistry        CAPHXWU53UZUZJGV7IAE57NNMH3YYB5MTWO6YA53KKMXSFVLOITBJ3GQ
ReputationLedger     CDCSOBEVZUPQZV5GV4D6KYHZCLNGW2KXY74RUHSZ3EZUXF34DPW422ZT
PaymentEscrow v2     <escrow v2 id> (v1 CBJPTMAPMGODGZCZ2IMEQSRUX3WGUXNMKDTNN2KMJ3NFGYZ5OJ5525PI kept as history)
AttestationRegistry  CBYUZKOET43UXTBXZUJIBBJW5ODGD2J2AZVVXCR3QONGOCAHOXQQHEGK

Limitations (as stated in the video)
- This is testnet only, and it settles native test XLM while the marketing copy names USDC.
- The platform funds every dispute credit and decides every dispute.
- Endpoint binding is off-chain: the platform stores the URL you signed.
- One platform signing key is the settler, scorer and sealer, and it pays dispute credits.
Also: escrow v2 is a new contract id beside the four published in SOW §6.1;
there is no on-chain arbitration and no appeal; a dispute rating is added beside
the step's automatic rating and does not replace it; the free-tier backend
cold-starts in 30-60 s.

Verify it yourself
Guide:     https://orizons.xyz/guide/list-your-agent
Ecosystem: https://orizons.xyz/app/ecosystem
Evidence:  https://orizons.xyz/evidence
Demo:      https://orizons.xyz/demo
Litepaper: https://orizons.xyz/litepaper
Code (MIT):
  https://github.com/Bl0cksmiths/Orizon-Agents-FE-Stellar
  https://github.com/Bl0cksmiths/Orizon-Agents-BE-Stellar
  https://github.com/Bl0cksmiths/Orizon-Agents-Smart-Contract-Stellar
  https://github.com/Bl0cksmiths/Orizon-Agents-Example-Agent-Stellar
```
