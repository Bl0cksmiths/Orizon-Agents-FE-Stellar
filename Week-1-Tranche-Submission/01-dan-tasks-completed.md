# 01 — Tasks completed by Danielle (Dan), Week 1

Lead engineer. This is the full engineering ledger for the week: **Epic 1
(permissionless registration) shipped end to end, both Week-1 decision spikes
closed, the registration endpoints hardened and rate-limited, and production
parity restored.** Every story below is **Done** in Linear and merged unless
noted.

## Epic 1 — Permissionless Agent Registration (BLO-5, 47 pts) — ✅ Done

| Story | Ticket | Pts | What shipped |
|-------|--------|-----|--------------|
| 1.01 | [BLO-11](https://linear.app/bl0cksmiths/issue/BLO-11) | 3 | Audited and confirmed the open `AgentRegistry.register` path against the deployed contract |
| 1.02 | [BLO-12](https://linear.app/bl0cksmiths/issue/BLO-12) | 8 | Indexed on-chain registrations into the marketplace registry (`/api/agents/sync`), fixing the seed-only split-brain |
| 1.03 | [BLO-13](https://linear.app/bl0cksmiths/issue/BLO-13) | 4 | Hardened the register-agent build endpoint (validation, symbol charset, id-availability preflight) |
| 1.04 | [BLO-14](https://linear.app/bl0cksmiths/issue/BLO-14) | 8 | "Register an Agent" page — form + client-side validation |
| 1.05 | [BLO-15](https://linear.app/bl0cksmiths/issue/BLO-15) | 6 | Sign + submit the registration XDR from the operator's own wallet → **real testnet tx** (see `03`) |
| 1.06 | [BLO-16](https://linear.app/bl0cksmiths/issue/BLO-16) | 3 | **SPIKE** — decided how an external agent receives and executes work (see `04`) |
| 1.07 | [BLO-17](https://linear.app/bl0cksmiths/issue/BLO-17) | 2 | Wallet registration on testnet + tx capture: verifier tooling, runbook, evidence surface (D1 — see `03`) |
| 1.08 | [BLO-44](https://linear.app/bl0cksmiths/issue/BLO-44) | 4 | Operator agent management — change price, delist, relist (owner-gated) |
| 1.09 | [BLO-45](https://linear.app/bl0cksmiths/issue/BLO-45) | 3 | Abuse bounds on the newly public registration endpoints (rate limit, body limit, cached availability) |
| 1.10 | [BLO-119](https://linear.app/bl0cksmiths/issue/BLO-119) | 1 | Promoted Update-2 to main and restored production parity |
| 1.11 | [BLO-120](https://linear.app/bl0cksmiths/issue/BLO-120) | 5 | Stood up the testnet evidence surface (testnet flip runbook) |

## Week-1 decision spikes (scheduled early to de-risk later milestones)

| Story | Ticket | Pts | Outcome |
|-------|--------|-----|---------|
| 4.01 | [BLO-29](https://linear.app/bl0cksmiths/issue/BLO-29) | 4 | **SPIKE** — partial-credit refund mechanism decided (ADR 0002 / D-002), prototyped, unit-tested, and a **real refund landed on testnet** (see `04`) |

## Additional engineering closed in Week 1

| Story | Ticket | Pts | What shipped |
|-------|--------|-----|--------------|
| 3.01 | [BLO-23](https://linear.app/bl0cksmiths/issue/BLO-23) | 4 | Applied the reputation floor on the demo-kit planning path (closing a live defect); 100% coverage |
| 7.04 | [BLO-106](https://linear.app/bl0cksmiths/issue/BLO-106) | 2 | Public commit cadence + multi-contributor visibility audit (see `02`) |

## Totals

- **57 story-points of engineering completed** in Week 1 (47 Epic 1 + 4 refund spike + 4 kit-floor + 2 commit-visibility).
- **~129 authored commits** this week (81 in the backend repo, 48 in the frontend repo) plus 12 web-merge commits — full breakdown and the multi-contributor rule in [`02-commit-visibility.md`](./02-commit-visibility.md).
- Pull requests: see [`05-pull-requests.md`](./05-pull-requests.md).
