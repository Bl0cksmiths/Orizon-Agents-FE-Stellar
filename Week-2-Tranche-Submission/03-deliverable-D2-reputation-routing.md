# 03 — Deliverable D2: Reputation-Gated Routing (testnet)

**SOW §6.1 D2:** _a short recording/screenshots of the decompose plan card showing on-chain reputation per agent, plus a routing example where a sub-floor agent is excluded._

## Status: ✅ built, deployed and live on testnet

| What shipped                                            | Status  | Evidence                                                                                                           |
| ------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------ |
| Planner reads each agent's on-chain reputation          | ✅ live | Every plan step carries its reputation and its source; floor parameters served live (below)                        |
| Reputation floor applied on **every** planning path     | ✅ live | Curated demo path (3.01) and free-form path (3.02, hardened in BE #58); covered by 1,534 backend tests              |
| Plan card shows reputation per agent **before** payment | ✅ live | [`screenshots/01-orizons-plan-card.png`](./screenshots/) — https://orizons.xyz/app/orchestrator                    |
| Buyer told what the floor did, and why                  | ✅ live | `notices` + `floor_bps` on every plan (3.02, ADR 0006); the plan card's floor summary and floor-actions panel (3.04) |
| Marketplace shows each agent's standing                 | ✅ live | [`screenshots/02-orizons-agents-standing.png`](./screenshots/) — https://orizons.xyz/app/agents                    |
| Production writes ratings on-chain                      | ✅ live | `/readiness` → `ratings.writer: scorer`; the authorized-scorer transaction below                                   |

## What a buyer sees on the plan card (story 3.04)

On https://orizons.xyz/app/orchestrator, after decomposing an intent and before clicking Authorize:

- **Per step:** a reputation badge — the score, whether it is **on-chain evidence** or the **starting estimate** (marked ≈, visually distinct), the rating count, lower bound and dispute rate.
- **Floor summary:** the routing floor applied to this plan, stated in the card, with how many agents the floor acted on.
- **Floor actions:** a collapsible panel listing any agent the floor excluded, substituted or re-admitted, each with the deciding score and the reason.
- **Warnings above Authorize:** a banner when reputation could not be read from chain (the plan was built on estimates), and a notice when the plan is the planner's fallback (BLO-121).
- Readable at phone width (390 px) with no sideways scrolling; accessibility-checked (axe WCAG 2.0/2.1 AA).

Agents on the live registry currently carry the **≈ 3.50 starting estimate**, which clears the floor, so live plans show the floor applied with no agent removed; each rating from a paid run moves an agent from that estimate toward its on-chain record.

## The routing floor — live parameters

From `GET https://orizon-agents-be-stellar.onrender.com/api/stellar/reputation/params` (testnet):

| Parameter                  | Value                                                                       |
| -------------------------- | --------------------------------------------------------------------------- |
| Routing floor              | **5500 bps** (2.75 / 5), judged on the Wilson lower bound (z = 1.0)         |
| Starting estimate (prior)  | 7000 bps (3.50 / 5), carrying 12 units of evidence weight                   |
| New-agent lower bound      | **5677 bps** — clears the floor by **177 bps** (cold-start guarantee, 3.06) |
| Per-rating weight          | the step price paid, capped at 100                                          |
| Ledger                     | ReputationLedger `CDCSOBEVZUPQZV5GV4D6KYHZCLNGW2KXY74RUHSZ3EZUXF34DPW422ZT` |

## On-chain ratings from production

Three pieces shipped together so that every paid run lands as on-chain reputation evidence:

1. **Every paid run is rated** — ratings are recorded independently of settlement, so each delivery (or non-delivery) becomes evidence ([BE #57](https://github.com/Bl0cksmiths/Orizon-Agents-BE-Stellar/pull/57)).
2. **Production verifies it can write ratings** — `/readiness` now reports `ratings.writer`, checking that the backend's signing key is the ReputationLedger's authorized scorer, and the service states the same at boot ([BE #59](https://github.com/Bl0cksmiths/Orizon-Agents-BE-Stellar/pull/59)).
3. **Production's key authorized on-chain** — admin transactions on testnet made the production backend's key (`GDB4N25UYM3YNTTAWX7LSGI2P7OR62QZQXRNQWAGF5TFVENDKCTTCDHP`) the ledger's scorer and the attestation registry's sealer:

| Transaction (2026-09-19)                   | Hash                                                                                                                                                                              |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ReputationLedger.set_scorer(GDB4N25…)`    | [`216e1b5f6ade4d75ec671bcda27b462bfd373d041b1ba2150d76002ee8d201f8`](https://stellar.expert/explorer/testnet/tx/216e1b5f6ade4d75ec671bcda27b462bfd373d041b1ba2150d76002ee8d201f8) |
| `AttestationRegistry.set_sealer(GDB4N25…)` | [`c965980fd06d5917bfa46fdefc72898422a3f50136e0ac4f487e4ed0f7a19a3c`](https://stellar.expert/explorer/testnet/tx/c965980fd06d5917bfa46fdefc72898422a3f50136e0ac4f487e4ed0f7a19a3c) |

Production `/readiness` reports `ratings.writer: scorer` — see [`screenshots/05-be-readiness.png`](./screenshots/) and [`screenshots/13-set-scorer-tx-stellar-expert.png`](./screenshots/).

## Verify live

| What                        | URL                                                                         |
| --------------------------- | --------------------------------------------------------------------------- |
| The plan card               | https://orizons.xyz/app/orchestrator (decompose "tetris game in html")      |
| Marketplace standing (3.05) | https://orizons.xyz/app/agents                                              |
| Floor + prior parameters    | https://orizon-agents-be-stellar.onrender.com/api/stellar/reputation/params |
| Cold start + ratings writer | https://orizon-agents-be-stellar.onrender.com/readiness                     |
| Network + contract ids      | https://orizon-agents-be-stellar.onrender.com/api/stellar/network           |

Screenshots: [`screenshots/`](./screenshots/) — see its README for the manifest.
