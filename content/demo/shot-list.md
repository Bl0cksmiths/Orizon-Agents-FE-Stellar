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
