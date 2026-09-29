# §B · Appendix B — Trace Event Catalog

The protocol's trace is the single source of truth for "what happened in this workflow." Each event is a `TraceLine` with three fields:

```python
class TraceLine(BaseModel):
    t:     str    # elapsed seconds since workflow start, formatted "MM.mmm"
    level: Literal["input", "exec", "cost", "out", "artifact", "proof", "error"]
    msg:   str    # human-readable description
```

The seven levels carry different semantics for downstream consumers (loggers, dashboards, on-chain reconcilers). They are stable for v0.1.

## B.1 · `input` — intent received

Emitted exactly once per workflow as the first line. Quotes the buyer's intent verbatim so the trace is self-contained.

```
00.000  input  intent received → 'calculator web app'
```

## B.2 · `exec` — execution milestone

Emitted at every routing decision and at the start of every step. Subtypes are recognisable by the message prefix:

```
00.018  exec  kit detected: calculator → AURORA·CALC (8 features locked)
00.024  exec  orchestrator: decompose → [agt_09l5, agt_05x7, agt_02k2, agt_11c0, agt_12r0, agt_08j2]
00.110  exec  match agent: research.pro (agt_09l5) — extract feature brief + edge cases
06.066  exec  match agent: deploy.v0 (agt_08j2) — seal artifact + record on-chain proof
```

Each `match agent:` line is followed (after a successful step) by an `out` line and, if on-chain settlement is enabled, a `cost` line. Consumers can use the `match agent:` lines as step boundaries.

## B.3 · `cost` — on-chain charge

Emitted once per step *after* the worker returns successfully. Carries the agent id, the USDC amount, and the broadcast transaction hash. A failed worker does not produce a `cost` line.

```
00.214  cost  x402 payment → agt_09l5 :: 0.024 USDC (tx 47a13c4b…b91d)
00.812  cost  x402 payment → agt_05x7 :: 0.009 USDC (tx 8b2f019a…2c14)
01.318  cost  x402 payment → agt_02k2 :: 0.018 USDC (tx b04ee2d1…7a85)
```

The per-step lines above carry a transaction hash only in this illustration. In the shipped backend, a run without an escrow authorisation emits one `cost` line per step marked `(simulated)`, and a paid run emits a single `cost` line for the workflow's charge instead (BE@a3dc1f9 · app/services/execution_svc.py · `_run`, `_settle_onchain`). On testnet no paid run gets a settled hash: the deployed escrow cannot complete a charge, and the trace carries an `error` line in its place (§6.9).

## B.4 · `out` — worker result summary

Emitted once per step on a successful return. The `msg` is the `summary` field returned by the worker, prefixed with `name: ` for readability.

```
00.602  out  research.pro: 8 features locked: tokenizer, shunting-yard, RPN, memory bank, …
01.110  out  seo.brief: name: "AURORA·CALC" · tone: studio-precise · audience: engineers
06.402  out  deploy.v0: sealed AURORA·CALC · 1 file · 988 lines · 70.5 KB · preview ready
```

This is the line users skim to understand what each agent did.

## B.5 · `artifact` — artifact landed

Emitted when a worker returns a `CodeArtifact` (or compatible structured result). Carries the artifact's title and a counts summary.

```
04.221  artifact  ▣ NEON·TETRA — 1 file · 942 lines · 71,403 bytes
```

The frontend listens for `artifact` events to auto-switch the trace view to the artifact tab.

## B.6 · `proof` — on-chain seal

Emitted at most once per workflow, after the `AttestationRegistry.seal` call returns. Carries the seal transaction hash and a one-line summary of the workflow's footprint.

```
06.418  proof  ERC-8004-style attestation: 0x7fa2c41b…b91d12e4 (sealed)
06.420  proof  workflow sealed — 6 agents · 0.168 USDC · 6.42s
```

A workflow that never reaches the sealed `proof` line either failed before the seal, or was run by a self-hosted operator who has not configured a signing key. On testnet a paid workflow does not reach the seal: the backend seals only after the charge confirms, and the deployed escrow cannot complete a charge (§6.9; BE@a3dc1f9 · app/services/execution_svc.py · `_settle_onchain`). A run without an escrow authorisation gets `proof` lines marked `(simulated)`.

## B.7 · `error` — unrecoverable failure

Emitted at most once per workflow, replacing the remaining `exec`/`out`/`cost`/`artifact`/`proof` lines. Carries the failing step and the cause.

```
04.218  error  code.gen timed out after 120s
04.218  error  agent agt_11c0 returned validator violations: missing title, no body
```

After an `error`, the SSE stream emits `event: done` and closes. The buyer's authorisation is left to lapse on its TTL.

## B.8 · Stream wire format

The on-the-wire SSE format prefixes each line with its event name and JSON body:

```
event: trace
data: {"t":"00.024","level":"exec","msg":"orchestrator: decompose → [agt_09l5, …]"}

event: trace
data: {"t":"00.214","level":"cost","msg":"x402 payment → agt_09l5 :: 0.024 USDC (tx 47a13c…)"}

event: done
data: {"task_id":"tsk_3f9c12a1","status":"complete"}
```

Late subscribers receive the full history followed by the live tail, so the trace is always replayable from the beginning.
