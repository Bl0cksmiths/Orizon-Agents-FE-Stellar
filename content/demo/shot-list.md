# Demo recording: shot list

This is the operational checklist for recording the 5.04 demo ([BLO-38](https://linear.app/bl0cksmiths/issue/BLO-38)). The scenes, the narration and the rules for cutting are in [`script.md`](./script.md). This file covers the session itself: what must be true before you press record, whose wallet is where, which tabs are open, what to capture, when to retake, and how the video is cut, captioned and published.

**Stellar testnet only.** Nothing in this session touches mainnet, and no mainnet account may be visible on screen at any point.

## 1. Pre-flight

### GO / NO-GO

Run the backend's demo pre-flight from the backend repo root. It is being built by another 5.04 lane in `scripts/demo_preflight`; read its `--help` for the current flags.

```bash
source .venv/bin/activate
python -m scripts.demo_preflight
```

The pre-flight answers **GO** or **NO-GO**. **Record only on GO.** A NO-GO is not something to work around on camera: fix the item it names, or move the session. It must cover every row of [What must be deployed before recording](./script.md#what-must-be-deployed-before-recording), at minimum:

- [ ] Testnet confirmed three ways: the API's `/api/stellar/network`, RPC `getNetwork` and Horizon all read `Test SDF Network ; September 2015`.
- [ ] Escrow v2: the API names the v2 id, `version()` returns 2, and `settler()` is the deployment signer.
- [ ] The backend is `feat/5.02-integration` or later: `/api/ecosystem/adoption`, `/api/agents/{id}/readiness` and the dispute read-grant routes are all served.
- [ ] Refunds are on: `uphold` without a key answers 401, not `503 dispute_refunds_disabled`.
- [ ] `/readiness` reads `ratings.writer: scorer`, and `cold_start.routable: true` (`lower_bound_bps` 5677 against `floor_bps` 5500).
- [ ] Every page the recording visits answers: `/app/register`, `/app/bind`, `/app/operator`, `/app/orchestrator`, `/app/agents`, `/app/ecosystem` and `/guide/list-your-agent`.
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

| Role                                   | Who holds it                                                                                                                                   | Used in                              | Rules                                                                                                                                                                                                                                                                                               |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Operator**                           | **Preferred: the external operator from 5.02**, in their own Freighter on their own machine. **Fallback: a team wallet**, disclosed on camera. | S02, S03, S07, S09 (operator window) | Funded from Friendbot. Holds **no** other agent that could compete for the S04 intent (the rehearsal agent is delisted). If it is a team wallet: use S02's disclosure narration, add the wallet to `team_wallets.json`, and do not present the registration as the §6.1 D1 "externally owned" hash. |
| **Buyer**                              | A team wallet                                                                                                                                  | S04–S09 (buyer window)               | Not the operator, the settler, or the faulty agent's owner. It is named in `team_wallets.json`, so its settlement shows as "team-funded". Funded for the cap, fees and reserve, with room for a retake.                                                                                             |
| **Faulty agent owner**                 | A third team wallet                                                                                                                            | before the session only              | Owns only the faulty test agent, is named in `team_wallets.json`, and is never on camera.                                                                                                                                                                                                           |
| **Platform (settler, scorer, sealer)** | The deployment signer `GDB4N25…CDHP`                                                                                                           | server-side, in S07–S09              | Funded for settle, seal, ratings, refund and dispute rating. It never appears in a browser.                                                                                                                                                                                                         |
| **Adjudicator**                        | The team, holding the deployment's `API_KEY`                                                                                                   | S08 (terminal)                       | The key lives in an environment variable. It is never on screen.                                                                                                                                                                                                                                    |

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
- **The evidence sheet** (being built by another 5.04 lane). Add one row per hash above, with the scene, what it proves, the full hash, the Stellar Expert URL (`https://stellar.expert/explorer/testnet/tx/<hash>`), the source account, the ledger, the UTC time, and Horizon's `successful`. Add the external operator's written consent, the faulty agent's id, owner wallet and evidence directories, and the published video URL.

### Verify before publishing

- [ ] Re-read every hash on Horizon testnet: `curl -s https://horizon-testnet.stellar.org/transactions/<hash> | jq '{successful, ledger, created_at, source_account}'`.
- [ ] Run `python scripts/verify_registration.py` on `<register_tx>` (the 1.07 verifier; see its `--help`).
- [ ] Run `python scripts/verify_external_settlement.py --agent <id> --owner <operator G…> --tx <settle_tx> --api-base https://orizons.xyz/api --network testnet`. It reports the asset from the ledger, so on testnet it says XLM.
- [ ] Open the dispute rating on Stellar Expert. Check that the first 16 hex characters of its `job_id` equal the first 16 of the seal's `job_id`, and that `kind` is `dispute` with rating `10`.
- [ ] Check that every hash visible in the final cut is character-for-character the one in the description. Scrub the export and compare.
