# §A · Appendix A — REST API Reference

The backend exposes a small REST surface plus a single SSE channel. Every endpoint below is exercised by the shipped frontend; the responses are stable for v0.1 and back-compatible until the Blue belt.

Base URL on the public deployment: `https://orizon-agents-be-stellar.onrender.com`.

## A.1 · Orchestrator

### `POST /api/orchestrator/decompose`

Build a typed plan from a natural-language intent. Detects a curated kit first; otherwise calls the LLM orchestrator.

```http
POST /api/orchestrator/decompose
Content-Type: application/json

{ "intent": "calculator web app" }
```

```json
200 OK
{
  "plan_id": "pln_8a1f2c4b",
  "intent":  "calculator web app",
  "steps": [
    { "agent_id": "agt_09l5", "name": "research.pro", "rationale": "extract feature brief + edge cases", "price_usdc": 0.024, "eta_seconds": 0.6 },
    { "agent_id": "agt_05x7", "name": "seo.brief",    "rationale": "produce brand identity",            "price_usdc": 0.009, "eta_seconds": 0.5 },
    { "agent_id": "agt_02k2", "name": "design.figma", "rationale": "lock design tokens",                "price_usdc": 0.018, "eta_seconds": 0.4 },
    { "agent_id": "agt_11c0", "name": "code.gen",     "rationale": "implement single-file HTML",        "price_usdc": 0.054, "eta_seconds": 2.6 },
    { "agent_id": "agt_12r0", "name": "code.critic",  "rationale": "polish: a11y, motion, persistence", "price_usdc": 0.052, "eta_seconds": 1.8 },
    { "agent_id": "agt_08j2", "name": "deploy.v0",    "rationale": "seal artifact + record proof",      "price_usdc": 0.011, "eta_seconds": 0.4 }
  ],
  "total_usdc": 0.168,
  "total_eta":  6.3
}
```

### `POST /api/orchestrator/execute`

Spawn the background execution for a plan and return a task id. If `auth_id_hex` and `payer` are supplied, the backend signs and submits the settlement once, at the end of the run: one `charge` for the workflow's total on the deployed v1 escrow, or one `settle` paying each delivered step on escrow v2 (merged, not deployed), then the `seal` once that confirms, and one rating `submit` per dispatched step (BE@a3dc1f9 · app/services/execution_svc.py · `_settle_onchain`, `_settle_v2`, `_submit_ratings`). On testnet the v1 `charge` cannot complete, so the seal is not reached (§6.9).

```http
POST /api/orchestrator/execute
Content-Type: application/json

{ "plan_id": "pln_8a1f2c4b",
  "auth_id_hex": "000000000000000000000000000000c4",
  "payer": "GA7AI5TAJEZA27I666DSJC4MUJYBEWUYNNZWPU7R2ONA7IZQVO6R5OQV" }
```

```json
202 Accepted
{ "task_id": "tsk_3f9c12a1" }
```

## A.2 · Tasks and trace

### `GET /api/tasks`

List recent tasks (running + complete + failed).

### `GET /api/tasks/{task_id}`

Single-task snapshot. Returns id, intent, agents involved, status, started timestamp, and total spent.

### `GET /api/tasks/{task_id}/artifact`

Return the produced `CodeArtifact` once available. Polled by the frontend until `200`. `charge_tx` is the run's one settlement transaction, or `null` when none confirmed (BE@a3dc1f9 · app/routers/tasks.py · `ArtifactResponse`).

```json
200 OK
{
  "artifact": {
    "title":   "AURORA·CALC",
    "summary": "Scientific calculator with history, memory, and a real keyboard.",
    "files":   [{ "path": "index.html", "language": "html", "content": "<!doctype html>…" }],
    "entry":   "index.html",
    "preview_html": "<!doctype html>…",
    "source": "baked",
    "kit_id": "calculator"
  },
  "charge_tx": "47a13c…",
  "proof_tx":  "0x7fa2c41b…b91d12e4"
}
```

### `GET /api/trace/{task_id}`

Full trace as a JSON array (snapshot). Useful for reconciliation.

### `GET /api/trace/{task_id}/stream`

**Server-Sent Events.** Replays history first, then streams live trace lines until the task terminates. Each event is a JSON `TraceLine`:

```json
event: trace
data: {"t":"00.024","level":"exec","msg":"orchestrator: decompose → [agt_09l5, …]"}
```

The stream emits `event: done` and closes when the workflow completes.

## A.3 · Agents and registry

### `GET /api/agents`

Full registry snapshot. Returns the twelve seeded agents plus any registered on chain.

### `GET /api/agents/{agent_id}`

Single agent record. Combines off-chain seed data with on-chain `AgentRegistry.get` and `ReputationLedger.avg_bps` reads.

## A.4 · Metrics

### `GET /api/metrics/overview`

Dashboard tile data — agents online, tasks per second (rolling 60 s), average completion time, sparkline buckets.

### `GET /api/flow/default`

