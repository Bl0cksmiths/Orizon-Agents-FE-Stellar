# §D · Appendix D — Glossary

Terms used in this document, in alphabetical order. Where a term carries a precise on-chain meaning, the corresponding contract and storage key are cited.

**Agent.** A principal in the protocol that earns USDC for performing a step in a workflow. Run off-chain either as one of the backend's seeded workers or behind an HTTPS endpoint its owner binds to its id (§6.3); recorded on-chain as a row in `AgentRegistry`. Identified by an eight-byte `Symbol` (e.g., `agt_11c0`). See §4.1, §6.2.

**Agent owner.** The Stellar address that registered an agent and to which its payouts go: under escrow v2 (merged, not deployed) one `PaymentEscrow.settle` per workflow pays each delivered step's price to the owner `AgentRegistry.owner_of` names; the deployed v1 escrow's `charge` names the same owner but cannot complete its transfer on testnet (§6.9). The owner is set at `register()` time and verified against `caller.require_auth()` for `update_price` and `set_active`. See §5.3.1.

**Artifact.** The structured output of a code-producing worker — a single-file HTML document or a multi-file project — returned as a `CodeArtifact` JSON object and stored in `state.artifacts[task_id]`. The artifact's preview is rendered in a sandboxed iframe in the frontend. See §4.3.

**Attestation.** A write-once on-chain record sealed by `AttestationRegistry.seal` at the end of a workflow. Holds the orchestrator, the `intent_hash`, the agents involved, the receipt identifiers, the total spent, and the seal timestamp. Immutable. See §5.6.1.

**Authorisation envelope.** A `PaymentEscrow.Authorization` record created by `authorize(payer, agent_id, max_amount, expires_at)`. Caps how much the settler can draw across the workflow and expires at a wall-clock timestamp. The buyer signs this *once* per workflow. See §5.3.1, §5.5.

**`auth_id`.** A `BytesN<16>` identifier returned from `authorize`. Deterministic from an incrementing nonce: `[0u8; 8] ‖ nonce.to_be_bytes()`. Carried by every subsequent `charge` against the envelope. See §5.3.

**Buyer.** The Stellar wallet that initiates a workflow by signing the `authorize` XDR. The protocol never sees the buyer's private key. See §6.1.

**Blue belt.** The milestone that opened registration to any wallet and gated routing on reputation: a floor of 5,500 bps applied to the lower bound of a prior-smoothed score, on the contract's 0–10,000 bps scale. See §2.3, §6.3, §6.7.

**`BytesN<16>`.** Soroban's fixed-length 16-byte type, used for all protocol-internal identifiers (`auth_id`, `receipt_id`, `job_id`). Deterministic generation avoids ledger-state dependency. See §5.3.

**`charge`.** `PaymentEscrow.charge(caller, auth_id, amount, job_id)`, on the deployed v1 escrow only; v2 has no `charge`. Step 2 of x402 on v1, submitted once per workflow for its total. Settler-only. Validates the envelope, calls `AgentRegistry.owner_of`, transfers via SAC, mutates `Authorization.spent`, stores `Receipt`, returns `receipt_id`. See §5.3.1.

**Composability Hackathon.** The Stellar ecosystem event during which the protocol's first public version was built and demonstrated. The protocol's productisation continues post-event. See §8.3.

**Context.** A mutable Python dict threaded through every worker in a workflow. Keys: `intent`, `kit` (when a kit matched), and the result of every prior step keyed by the producing worker's `name`. See §4.1, §5.2, Figure 4.

**Critic checklist.** Each `DemoKit` carries a `critic_checklist` of at least four validation rules. The `code.critic` worker reads it from `context` and reports per-rule conformance. See §3.1, §5.2.

**Decompose.** The first step of every workflow: turn a natural-language intent into a typed `Plan`. Implemented in `orchestrator_svc.decompose`. See §5.1.

**DemoKit.** A curated, productised workflow template — a `BrandSpec` + `PaletteSpec` + `TypographySpec` + `critic_checklist` + optional baked `artifact_path`. Four ship today: tetris, calculator, snake, pomodoro. See §3.1.

**Free-form intent.** Any intent that does *not* match a curated kit's trigger list. Routed through the LLM orchestrator and the model-backed workers. See §3, §5.1.

**Frontend.** The Next.js 14 App Router application at `https://orizon-agents-fe-stellar.vercel.app`. Talks to the backend over REST + SSE and to the contracts over signed XDR via StellarWalletsKit. See §5.3.

**House orchestrator.** The orchestrator operated by the Blocksmiths and used by the public deployment's `/app/orchestrator` page. Future belts make it one of several competing orchestrators. See §2.3, §6.3.

**Intent.** The buyer's plain-language description of the desired outcome. The first event in every trace; hashed (`intent_hash`) and recorded in the sealed `Attestation`. See §1, §5.1.

**`intent_hash`.** A 32-byte hash of the canonical intent string. Stored in the `Attestation` so a verifier can confirm that a returned artifact corresponds to the originating intent. See §5.6.1.

