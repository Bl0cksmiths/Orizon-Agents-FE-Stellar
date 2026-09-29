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

Return the produced `CodeArtifact` once available. Polled by the frontend until `200`.

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
  "charge_tx": ["47a13c…", "8b2f01…", "…"],
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

Canonical source of truth for contract IDs and network metadata.

```json
200 OK
{
  "network":          "testnet",
  "network_passphrase": "Test SDF Network ; September 2015",
  "rpc_url":          "https://soroban-testnet.stellar.org",
  "admin":            "GA7AI5TAJEZA27I666DSJC4MUJYBEWUYNNZWPU7R2ONA7IZQVO6R5OQV",
  "agent_registry":      "CAPHXWU53UZUZJGV7IAE57NNMH3YYB5MTWO6YA53KKMXSFVLOITBJ3GQ",
  "payment_escrow":      "CBJPTMAPMGODGZCZ2IMEQSRUX3WGUXNMKDTNN2KMJ3NFGYZ5OJ5525PI",
  "attestation_registry":"CBYUZKOET43UXTBXZUJIBBJW5ODGD2J2AZVVXCR3QONGOCAHOXQQHEGK",
  "reputation_ledger":   "CDHDMVVERSNZWFJIVOBM34CYLXE4A7UACHD3A6ROI63EYJY43J63WXKV",
  "asset_sac":           "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC"
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

Backend-signed `PaymentEscrow.charge`. Called once per step by the execution service when on-chain settlement is enabled. The request carries `auth_id_hex`, `payer`, `agent_id`, `amount_usdc`, and `job_id_hex`; the response carries `receipt_id` and the broadcast `tx_hash`.

### `POST /api/stellar/server/seal`

Backend-signed `AttestationRegistry.seal`. Called once at workflow completion. Carries `job_id_hex`, `orchestrator`, `intent_hash`, `agents[]`, `receipts[]`, `total_spent`; returns the broadcast `tx_hash`.

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