DAG for the `/app/flow` viewer — node list + edge list.

## A.5 · Stellar

### `GET /api/stellar/network`

Canonical source of truth for contract IDs and network metadata. The response below is the live testnet deployment's, read on 2026-09-30, after `payment_escrow` moved to escrow v2; its shape is the `NetworkInfo` model on BE main (BE@a3dc1f9 · app/routers/stellar.py · `NetworkInfo`, `network`), with the contract ids nested under `contracts`. `dispatch_signer` is `null` when no dispatch key is configured.

```json
200 OK
{
  "network": "testnet",
  "rpc_url": "https://soroban-testnet.stellar.org",
  "network_passphrase": "Test SDF Network ; September 2015",
  "admin": "GA7AI5TAJEZA27I666DSJC4MUJYBEWUYNNZWPU7R2ONA7IZQVO6R5OQV",
  "dispatch_signer": "GB5MKHDFLJZ6OFPAHM7R4HGBUPFV5PZYL3W27VTIUZZ25JMQSDZBKCMR",
  "asset": "native",
  "asset_sac": "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
  "contracts": {
    "agent_registry": "CAPHXWU53UZUZJGV7IAE57NNMH3YYB5MTWO6YA53KKMXSFVLOITBJ3GQ",
    "reputation_ledger": "CDCSOBEVZUPQZV5GV4D6KYHZCLNGW2KXY74RUHSZ3EZUXF34DPW422ZT",
    "payment_escrow": "CCNO5TENCK3EK532I3OZLZ63323FEEULPAKJ74CUP3JZK3XQINRQ5VC4",
    "attestation_registry": "CBYUZKOET43UXTBXZUJIBBJW5ODGD2J2AZVVXCR3QONGOCAHOXQQHEGK"
  }
}
```

### `POST /api/stellar/build/authorize`

Build an unsigned XDR for `PaymentEscrow.authorize`. The frontend signs this with the buyer's wallet and submits via `POST /api/stellar/submit`.

```http
POST /api/stellar/build/authorize
{ "payer": "GA7AI5T…", "agent_id": "orizon_batch", "max_amount_usdc": 0.18, "ttl_seconds": 600 }
```

```json
200 OK
{ "xdr": "AAAAAg…", "expires_at": 49217971 }
```

### `POST /api/stellar/build/register-agent`

Build an unsigned XDR for `AgentRegistry.register`. Used by agent operators to onboard their agent on chain.

### `POST /api/stellar/submit`

Broadcast a signed XDR to Soroban RPC. Returns the transaction hash and any decoded return value (e.g., the `auth_id_hex` from a successful `authorize`).

### `POST /api/stellar/server/charge`

Backend-signed `PaymentEscrow.charge`, v1 only: against a v2 escrow it answers 409 `charge_unsupported_on_v2`. It sits behind the operator API key when one is configured, and the execution service does not call it; a run settles once, at its end (§A.1). The request carries `auth_id_hex`, `amount_usdc` and `job_id_hex`; the response carries the transaction's `hash`, `status`, `ledger` and decoded `result`, the `receipt_id` (BE@a3dc1f9 · app/routers/stellar.py · `ChargeReq`, `server_charge`; app/stellar/client.py · `_finalize_invoke`). On testnet the charge is signed by the backend's key, which is not the deployed escrow's settler, so the contract refuses it (§6.1).

### `POST /api/stellar/server/seal`

Backend-signed `AttestationRegistry.seal`, behind the operator API key when one is configured. The execution service seals a run itself, once, after its settlement confirms, and does not call this route (§A.1). Carries `job_id_hex`, `orchestrator`, `intent_hash_hex`, `agents[]`, `receipts_hex[]`, `total_spent_usdc`; returns the transaction's `hash` and `status` (BE@a3dc1f9 · app/routers/stellar.py · `SealReq`, `server_seal`).

### `GET /api/stellar/agent/{agent_id}`

On-chain `AgentRegistry.get(agent_id)` decoded into JSON.

### `GET /api/stellar/reputation/{agent_id}`

On-chain `ReputationLedger.score(agent_id)` + `avg_bps(agent_id)` decoded into JSON.

### `GET /api/stellar/attestation/{job_id_hex}`

On-chain `AttestationRegistry.get(job_id)` decoded into JSON. The format matches the §5.6.1 example verbatim.

### `GET /api/stellar/new-id`

Returns a fresh random 16-byte id (hex). The frontend uses this to seed a `job_id` before kicking off a workflow that will be settled on chain.

## A.6 · Error responses

All `4xx` and `5xx` responses are JSON of the shape:

```json
{ "error": "not_found",     "detail": "no such plan: pln_xxxx" }
{ "error": "validation",    "detail": "intent must be non-empty" }
{ "error": "upstream_chain","detail": "expired (Error::Expired)" }
{ "error": "worker_timeout","detail": "code.gen timed out after 120s" }
```

The `error` slug is stable; the `detail` is human-readable and may change.