**`job_id`.** A `BytesN<16>` identifier shared by every receipt and the attestation for a single workflow. Generated client-side via `GET /api/stellar/new-id`. See §A.5.

**Kit.** Short for `DemoKit`. See above.

**MIT licence.** The software licence under which the protocol's source and this document are released. See §8.4.

**Orchestrator.** The component responsible for turning an intent into a plan. Today: an Agno-wrapped chat agent with the registry serialised into its system prompt. Tomorrow: one of several competing orchestrators per the Purple belt. See §2.3, §5.1.

**Orchestrator equivocation.** A failure mode in which a malicious orchestrator routes work to its own agents. Mitigated by competing orchestrators (Purple belt) and by exposing every plan via `GET /api/tasks/{task_id}`. See §5.5.1.

**`payer`.** The Stellar address that signed the `authorize` XDR. Carried in the `Authorization` and in the `Attestation.orchestrator` field for traceability. See §5.3.1.

**Plan.** A typed list of `PlanStep`s with a `plan_id`, the original intent, the total cost, and the total expected duration. Returned by `decompose`, consumed by `execute`. See §4.3.

**`PlanStep`.** A single row of a plan: an `agent_id`, the agent's `name`, a one-sentence `rationale`, a `price_usdc`, and an `eta_seconds`. See §4.3.

**`proof` line.** The trace event emitted after `AttestationRegistry.seal` returns. Carries the seal transaction hash and a one-line workflow summary. See §B.6.

**`receipt_id`.** A `BytesN<16>` identifier returned by `charge`. Identifies a single on-chain `Receipt` row. Listed in the workflow's `Attestation.receipts`. See §5.3.1.

**Replay guard.** A persistent-storage marker keyed by `(agent_id, job_id)` in `ReputationLedger`. Prevents the scorer from rating the same `(agent_id, job_id)` pair twice; it does not lapse. See §5.5.1.

**SAC.** Stellar Asset Contract — the Soroban wrapper around a native Stellar asset (XLM, USDC, etc.) exposing `Token::transfer`. The deployed v1 escrow calls it from `PaymentEscrow.charge` to move funds from buyer to agent owner, a transfer that cannot complete on testnet because the charge carries no buyer signature (§6.9). Escrow v2, merged but not deployed, calls it at `authorize`, to take the buyer's funds into custody, and at `settle`, to pay owners and return the rest. See §5.3.

**Scorer.** The protocol-controlled address authorised to call `ReputationLedger.submit`. Rotatable by the admin via `set_scorer`. On testnet it is the backend's signing key, a different key from the deployed escrow's settler since 2026-09-19. See §6.1.

**`seal`.** `AttestationRegistry.seal(...)`. Step 3 of x402. Sealer-only. Write-once. Errs `AlreadyExists` on a second seal of the same `job_id`. See §5.3.1.

**Sealer.** The protocol-controlled address authorised to call `AttestationRegistry.seal`. Rotatable by the admin via `set_sealer`. On testnet it is the backend's signing key, a different key from the deployed escrow's settler since 2026-09-19. See §6.1.

**Settler.** The protocol-controlled address authorised to move escrowed payments: `charge` on the deployed escrow, `settle` on escrow v2. On the deployed escrow it is written once at construction and has no setter, so rotating it requires a redeploy; escrow v2 (merged, not yet deployed) adds an admin-only `set_settler`. See §6.1.

**SSE.** Server-Sent Events — the HTTP transport the backend uses to stream trace lines to subscribers. One-way, simple, reconnect-friendly. See §A.2, §B.8.

**Stellar Belt.** A maturity rubric of seven coloured tiers (White through Black) used by the Stellar testnet ecosystem to score protocol maturity. We use the same colours for our published roadmap. See §2.3.

**Stroop.** 1/10,000,000 of an XLM. The denomination for all on-chain amount fields (which are `i128`). 0.168 USDC is stored as `1_680_000` stroops. See §5.6.1, §7.1.

**Trace.** The complete record of a workflow's execution, emitted as a sequence of `TraceLine` events at seven levels. Stored in-memory and streamed to subscribers via SSE. See §5.6, §B.

**`TraceLine`.** A single trace event with `t`, `level`, and `msg`. See §B for the seven levels.

**Worker.** The Python class that implements an agent's behaviour. Subclasses `Worker` and implements `async run(intent, rationale, context)`. See §4.1, §4.5.

**Workflow.** End-to-end: a buyer's intent → a typed plan → a sequence of paid worker calls → a sealed on-chain attestation. The unit of work in the protocol. See §1, §5.

**x402.** A pattern borrowed from the HTTP-402 "payment required" semantics: authorise once, then settle within the envelope on completion. On the deployed v1 escrow it is `authorize` → one `charge` for the workflow's total → `seal`, and the charge cannot complete on testnet (§6.9); on escrow v2, merged but not deployed, it is `authorize` into custody → one `settle` → `seal`. See §5.3.3, Figure 5.
