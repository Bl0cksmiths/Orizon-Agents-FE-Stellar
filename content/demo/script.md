# Demo video script: operator and buyer perspectives

Story **5.04** ([BLO-38](https://linear.app/bl0cksmiths/issue/BLO-38)). SOW §6.1 (Deliverable 4) and §6.3 name this video as evidence, and some reviewers will watch nothing else in full. The script is timed, so every scene has a length and a word budget. It is written against the four funded deliverables, so a reviewer can map every scene onto what was paid for.

**Network: Stellar testnet only.** Every transaction in the video is real, is signed during the recording, and is shown resolving on [Stellar Expert (testnet)](https://stellar.expert/explorer/testnet). Nothing is mocked, staged or sped up.

The companion files are:

- [`shot-list.md`](./shot-list.md): the checklist for the recording session (pre-flight, wallets, tabs, retakes, post-production, upload).
- [`narration.txt`](./narration.txt): the narration only, one paragraph per scene, used to make the captions.

The narration below and `narration.txt` must stay word-for-word identical. If you edit one, edit the other in the same commit.

## What was funded: the four deliverables

These definitions come from SOW v4 §4.1 and §6.1. They are restated here because every scene is tagged with one of them.

| Tag    | Deliverable (SOW v4 §4.1)                                                                                                                                                                                                                                                    | What §6.1 asks the evidence to show                                                                                                               |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| **D1** | **Permissionless agent registration.** Any Stellar wallet calls `AgentRegistry.register(owner, id, name, skills, price)` from the dApp, with no Blocksmiths step.                                                                                                            | The live "Register an Agent" URL, and an externally owned agent's registration tx on Stellar Expert.                                              |
| **D2** | **Reputation-gated routing.** The orchestrator reads each candidate's on-chain reputation when it decomposes an intent, applies a floor, and shows each agent's reputation on the plan card before the buyer authorizes.                                                     | The plan card showing on-chain reputation per agent, plus a routing example where a sub-floor agent is excluded.                                  |
| **D3** | **Automated dispute window and partial-credit refund.** Within the window after settlement, a buyer flags a step. The settler pays a partial credit and writes a negative on-chain rating for that agent.                                                                    | A dispute tx hash (the dispute rating) and the partial-refund tx on Stellar Expert, plus a recording of the dispute UI on the trace/receipt view. |
| **D4** | **Ecosystem validation package.** At least 2 externally operated agents, at least 2 unique operator wallets and at least 3 settled workflows. It also includes this video, the public "List your agent on Orizon" guide, and receipts and attestations for every settlement. | This video (operator and buyer perspectives), the integration guide, and the lists of registration and settlement tx hashes.                      |

## Runtime

**The target is 4:15 (255 s). The hard cap is 4:50 (290 s).** The story allows 3 to 5 minutes. If the cut runs long, **cut content rather than run over**; the order to cut in is in the shot list. The 35 s between the target and the cap covers the on-screen cut markers and a slow ledger close. It is not room for more narration.

Narration is paced at about 150 words a minute, which is 2.5 words a second. Each scene's word count is checked against its length below. No scene goes over 150 wpm, and the whole script averages about 135 wpm, which leaves time for the screen to be read.

| Scene     | Start | End  | Length    | Tag         | Perspective | Words   | Pace (wpm) |
| --------- | ----- | ---- | --------- | ----------- | ----------- | ------- | ---------- |
| S01       | 0:00  | 0:14 | 14 s      | D1–D4       | both        | 31      | 133        |
| S02       | 0:14  | 0:42 | 28 s      | D1          | operator    | 61      | 131        |
| S03       | 0:42  | 1:00 | 18 s      | D1          | operator    | 43      | 143        |
| S04       | 1:00  | 1:20 | 20 s      | D2          | buyer       | 45      | 135        |
| S05       | 1:20  | 1:49 | 29 s      | D2          | buyer       | 67      | 139        |
| S06       | 1:49  | 2:05 | 16 s      | D2, D4      | buyer       | 34      | 128        |
| S07       | 2:05  | 2:35 | 30 s      | D1, D4      | both        | 59      | 118        |
| S08       | 2:35  | 3:05 | 30 s      | D3          | buyer       | 64      | 128        |
| S09       | 3:05  | 3:27 | 22 s      | D3          | both        | 52      | 142        |
| S10       | 3:27  | 3:42 | 15 s      | D4          | both        | 35      | 140        |
| S11       | 3:42  | 4:05 | 23 s      | limitations | both        | 53      | 138        |
| S12       | 4:05  | 4:15 | 10 s      | D4          | both        | 24      | 144        |
| **Total** |       |      | **255 s** |             |             | **568** | **134**    |

The word counts are of the narration text exactly as written in this file, and they are re-counted whenever the narration changes. If a scene overruns while recording, **trim its narration**, not another scene's.
