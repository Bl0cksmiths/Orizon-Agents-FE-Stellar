# 03 — Deliverable D1: Permissionless Agent Registration (testnet)

**SOW §6.1 D1:** a wallet-owned agent's registration transaction, verifiable on
Stellar Expert (testnet). The marketplace accepts a registration from a
self-custody wallet, permissionlessly, and the transaction is publicly
verifiable.

## Status: ✅ met — registration is live on testnet with verifiable transactions

- The full permissionless registration path is built, hardened, deployed, and **proven on testnet** (Epic 1, all stories — see `01`).
- `AgentRegistry.register` is genuinely open (no allow-list): audited in 1.01, indexed in 1.02, hardened in 1.03.
- Verifier tooling ships and works: `scripts/verify_registration.py` + `app/evidence.py`, plus the register success card's copy-evidence capture.
- The on-chain registry holds real (non-seed) registrations, read live from the deployed testnet `AgentRegistry` (`CAPHXWU5…`).

## Registration transaction — operator wallet (2026-09-12)

A live registration signed from the operator's own wallet on testnet, verified
on Horizon and queryable in the registry.

| Field | Value |
|-------|-------|
| Agent id | `dan_w1_probe` |
| Owner wallet | `GA7AI5TAJEZA27I666DSJC4MUJYBEWUYNNZWPU7R2ONA7IZQVO6R5OQV` |
| Tx hash | `f07aab3e17afeca65c30719962bba5cc0f97bf58e22f659e429c3e8b44198a78` |
| Stellar Expert | https://stellar.expert/explorer/testnet/tx/f07aab3e17afeca65c30719962bba5cc0f97bf58e22f659e429c3e8b44198a78 |
| Horizon | `successful: true`, ledger **4636035** |
| Timestamp | 2026-09-12T09:02:42Z |
| Registry check | `GET /api/stellar/agent-id-available/dan_w1_probe` → `id_taken`, owner = the wallet above |
| Network | testnet |

Screenshot: [`screenshots/09-dan-registration-tx-stellar-expert.png`](./screenshots/).

## Registration transaction — earlier (story 1.05)

A second, earlier wallet-signed registration, still live on testnet Horizon.

| Field | Value |
|-------|-------|
| Story | 1.05 ([BLO-15](https://linear.app/bl0cksmiths/issue/BLO-15)) |
| Tx hash | `416bea4f83e5afd9fc80e38c75ba4b1050031a2d590b0fe6232aa00d6a846393` |
| Stellar Expert | https://stellar.expert/explorer/testnet/tx/416bea4f83e5afd9fc80e38c75ba4b1050031a2d590b0fe6232aa00d6a846393 |
| Owner wallet | `GBI2I3WLMP2Q6L26G7CBKRPP5WJ6G3GGYJHWALOJ7D6EBRGL5OZAADBH` |
| Horizon | `successful: true`, ledger **4556564** |
| Timestamp | 2026-09-07T18:40:07Z (Week-1 Day 1) |
| Network | testnet |

Screenshot: [`screenshots/01-registration-tx-stellar-expert.png`](./screenshots/) · account: [`screenshots/03-registrant-account-stellar-expert.png`](./screenshots/).
