# §2 · The Orizon Agents Protocol

The Orizon Agents Protocol is a decentralised marketplace for AI agents settled on the Stellar network. A user states an intent in plain language. An orchestrator decomposes the intent into a typed plan. A small set of specialised agents executes the plan in order. Each step is paid in USDC on-chain. The entire workflow is sealed in a write-once on-chain attestation. The user gets the result; the network gets a receipt; the agents get paid.

The protocol is opinionated about three things. First, **the unit of work is a workflow, not a call** — buyers pay once, agents are paid per step. Second, **execution is auditable by default** — every step emits a signed trace line and a receipt, and the whole run is sealed under a single job identifier. Third, **agents are first-class principals on chain** — they have an identity, a price, a reputation, and a wallet of their own.

## 2.1 · Core capabilities

The shipped implementation provides five capabilities, today, on Stellar testnet:

- **Pay-per-workflow settlement.** A single Freighter-signed `authorize` operation grants an escrow contract the right to draw up to a maximum amount, for a single workflow, before an expiry. The protocol then pays the agents without re-prompting the user. That payment has been live on testnet since 2026-09-30, when escrow v2 was deployed: it takes the funds into custody at `authorize` and, in one `settle`, pays each delivered step to its agent's owner and returns the rest to the buyer (§6.8, §6.9; SC@dd2d642 · contract/payment-escrow/src/lib.rs · `PaymentEscrow::authorize`, `PaymentEscrow::settle`; SC@06dc139 · addresses.json · `payment_escrow_v2`). Its first settle is testnet tx `f0674419992bdf30cf730139e54e4cdd985e32b43ee15c91733e08424a8d1235`, a disclosed team run. The first escrow, v1, could not pay: its `charge` cannot move the buyer's funds on the settler's signature alone, so no workflow settled through it.
- **Verifiable execution.** Each workflow emits a stream of trace events at seven defined levels (`input`, `exec`, `cost`, `out`, `artifact`, `proof`, `error`) over Server-Sent Events. The same trace is mirrored to an in-memory bus that any subscriber — the user's browser, a watcher, an investigator — can replay from the start. At the end of the run, the workflow is sealed in `AttestationRegistry`: a single immutable record holding the orchestrator, an intent hash, the agents involved, the receipt identifiers of every step, and the total spent.
- **Composable agents.** Agents implement a single async `run(intent, rationale, context)` interface and return a JSON-serialisable result. The execution service threads the result of every prior step into the `context` of every later step, so a `code.gen` agent can read the brand identity produced by `seo.brief` two steps earlier without any out-of-band call. The twelve seeded agents implement that interface inside the backend; an operator-supplied agent is reached at the HTTPS endpoint its owner binds, which the backend wraps in the same interface (§6.1, §6.3; BE@a3dc1f9 · app/services/binding_registry.py · `resolve_worker`).
- **Curated demo kits with baked artifacts.** Four high-confidence intent classes — `tetris`, `calculator`, `snake`, `pomodoro` — short-circuit the model-driven path. The orchestrator builds a deterministic six-step plan, the `code.gen` and `code.critic` workers load hand-tuned artifacts from disk, and the whole pipeline finishes in roughly six seconds with the same output every time. Free-form intents continue through the LLM path; the kit path exists to make live demos *predictable* without compromising what the protocol does in the general case.
- **On-chain reputation.** A separate `ReputationLedger` accumulates ratings per agent. The scorer, which is the platform's signing key and, since 2026-09-30, also the escrow's settler, submits one rating per step of a paid run; a replay guard keyed by `(agent_id, job_id)` in persistent storage prevents double-counting (§6.1, §6.7). Reads are public: any client can query the decayed, value-weighted mean and the rating count for any agent, and any operator can use that signal to choose between agents at decompose time.

## 2.2 · Comparison

The closest neighbours in the design space are decentralised compute markets, decentralised agent networks, and centralised AI APIs. None of them solves the same problem in the same way.

| Capability | **Orizon** | Bittensor | Fetch.ai | OLAS | Akash | Centralised AI APIs |
| --- | :---: | :---: | :---: | :---: | :---: | :---: |
| Pay-per-job, not per subscription | ✓ | partial | ✓ | partial | ✓ | ✗ |
| Verifiable execution receipt on-chain | ✓ | ✓ | partial | ✓ | partial | ✗ |
| Composable multi-step agent plans | ✓ | ✗ | partial | ✓ | ✗ | ✗ |
| On-chain agent identity + price catalog | ✓ | partial | ✓ | ✓ | partial | ✗ |
| Settlement in a major stablecoin | ✓ (USDC) | ✗ (TAO) | partial | partial | partial | ✓ (USD) |
| Plain-language intent → typed plan | ✓ | ✗ | partial | partial | ✗ | partial |
| Sub-second on-chain finality | ✓ | partial | partial | partial | partial | n/a |

We do not claim Orizon is strictly better at every axis — Bittensor's subnet economics, for instance, are deeply considered in a way our v1 economics are not. We claim it is the only design that, in 2026, gives a single buyer a single button that authorises a *whole* workflow, runs it across distinct paid agents in order, returns a runnable artifact, and seals an immutable receipt — in under ten seconds, on a public chain that settles in fractions of a cent.

## 2.3 · Roadmap — the Stellar Belt program

