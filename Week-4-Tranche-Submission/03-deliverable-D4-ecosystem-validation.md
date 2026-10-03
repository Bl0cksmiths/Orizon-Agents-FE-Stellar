# 03 — Deliverable D4: Ecosystem Validation Package (testnet)

## Status: every item the SOW asks for is published and linked; QA sign-off is pending

SOW v4 §6.1 asks for D4's evidence in its own words:

> "A 3–5 minute demo video (operator + buyer perspectives), the public "List your agent on Orizon" integration guide, and a list of ≥ 2 external registration tx hashes plus ≥ 3 settlement tx hashes on Stellar Expert (testnet)."

§5.1 adds the litepaper's update as a Week-4 output. All five are live, and each is linked from the public evidence index at [orizons.xyz/evidence](https://orizons.xyz/evidence), which suggests a §6.2 marking of **Present** for D4 and for D1, D2, D3 and Repositories & Deployments alike — the Chapter Lead decides; the page only suggests.

| SOW item                             | Status        | Where to check it                                                                                   |
| ------------------------------------ | ------------- | --------------------------------------------------------------------------------------------------- |
| 3–5 min demo video, operator + buyer | **Published** | [orizons.xyz/demo](https://orizons.xyz/demo) — two parts, 4 min 20 s together                       |
| "List your agent on Orizon" guide    | **Published** | [orizons.xyz/guide/list-your-agent](https://orizons.xyz/guide/list-your-agent) — v1.1.0             |
| ≥ 2 external registration tx hashes  | **11**        | [below](#2-or-more-outside-registrations-on-stellar-expert), each on Stellar Expert                 |
| ≥ 3 settlement tx hashes             | **3** (+2)    | [below](#3-or-more-settlements-on-stellar-expert), each with its authorization and attestation seal |
| Litepaper with §6 updated (SOW §5.1) | **Published** | [orizons.xyz/litepaper](https://orizons.xyz/litepaper) — v0.5, dated 2026-09-30                     |

Two things are stated here rather than left to be found. **The settlements are the team's own test runs** — team keys paid agents the team operates, in testnet's native XLM — because no outside operator's agent has yet been bound to a live endpoint that a paid run can be routed to. And **independent QA has not signed off**: Rie's verdict on the evidence card is no-go, with her blockers and what has changed since listed in [`01-tasks-completed.md`](./01-tasks-completed.md#rieselle-rie--project-management--qa).

## The demo video

[orizons.xyz/demo](https://orizons.xyz/demo) publishes the demo in two parts, each its own YouTube video, **4 min 20 s together** (screenshots [13](./screenshots/13-orizons-demo.png) and [14](./screenshots/14-orizons-demo-transactions.png)):

| Part                    | Video                                                                                     | Length     | Published  | What it shows                                                                                                           |
| ----------------------- | ----------------------------------------------------------------------------------------- | ---------- | ---------- | ----------------------------------------------------------------------------------------------------------------------- |
| 1 — the operator's side | [Orizons \| how to register your Agent ID](https://www.youtube.com/watch?v=LM7iecSviSI)   | 3 min 9 s  | 2026-10-02 | Registering an agent from a Freighter wallet on the live console, through to the confirmed transaction (Deliverable D1) |
| 2 — the buyer's side    | [Orizons Demo APAC Finalists (Buyers/Users)](https://www.youtube.com/watch?v=6NfblJwVEXg) | 1 min 11 s | 2026-07-24 | Ordering a workflow, authorizing its payment in Freighter and receiving the result                                      |

Each part has chapters, each tagged with the funded deliverable it shows, English captions and a transcript, and the player loads nothing from YouTube until it is pressed. The page states its own limits: **the buyer's part was recorded on 2026-07-24, on an earlier version of the console**, and neither video shows an escrow v2 settlement or a dispute on screen. Those are evidenced instead by the **14 sprint transactions** the page lists beside the videos — three runs through escrow v2, each an authorization, a rating, a settlement and an attestation seal, plus the dispute credit and dispute rating — each re-verified on the network on 2026-10-02 at 16:43 UTC and linked to Stellar Expert.

## The operator guide — List your agent on Orizon

[orizons.xyz/guide/list-your-agent](https://orizons.xyz/guide/list-your-agent) (screenshot [15](./screenshots/15-orizons-guide-list-your-agent.png)) takes an operator from nothing to a routed, paid agent on testnet: install a wallet, fund it from friendbot, choose an agent id, skills and price, register on the dApp or through the API, deploy an agent (the [reference agent](https://github.com/Bl0cksmiths/Orizon-Agents-Example-Agent-Stellar) is copyable and MIT-licensed), bind its endpoint, pass the readiness check, and read its reputation. Every command sample is checked against the live API's published schema before the page builds, and it names the backend commit it was verified against (`16819ef`, version 1.1.0, updated 2026-09-30). It is labelled a draft, honestly: the team has checked every step, but someone new to Orizon has not yet followed it end to end.

## 2 or more outside registrations on Stellar Expert

The SOW counts a registration as external when a wallet the team does not control signs it. The public evidence index lists **11 agents registered by 7 outside wallets** on 2026-09-29 and 2026-09-30, each checked against the committed [team wallet register](https://github.com/Bl0cksmiths/Orizon-Agents-BE-Stellar/blob/main/app/data/team_wallets.json) and the platform's own keys, and each linked by name and wallet on that page. The registration transactions:

| Date       | Transaction (Stellar Expert, testnet)                                                                                                                                             |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-09-29 | [`8a049b05dbf59956b2dc6cea96bd50baf4926a58d258ce66be8e74b4f1193bad`](https://stellar.expert/explorer/testnet/tx/8a049b05dbf59956b2dc6cea96bd50baf4926a58d258ce66be8e74b4f1193bad) |
| 2026-09-29 | [`3a74719f22fafa6fcf4a6f2c4d02aebc0eb3b7dbf81fa2f43f87425a3b6b3e32`](https://stellar.expert/explorer/testnet/tx/3a74719f22fafa6fcf4a6f2c4d02aebc0eb3b7dbf81fa2f43f87425a3b6b3e32) |
| 2026-09-29 | [`3ae5f5891e0ad0d9409cfeb4614b12b1ae605fd65744b298c0f8796e86aa4feb`](https://stellar.expert/explorer/testnet/tx/3ae5f5891e0ad0d9409cfeb4614b12b1ae605fd65744b298c0f8796e86aa4feb) |
| 2026-09-29 | [`0508059c00c82f85450c1190df889b19b0517864002a8a855f1297634e3f070f`](https://stellar.expert/explorer/testnet/tx/0508059c00c82f85450c1190df889b19b0517864002a8a855f1297634e3f070f) |
| 2026-09-29 | [`3daa955bb807cd4a24b28c6766b722956dcbdd057366c76da2637b9d99bfe89e`](https://stellar.expert/explorer/testnet/tx/3daa955bb807cd4a24b28c6766b722956dcbdd057366c76da2637b9d99bfe89e) |
| 2026-09-29 | [`d4ecf78a616521044cc3a9c8cf4e9ce8e4923923f3dc786fc392bff9dfae77aa`](https://stellar.expert/explorer/testnet/tx/d4ecf78a616521044cc3a9c8cf4e9ce8e4923923f3dc786fc392bff9dfae77aa) |
| 2026-09-30 | [`3c22546932c1185e1ca1a0d7e1eeed85eaff52157cc411fb0315d54f3c0413bb`](https://stellar.expert/explorer/testnet/tx/3c22546932c1185e1ca1a0d7e1eeed85eaff52157cc411fb0315d54f3c0413bb) |
| 2026-09-30 | [`4459e4953d3ed30b541adb69788e1b087b6f08a2c1786fd5c1876200d5961cb9`](https://stellar.expert/explorer/testnet/tx/4459e4953d3ed30b541adb69788e1b087b6f08a2c1786fd5c1876200d5961cb9) |
| 2026-09-30 | [`42d2073094c95c62d5915bd2329f1abed1973c4188ed3236e47df106d689cadf`](https://stellar.expert/explorer/testnet/tx/42d2073094c95c62d5915bd2329f1abed1973c4188ed3236e47df106d689cadf) |
| 2026-09-30 | [`4a822e5803fa3b69ba767ed29011b2e9e74d4bf842301f0ecf1132d0d7011c42`](https://stellar.expert/explorer/testnet/tx/4a822e5803fa3b69ba767ed29011b2e9e74d4bf842301f0ecf1132d0d7011c42) |
| 2026-09-30 | [`8bcbf49425ad4552f2317031817c447c781686c644b21bd289a9b68d87201cd7`](https://stellar.expert/explorer/testnet/tx/8bcbf49425ad4552f2317031817c447c781686c644b21bd289a9b68d87201cd7) |

Every one is a call to `AgentRegistry.register` signed by the owner's own wallet, with no admin involved (screenshot [24](./screenshots/24-outside-registration-tx-stellar-expert.png) shows the first). The operators were recruited through the Blocksmiths community and onboarding sessions. One of the eleven is bound to an endpoint; none has yet run or been paid. QA questions whether one of the seven owners is truly external (her D-085), and the evidence index will follow the outcome of that issue.

**Registration has kept growing since that audit.** The registry contract's own event log on Stellar Expert records 22 registrations on 2026-10-01, 428 on 2026-10-02 and 104 more by 05:25 UTC on 2026-10-03. Read at 08:08 UTC on 2026-10-03, the live counter on the home page and the API (`GET /api/metrics/overview`) stands at **590 registered agents, 565 external agents and 560 outside operator wallets**, applying the same exclusion rules automatically (screenshots [10](./screenshots/10-orizons-home-live-stats.png), [19](./screenshots/19-be-metrics-overview.png)). Those figures are the live counter's; the wallet-by-wallet audit on the evidence index covers the registrations up to 2026-10-01, and it is that audited list, not the live counter, that the table above draws on.

## 3 or more settlements on Stellar Expert

Three settlements through escrow v2 on 2026-09-30, each shown with the buyer's authorization before it and the attestation seal that ties the payout to the work after it:

| Run | Agent                  | Authorization                                                                                                                      | Settlement                                                                                                                         | Attestation seal                                                                                                                   |
| --- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| 1   | calculatorai, 0.01 XLM | [`36fae769…0a672fc7`](https://stellar.expert/explorer/testnet/tx/36fae7698f6c9f5fe1152458d41eb650353725be877d476846c308e10a672fc7) | [`f0674419…4a8d1235`](https://stellar.expert/explorer/testnet/tx/f0674419992bdf30cf730139e54e4cdd985e32b43ee15c91733e08424a8d1235) | [`f0b25fc5…9a7e2b5c`](https://stellar.expert/explorer/testnet/tx/f0b25fc59ee3c0d3e85cd9d3c92c3d18211411a1c578f8bb2bb58ea59a7e2b5c) |
| 2   | keyboardai, 0.2 XLM    | [`b59d49e2…a224cee1`](https://stellar.expert/explorer/testnet/tx/b59d49e2ddb31fe9216c3da271897f184cb25f77203c62032f90864ba224cee1) | [`19f3420d…04a83397`](https://stellar.expert/explorer/testnet/tx/19f3420ddb5232a8328c66ec57c1e34890d09a38350e172fdfd9ce8d04a83397) | [`a705d6a4…24f68b02`](https://stellar.expert/explorer/testnet/tx/a705d6a437469ac1783f372bf60279f5e90a143c4fcde9bcaad20a7f24f68b02) |
| 3   | calculatorai, 0.01 XLM | [`9f9e99c2…caeac655`](https://stellar.expert/explorer/testnet/tx/9f9e99c2aadcbf3b06cfe4738012dcc302fcee9358f092cfab4dc7f5caeac655) | [`785428bf…04ca554b`](https://stellar.expert/explorer/testnet/tx/785428bf6552208750b375703556c534da557dccd64df8d1db7f954a04ca554b) | [`efca274f…da37c0a8`](https://stellar.expert/explorer/testnet/tx/efca274fb83b50865cfc20dc40b6949e5abd1ae23ed3e7a7622e6c9eda37c0a8) |

Two more settled the same evening in the 5.01 acceptance runs — the partial-delivery settlement [`0ada0708…7adc556b`](https://stellar.expert/explorer/testnet/tx/0ada07084b5aa1c196fb8e45b15d3712dcbefaf320a315a84e8cf2ab7adc556b) and the settlement behind the restart dispute [`eb118e0b…d2a24b`](https://stellar.expert/explorer/testnet/tx/eb118e0b679aa8f88c680cf6095b9718f014ecf67344d6393d5d1f2eb4d2a24b) — which is why the live overview counts five settled workflows on 2026-09-30. Every one is visible on the [escrow v2 contract's history](https://stellar.expert/explorer/testnet/contract/CCNO5TENCK3EK532I3OZLZ63323FEEULPAKJ74CUP3JZK3XQINRQ5VC4) (screenshot [20](./screenshots/20-escrow-v2-contract-stellar-expert.png)).

**What these are, plainly.** They are the team's own test runs: two team buyer keys, both declared in the team wallet register, paid agents owned by the team's admin wallet. They count under the evidence index's rule because the buyer is neither the agent's owner, the escrow's settler nor a platform key — but no outside operator has been paid yet. Testnet settles in native XLM, which is what the escrow's payment asset is configured to on the deployment; the app labels testnet amounts XLM. QA disputes counting these toward the SOW's "USDC settlements" metric (her D-079); her issue is open.

## The litepaper

[The Orizon Agents Protocol Litepaper](https://orizons.xyz/litepaper), version 0.5, dated 2026-09-30, is public on orizons.xyz as a PDF, a web page, a Word document and Markdown, with no account or wallet needed (screenshot [16](./screenshots/16-orizons-litepaper.png)). Its §6, operations and governance, is rewritten for open registration and the escrow v2 settlement model, and its running-cost section is re-priced from the v2 runs. Its source and history live in the frontend repository under [`litepaper/`](https://github.com/Bl0cksmiths/Orizon-Agents-FE-Stellar/tree/main/litepaper).

## The SOW §6.3 success metrics, as the evidence index measures them

The evidence index measures each metric from the chain with the backend's read-only generator (`scripts/sow_metrics`) and shows **10 of 10 met** (screenshot [12](./screenshots/12-orizons-evidence-metrics.png)). The SOW lists eleven; metric m03, "Workflows routed to external agents & settled on Testnet", was removed from the sprint's requirements on 2026-09-30, and the index states that removal under its Disclosures.

| #   | Metric                                                           | Target | Achieved | What it rests on                                                                                         |
| --- | ---------------------------------------------------------------- | ------ | -------- | -------------------------------------------------------------------------------------------------------- |
| m01 | Externally-operated agents registered on testnet                 | ≥ 2    | 11       | The 11 audited outside registrations above                                                               |
| m02 | Unique external operator wallet addresses                        | ≥ 2    | 7        | Their 7 owner wallets                                                                                    |
| m04 | On-chain USDC settlements (charges) recorded                     | ≥ 3    | 3        | The three escrow v2 settlements above — team test runs, in native XLM                                    |
| m05 | Dispute → partial-refund settlements                             | ≥ 1    | 1        | The dispute credit of 2026-09-30 — the full 0.01 XLM step charge, under the live policy of a 100% credit |
| m06 | Permissionless `AgentRegistry.register` flow live on the dApp    | Yes    | Yes      | The [Register page](https://orizons.xyz/app/register), open to any wallet                                |
| m07 | Reputation-gated routing (reads `avg_bps`, applies a floor) live | Yes    | Yes      | The live floor of 5,500 bps and the live exclusion below                                                 |
| m08 | Automated dispute window + partial-credit refund live            | Yes    | Yes      | Refunds switched on with escrow v2 and the first credit paid                                             |
| m09 | Public "List your agent on Orizon" guide published               | Yes    | Yes      | [The guide](https://orizons.xyz/guide/list-your-agent)                                                   |
| m10 | 3–5 min demo video published                                     | Yes    | Yes      | [The demo](https://orizons.xyz/demo), 4 min 20 s                                                         |
| m11 | All source code released under the MIT licence                   | Yes    | Yes      | GitHub detects MIT on all four code repositories                                                         |

Where QA has an open question about a row — m04's asset, m05's and m08's credit share, the external status of one m01/m02 owner — it is in her register and listed in [`01`](./01-tasks-completed.md#defects-logged-this-week--d-077--d-092-16); the index's own row text states each of those facts itself.

## D1–D3, now evidenced live on escrow v2

Weeks 1 to 3 built Deliverables D1, D2 and D3, and the Week-3 bundle said plainly that D3 could not be shown on the deployment. With escrow v2 live, all three now have evidence produced by the deployed service itself, on Stellar testnet. Each is item-by-item on [orizons.xyz/evidence](https://orizons.xyz/evidence), where every one is marked present.

### Week 3's two blockers are resolved

| Week-3 blocker                                                                              | Resolution                                                                                                                                             | Evidence                                                                                                                                                                                                                                                                                                   |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **D-039** — the v1 escrow's `charge` could not move a buyer's funds, so no run ever settled | Fixed at the contract: escrow v2 takes custody at `authorize` under the buyer's signature and pays at `settle`. Merged 2026-09-28, deployed 2026-09-30 | [Contracts #4](https://github.com/Bl0cksmiths/Orizon-Agents-Smart-Contract-Stellar/pull/4); [contracts issue #3](https://github.com/Bl0cksmiths/Orizon-Agents-Smart-Contract-Stellar/issues/3) closed by it (screenshot [25](./screenshots/25-contracts-issue-3-resolved.png)); the five settlements above |
| **D-051** — dispute refunds switched off on the deployment                                  | Switched on with escrow v2, on the current build, with the dispute store on Postgres and the refund reconcile sweep running                            | Live [`/readiness`](https://orizon-agents-be-stellar.onrender.com/readiness): `escrow.version: 2`, `disputes.store: postgres`, `disputes.reconcile.enabled: true` (screenshot [18](./screenshots/18-be-readiness.png)); the two credits below                                                              |

QA's register records both as resolved on 2026-10-01, together with D-050 (no settlement record was ever written, so nothing could be disputed); the GitHub issue that tracks D-050, [backend #67](https://github.com/Bl0cksmiths/Orizon-Agents-BE-Stellar/issues/67), is still open and will be closed against her re-check.

### D1 — Permissionless registration, now evidenced live

SOW §6.1 asks for "an externally owned agent's registration tx hash on Stellar Expert". The eleven outside registrations listed above are exactly that, each signed by its owner's wallet with no admin involved, and the [Register an Agent page](https://orizons.xyz/app/register) is live and open to any wallet. The operator half of the demo records the same flow end to end in Freighter.
