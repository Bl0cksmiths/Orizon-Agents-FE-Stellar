# 04 — Week-1 decision spikes + the live refund

Two decisions that later milestones are blocked on were deliberately pulled into
Week 1 and closed. Both are recorded as ADRs and (for 4.01) proven on-chain.

## 1.06 — External agent execution ([BLO-16](https://linear.app/bl0cksmiths/issue/BLO-16), Done)

**Question:** how does an agent that isn't one of our built-in workers actually
receive and execute a workflow step? The on-chain `Agent` struct has no endpoint
field, and `get_worker()` is a static dict.

**Decision (D-001):** off-chain endpoint binding (candidate A) — an operator
binds an execution URL to their on-chain agent id, proving ownership by a
**wallet signature only** (no account, password, or API key). Rejected: a
contract redeploy (would invalidate the four published testnet ids) and a
pull/queue model.

- ADR: `docs/decisions/0001-external-agent-execution.md` (backend repo)
- Prototype + tests: `app/agents/workers/external_http.py`, `app/services/external_binding.py`, `tests/test_external_binding_spike.py`
- Unblocks Epic 2 (30h estimate confirmed).

## 4.01 — Partial-credit refund mechanism ([BLO-29](https://linear.app/bl0cksmiths/issue/BLO-29), Done)

**Question:** how does a partial-credit refund actually move money? The deployed
`PaymentEscrow` has **no refund entrypoint** and never takes custody (`charge`
sends USDC payer → agent-owner directly), so there is nothing to reverse.

**Decision (D-002):** settler-funded platform **credit** — on an upheld dispute
the settler sends the credited amount to the buyer over the asset SAC
(`transfer(settler → buyer)`). A credit, never a clawback. The dispute is
recorded on-chain under a *derived* job id `sha256(job_id‖"dispute")[:16]` so it
clears the ReputationLedger replay guard (R12). Rejected: a new `refund`
entrypoint (contract redeploy) and an escrow-hold redesign.

- ADR: `docs/decisions/0002-partial-credit-refund.md`; prototype + 5 tests in `app/services/refund_svc.py` / `tests/test_refund_svc.py`.

### ✅ A real refund landed on testnet (the spike's acceptance criterion)

| Field | Value |
|-------|-------|
| Tx hash | `9b8ffaa44b2b966e4c3f1ab581f4203a30d282901ba3b231a578e46d8f919a68` |
| Stellar Expert | https://stellar.expert/explorer/testnet/tx/9b8ffaa44b2b966e4c3f1ab581f4203a30d282901ba3b231a578e46d8f919a68 |
| Settler (source) | `GA7AI5TAJEZA27I666DSJC4MUJYBEWUYNNZWPU7R2ONA7IZQVO6R5OQV` |
| Buyer (credited) | `GBI2I3WLMP2Q6L26G7CBKRPP5WJ6G3GGYJHWALOJ7D6EBRGL5OZAADBH` |
| Amount | 0.054 |
| Horizon | `successful: true`, ledger **4635132** |
| Timestamp | 2026-09-12T07:47:27Z |
| Network | testnet |

**Honest note:** the testnet asset SAC (`CDLZFC3S…`) wraps the **native asset**
(`name`/`symbol` = `native`), so this credit moved 0.054 XLM. The code path is
asset-agnostic and wraps USDC on mainnet — the demonstration proves the
money-moving mechanism, not a USDC-specific one.

Screenshot: [`screenshots/02-refund-tx-stellar-expert.png`](./screenshots/). Full record: `docs/evidence/4.01-refund-testnet.md` (backend repo, on `main`).
