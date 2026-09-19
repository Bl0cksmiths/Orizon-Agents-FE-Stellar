# Technical documentation & demo evidence — Week 2

Source for [`../Technical-Documentation-and-Demo-Evidence.pdf`](../Technical-Documentation-and-Demo-Evidence.pdf):
a step-by-step, illustrated guide to what shipped in Week 2 on Stellar testnet,
with every link a reviewer needs (live app, API, documentation, demo video,
Stellar Expert contracts and transactions). 17 A4 pages, every URL clickable.

## Pages

| Page | Section |
| ---- | ------- |
| 1 | Cover — programme, milestone, sprint week, network, team, contents |
| 2–3 | Links at a glance — app, API, documentation, video, contracts, transactions, PRs |
| 4–6 | Walkthrough A — reputation-gated routing (buyer, Deliverable D2), A1–A5 |
| 7–11 | Walkthrough B — external agent execution (operator, Epic 2), B1–B5 |
| 12 | Walkthrough C — marketplace standing (story 3.05), C1–C2 |
| 13–16 | Walkthrough D — verify on the live API and on-chain, D1–D7 |
| 17 | Demo video — the Week-2 build video post on X |

## Screenshots

All captured 2026-09-19 from public pages, with no wallet connected; nothing
was signed, paid, simulated or submitted. Console pages are clipped to the main
content panel (no sidebar). The PNGs are unaltered — the numbered outlines in
the PDF are drawn by the builder from the rectangles in `shots.json`.

| File | Step | Source |
| ---- | ---- | ------ |
| `a1-orchestrator-intent.png` | A1 — intent box and the four presets | https://orizons.xyz/app/orchestrator |
| `a2-preset-selected.png` | A2 — “tetris game in html” chosen, Decompose | https://orizons.xyz/app/orchestrator |
| `a3-plan-card.png` | A3 — plan card: floor 2.75 · applied, ≈3.50 chips | https://orizons.xyz/app/orchestrator |
| `a4-reputation-floor-panel.png` | A4 — the Reputation floor panel, opened | https://orizons.xyz/app/orchestrator |
| `a5-payment-actions.png` | A5 — Connect wallet / Pay with fiat / Simulate | https://orizons.xyz/app/orchestrator |
| `b1-register-agent.png` | B1 — registration form (not submitted) | https://orizons.xyz/app/register |
| `b2-bind-endpoint.png` | B2 — endpoint binding form and how binding works | https://orizons.xyz/app/bind |
| `b3-reference-agent-readme.png` | B3 — reference agent README, five-step table | https://github.com/Bl0cksmiths/Orizon-Agents-Example-Agent-Stellar |
| `b4-verifying-a-dispatch.png` | B4 — “The five steps” of the operator guide | https://github.com/Bl0cksmiths/Orizon-Agents-BE-Stellar/blob/main/docs/operators/verifying-a-dispatch.md |
| `b5-operator-dashboard.png` | B5 — My Agents, connect prompt | https://orizons.xyz/app/operator |
| `c1-marketplace-floor.png` | C1 — the selection floor, stated once | https://orizons.xyz/app/agents |
| `c2-marketplace-standing.png` | C2 — external, not yet operational, delisted by operator | https://orizons.xyz/app/agents |
| `d1-api-network.png` | D1 — `GET /api/stellar/network` (response body, formatted) | https://orizon-agents-be-stellar.onrender.com/api/stellar/network |
| `d2-api-reputation-params.png` | D2 — `GET /api/stellar/reputation/params` (formatted) | https://orizon-agents-be-stellar.onrender.com/api/stellar/reputation/params |
| `d3-api-readiness.png` | D3 — `GET /readiness` (formatted) | https://orizon-agents-be-stellar.onrender.com/readiness |
| `d4-reputation-ledger-contract.png` | D4 — ReputationLedger contract page | https://stellar.expert/explorer/testnet/contract/CDCSOBEVZUPQZV5GV4D6KYHZCLNGW2KXY74RUHSZ3EZUXF34DPW422ZT |
| `d5-register-tx.png` | D5 — `AgentRegistry.register` (calculatorai) | https://stellar.expert/explorer/testnet/tx/0741a0822b6976f88a4582ffc65f1528004a9a5c3c544171e4be7ba099b1c8aa |
| `d6-set-scorer-tx.png` | D6 — `ReputationLedger.set_scorer` | https://stellar.expert/explorer/testnet/tx/216e1b5f6ade4d75ec671bcda27b462bfd373d041b1ba2150d76002ee8d201f8 |
| `d7-api-docs.png` | D7 — interactive API docs, top of the page | https://orizon-agents-be-stellar.onrender.com/docs |
| `e1-week-2-video-post.png` | Demo video — the Week-2 build post | https://x.com/OrizonAgents402/status/2101103657043255772 |

The JSON shots are the live response bodies re-printed with indentation
(`JSON.stringify` of the parsed body — no value changed); the capture fails if
a value the PDF quotes (floor 5500, prior 7000, z 1.0, 5677 / 5500 / 177,
`writer: "scorer"`, the five contract ids) differs from the live response.
The light, text-dense pages (GitHub, Stellar Expert, API) are captured at 2×
pixel density. The X post is drawn by X’s embed renderer
(https://platform.twitter.com/embed/Tweet.html?id=2101103657043255772), because
x.com renders a blank page to a logged-out headless browser.

## Files

- `capture.mjs` — captures every PNG and writes `shots.json` (each shot’s
  source URL, capture time, region size and outline rectangles).
- `build-pdf.mjs` — writes `Technical-Documentation-and-Demo-Evidence.html`
  and prints it with Chromium to `../Technical-Documentation-and-Demo-Evidence.pdf`
  (A4, same typography and colours as the Proof of Deliverables PDF). It fits
  the screenshots to each page and fails if any page overflows.

## Reproduce

Run from the frontend repo root:

```bash
node Week-2-Tranche-Submission/technical-documentation/capture.mjs        # all shots
node Week-2-Tranche-Submission/technical-documentation/capture.mjs a3 d   # just some (filename prefixes)
node Week-2-Tranche-Submission/technical-documentation/build-pdf.mjs      # → ../Technical-Documentation-and-Demo-Evidence.pdf
```

The capture script wakes the backend first (`/health`, up to ~60 s on a cold
start) and retries each page once with doubled waits. It never connects a
wallet or presses Authorize, Simulate, Pay or Connect wallet; on the
orchestrator it presses only a preset, Decompose, and the Reputation floor
panel’s summary.
