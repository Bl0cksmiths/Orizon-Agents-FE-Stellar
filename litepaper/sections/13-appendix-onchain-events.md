# §C · Appendix C — On-chain Events

Every contract emits typed Soroban events via `env.events().publish((topics), data)`. Soroban RPC indexes them, so any client can subscribe and replay without a backend. The frontend's `/app/events` page polls these directly on a five-second cadence.

The notation `topics = (...) · data = (...)` mirrors the publish call. `Symbol` values are eight-byte ASCII tokens.

## C.1 · `AgentRegistry`

| Event | Topics | Data | Triggered by |
| --- | --- | --- | --- |
| **Agent registered** | `(Symbol("regd"), agent_id: Symbol)` | `owner: Address` | `register()` |
| **Price updated** | `(Symbol("updated"), agent_id: Symbol)` | `Symbol("price")` | `update_price()` |
| **Active toggled** | `(Symbol("active"), agent_id: Symbol)` | `active: bool` | `set_active()` |

```text
example:
topics: ("regd", "agt_99k0")
data:   "GBVRJQ7HJ5DBPV2K…"   // owner address of the new agent
```

## C.2 · `PaymentEscrow`

| Event | Topics | Data | Triggered by |
| --- | --- | --- | --- |
| **Authorised** | `(Symbol("authd"), agent_id: Symbol)` | `(auth_id: BytesN<16>, payer: Address, max_amount: i128)` | `authorize()` |
| **Charged** | `(Symbol("charged"), agent_id: Symbol)` | `(receipt_id: BytesN<16>, auth_id: BytesN<16>, amount: i128, job_id: BytesN<16>)` | `charge()` |
| **Revoked** | `(Symbol("revoked"), auth_id: BytesN<16>)` | `payer: Address` | `revoke()` |

```text
example:
topics: ("charged", "agt_11c0")
data:   ("0x00000000000000000000000000000a04",   // receipt_id
         "0x000000000000000000000000000000c4",   // auth_id
         540000,                                  // 0.054 USDC in stroops
         "0x0000000000000000000000000000002a")    // job_id
```

## C.3 · `AttestationRegistry`

| Event | Topics | Data | Triggered by |
| --- | --- | --- | --- |
| **Sealed** | `(Symbol("sealed"), job_id: BytesN<16>)` | `(orchestrator: Address, total_spent: i128)` | `seal()` |
| **Sealer rotated** | `(Symbol("rotated"),)` | `new_sealer: Address` | `set_sealer()` |

```text
example:
topics: ("sealed", "0x0000000000000000000000000000002a")
data:   ("GA7AI5TAJEZA27I666DSJC4…", 1680000)   // orchestrator, total stroops (0.168 USDC)
```

## C.4 · `ReputationLedger`

| Event | Topics | Data | Triggered by |
| --- | --- | --- | --- |
| **Rated** | `(Symbol("rated"), agent_id: Symbol)` | `(rating_0_to_100: u32, weight: i128, job_id: BytesN<16>, kind: Symbol)` | `submit()` |

`set_scorer()` emits no event (SC@dd2d642 · contract/reputation-ledger/src/lib.rs · `ReputationLedger::submit`, `ReputationLedger::set_scorer`). `weight` is the step's quoted price in stroops, capped (§6.7). `kind` is `auto` for the backend's per-step rating and `dispute` for an upheld dispute's (BE@a3dc1f9 · app/stellar/client.py · `submit_rating`; §6.7).

```text
example:
topics: ("rated", "agt_11c0")
data:   (95, 540000, "0x0000000000000000000000000000002a", "auto")   // rating, weight, job_id, kind
```

## C.5 · Subscribing

The Soroban RPC `getEvents` call accepts a contract filter and a topic filter. A client interested in every charge across the protocol subscribes with:

```jsonc
{
  "startLedger": 49000000,
  "filters": [{
    "type": "contract",
    "contractIds": ["CBJPTMAPMGODGZCZ2IMEQSRUX3WGUXNMKDTNN2KMJ3NFGYZ5OJ5525PI"],
    "topics": [["AAAAAQAAAAdjaGFyZ2Vk"]]  // base64-encoded ScVal: Symbol("charged")
  }],
  "pagination": { "limit": 100 }
}
```

For a per-agent subscription, append the agent's `Symbol` value as the second topic.

The frontend wraps this in a typed helper at `lib/stellar/events.ts`; an external watcher can reuse the same shape against any RPC provider.
