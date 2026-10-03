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