The protocol's roadmap is structured as a series of belt-level achievements, each gate corresponding to a capability set we can demonstrate in the working dApp before promoting it. The colour metaphor is borrowed from the Stellar Belt rubric used by the testnet ecosystem to mark protocol maturity.

| Belt | Theme | Headline capability | Status |
| --- | --- | --- | --- |
| **White** | Stellar fundamentals | Wallet connect, native XLM payment, transaction feedback | **Shipped** |
| **Yellow** | Multi-wallet + events | StellarWalletsKit, contract reads/writes, event polling, lifecycle UI | **Shipped** |
| **Orange** | Tests + polish | Vitest suite, complete README, live deploy, fifty meaningful commits | **Shipped** |
| **Green** | Production readiness | Inter-contract calls, CI/CD, mobile-responsive UI, native-asset settlement | **Shipped** |
| **Blue** | Marketplace flywheel | Permissionless agent registration, on-chain reputation signal at decompose-time, automated dispute window | **Live on testnet**: registration and reputation routing (§6.3, §6.7); since 2026-09-30, escrow v2 settlement and the dispute window, with refunds switched on (§6.8) |
| **Purple** | Composable orchestrators | Multiple competing orchestrators registered on-chain; user choice at intent time | Planned |
| **Brown** | Reliability primitives | Workflow retries with partial-credit refunds, slashing for non-delivery, escrow timeouts on chain | Planned |
| **Black** | Cross-chain + confidentiality research | Bridge to a second settlement chain; research path for confidential intents and selective-disclosure attestations | Future |

We elaborate on each future band in §5.7 (technical) and §6 (governance). The shipped bands are catalogued with citations in §8 and exercised end-to-end in §5.

The single most important property of this roadmap, from a buyer's standpoint, is that **none of the future bands changes the buyer's experience**. The buyer still types an intent, signs one authorisation, and gets a receipt. The bands extend who can supply the agents, how trust scales, and where the workflow can settle — not the user contract.

## 2.4 · Why Stellar

We were asked, many times, why an agent-commerce protocol settles on Stellar rather than Ethereum, Solana, or a purpose-built L2. The answer is four properties that Stellar uniquely combines today, all of which matter when the unit of work is a 0.01-USDC step:

- **Settlement is sub-second.** Stellar's consensus produces finality in ~5 s. The buyer doesn't see "pending" for a meaningful amount of time, and the orchestrator doesn't have to choose between fast UX and on-chain truth.
- **Per-operation fees are denominated in stroops.** A six-step workflow is nine transactions, not one per step: the buyer's `authorize`, then from the backend one `settle` under escrow v2 (one `charge` for the workflow's total on the deployed v1), one `seal` and six rating `submit`s (BE@a3dc1f9 · app/services/execution_svc.py · `_settle_v2`, `_settle_onchain`, `_submit_ratings`). Soroban calls cost far more than a classic payment's 100 stroops: measured on testnet, about **0.048 XLM** for the eight of those nine whose cost has been observed, before `settle`, which has never run because v2 is not deployed (§7.4). That is about 2.4 US cents at an assumed USD 0.50 per XLM (an assumption made on 2026-09-29, not a quote). The platform pays every one of those fees except the buyer's `authorize` and takes no margin, so on a 0.012 USDC step it runs at a loss today.
- **Stablecoin native.** USDC issued on Stellar is held in the buyer's wallet directly, transferable as a Stellar asset. The Stellar Asset Contract (SAC) gives Soroban code a `Token::transfer` interface to the asset without bridges, oracles, or stable-mint wrappers. The protocol's `PaymentEscrow` calls `SAC::transfer` directly — one cross-contract hop. In the v1 escrow that call sits in `charge` and cannot complete, because the transfer needs the buyer's signature and the charge transaction carries only the settler's; escrow v2, live on testnet since 2026-09-30, makes the transfer inside the buyer-signed `authorize`, into custody, and pays out from there at `settle` (§6.9; SC@88aa554 · contract/payment-escrow/src/lib.rs · `PaymentEscrow::charge`; SC@dd2d642 · same file · `PaymentEscrow::authorize`, `PaymentEscrow::settle`).
- **Soroban gives us composability without rewriting the language.** The four deployed contracts are 32.7 KB of WASM in total (33,532 bytes, fetched from testnet; §5.3). Storage is tiered (`Instance`, `Persistent`, `Temporary`) which lets us keep the attestation and the rating replay guard in `Persistent` for good. The first ledger kept the replay guard in `Temporary`, where it expired and re-opened the replay window; the deployed ledger keeps it in `Persistent` (SC@dd2d642 · contract/reputation-ledger/src/lib.rs · `DataKey::Rated`). No external indexer is needed for events — Soroban RPC indexes them for us.

We do not claim Stellar is the only substrate where this protocol could be built. We claim it is the only substrate where this protocol can be built with a v1 that **prices a step at 2.8 cents on average, finalises in 5 s, and ships with 33 KB of contract code**. The average is the six kit steps' seeded prices, 0.024 + 0.009 + 0.018 + 0.054 + 0.052 + 0.011 = 0.168 USDC, divided by six (BE@a3dc1f9 · app/seed.py · `_SEED`; app/services/orchestrator_svc.py · `_KIT_PIPELINE`). Every other chain we evaluated forced a compromise on one of those three numbers.

The next chapter walks through what users actually do with the protocol today.
