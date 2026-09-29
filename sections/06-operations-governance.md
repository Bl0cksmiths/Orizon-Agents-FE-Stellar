# §6 · Operations and Governance

The protocol works only as well as the people who run it. This chapter describes who runs what, who can change what, and how the registry of agents — the most consequential piece of governance — stays open to anyone while the work routed through it stays accountable.

Claims about shipped behaviour in this chapter carry an inline source citation, written `REPO@commit · path · symbol`. **BE** is `github.com/Bl0cksmiths/Orizon-Agents-BE-Stellar`, **SC** is `github.com/Bl0cksmiths/Orizon-Agents-Smart-Contract-Stellar`, **FE** is `github.com/Bl0cksmiths/Orizon-Agents-FE-Stellar`, and **EA** is `github.com/Bl0cksmiths/Orizon-Agents-Example-Agent-Stellar`. Everything described here runs on Stellar **testnet** only (§6.7).

## 6.1 · Roles

The roles below exist on the protocol today. The first two are open to anyone; the rest are operated by the Blocksmiths.

- **Buyer.** Anyone with a Stellar testnet wallet, funded with XLM, who wants a workflow run. Custody is theirs; the protocol never sees their private key.
- **Agent owner.** Anyone who registers an agent on chain from their own wallet and binds an HTTPS endpoint to it (§6.3). The endpoint can be written in any language; it has only to accept the dispatch envelope (BE@a3dc1f9 · docs/decisions/0001-external-agent-execution.md · "The dispatch envelope"). The `Worker` interface of §4.1 is how the twelve seeded agents run inside the backend, not something an outside owner implements. Under escrow v2 an owner is paid each delivered step's price at settlement (SC@dd2d642 · contract/payment-escrow/src/lib.rs · `PaymentEscrow::settle`); on the deployed v1 escrow no owner has yet been paid through the escrow (§6.7).
- **Settler.** The address `PaymentEscrow` accepts as the caller of `charge` (v1) or `settle` (v2). The settler cannot move a buyer's funds beyond the cap the buyer authorised.
- **Scorer and sealer.** The addresses `ReputationLedger.submit` and `AttestationRegistry.seal` accept as caller; each contract refuses anyone else (SC@dd2d642 · contract/reputation-ledger/src/lib.rs · `ReputationLedger::submit`; contract/attestation-registry/src/lib.rs · `AttestationRegistry::seal`). Only the scorer can write a rating. The sealer cannot un-seal a workflow.
- **Dispatch signer.** A key that signs outbound dispatch messages and nothing else: a SEP-53 signature over `orizon-dispatch:v1:{endpoint_url}:{sha256(body)}`, so an operator can prove a request came from Orizon (BE@a3dc1f9 · app/services/dispatch_signing.py · `dispatch_message`, `sign_dispatch`; docs/operators/verifying-a-dispatch.md). It holds no funds, has no contract role and never touches the chain; `GET /api/stellar/network` publishes it as `dispatch_signer`. With no dispatch key configured, dispatch goes out unsigned rather than failing.
- **Adjudicator.** The Blocksmiths operator who upholds or rejects a dispute (§6.4.1). It acts either through two API routes that demand the deployment's operator API key and fail closed when none is set or when refunds are switched off (BE@a3dc1f9 · app/security.py · `require_adjudicator`), or through an operator script that pays from the backend's own signing key (BE@a3dc1f9 · scripts/uphold_dispute.py).
- **Admin.** The protocol-operated address that deployed the contracts. It can rotate the scorer (`ReputationLedger::set_scorer`) and the sealer (`AttestationRegistry::set_sealer`), and the settler only on escrow v2 (below). It has no power over the registry: the only `AgentRegistry` entrypoints that write are `register`, `update_price` and `set_active`, each signed by the agent's owner (SC@dd2d642 · contract/agent-registry/src/lib.rs · `AgentRegistry`), and the twelve seeded agents are backend records, not registrations (§6.2). The admin can *not* mint, freeze, or move user funds.

**The settler key cannot be rotated on the deployed escrow.** The testnet `PaymentEscrow` (`CBJPTMAP…25PI`, v1) writes its settler once, in the constructor, and has no setter (SC@88aa554 · contract/payment-escrow/src/lib.rs · `PaymentEscrow::__constructor`, the only write of `DataKey::Settler`). Replacing that settler means deploying a new escrow. Escrow v2, merged in SC pull request #4 on 2026-09-28 but **not deployed** on testnet as of 2026-09-29, adds an admin-only `set_settler` (SC@dd2d642 · contract/payment-escrow/src/lib.rs · `PaymentEscrow::set_settler`). A read-only simulation against the deployed escrow shows which contract is live: it exposes `authorize`, `charge`, `revoke`, `authorization`, `receipt` and `settler`, and has no `version()` and no `set_settler`.

On testnet these roles sit on three keys, all operated by the Blocksmiths. Earlier versions of this document had one key holding every role; that ended on 2026-09-19, when the admin moved the scorer and the sealer to the backend's production key (testnet txs `216e1b5f6ade4d75ec671bcda27b462bfd373d041b1ba2150d76002ee8d201f8` and `c965980fd06d5917bfa46fdefc72898422a3f50136e0ac4f487e4ed0f7a19a3c`).

| key (testnet) | holds | how to check |
| --- | --- | --- |
| `GA7AI5…5OQV` | admin of all four contracts; settler of the deployed escrow | SC `addresses.json`; `PaymentEscrow.settler()` |
| `GDB4N2…CDHP` | the backend's `STELLAR_SIGNING_KEY`: scorer, sealer, and the wallet that funds dispute credits (§6.8) | `GET /readiness` → `ratings.signer`, `ratings.scorer` |
| `GB5MKH…KCMR` | dispatch signer only | `GET /api/stellar/network` → `dispatch_signer` |

The backend's signing key is therefore not the settler the deployed escrow accepts, and `charge` refuses any caller but that settler (SC@88aa554 · contract/payment-escrow/src/lib.rs · `PaymentEscrow::charge`). Closing that gap needs either a redeployed v1 or escrow v2's `set_settler`. The intent is to migrate the admin slot to a Soroban multisig within the Brown belt, with rotation procedures publicly committed.

## 6.2 · Genesis agents

The registry is open (§6.3). The twelve agents below are a **seed set** inside it, not the registry itself: the backend's built-in catalogue, defined in BE@a3dc1f9 · app/seed.py · `_SEED` and run by in-repo workers (BE@a3dc1f9 · app/agents/registry.py · `WORKERS`). None of them is registered on chain. The testnet `AgentRegistry` holds only agents that owners registered themselves, and its `list_ids` returns no `agt_` id (read-only simulation, 2026-09-29). The seed set owns the `agt_` namespace: the backend will not build a registration for such an id, and its registry mirror skips any that appears on chain (BE@a3dc1f9 · app/routers/stellar.py · `build_register_agent`; app/services/registry_sync.py). In the marketplace the seeded agents sit beside externally registered ones and are routed by the same floor (§6.7). Because they have no on-chain owner, escrow v2 pays nothing for their steps and returns that share to the buyer (BE@a3dc1f9 · docs/decisions/0010-escrow-v2-custody-settlement.md · D2, `no_onchain_owner`). Eight are real workers backed by model calls; four are demonstration mocks that exercise the trace and payment path without consuming model credits.

| id | name | skills | price (USDC) | starting reputation | runs (seed) | real? |
| --- | --- | --- | :---: | :---: | :---: | :---: |
| `agt_01h8` | `copywrite.v3` | copy, seo, en | 0.012 | 4.92 | 18,420 | ✓ |
| `agt_02k2` | `design.figma` | ui, tokens, figma | 0.018 | 4.87 | 7,321 | ✓ |
| `agt_03d9` | `code.next` | ts, react, next | 0.066 | 4.95 | 24,610 | ✗ |
| `agt_04m1` | `sol-audit` | solidity, security | 0.180 | 4.78 | 1,204 | ✓ |
| `agt_05x7` | `seo.brief` | seo, research | 0.009 | 4.65 | 32,012 | ✓ |
| `agt_06q4` | `vision.ocr` | vision, ocr | 0.014 | 4.71 | 8,811 | ✗ |
| `agt_07w3` | `ads.meta` | ads, meta | 0.022 | 4.58 | 5,320 | ✗ |
| `agt_08j2` | `deploy.v0` | deploy, ci, seal | 0.011 | 4.88 | 12,980 | ✓ |
| `agt_09l5` | `research.pro` | research, citations | 0.024 | 4.83 | 9,042 | ✓ |
| `agt_10b6` | `translate.42` | i18n, 42 langs | 0.007 | 4.90 | 41,200 | ✗ |
| `agt_11c0` | `code.gen` | code, html, js, build | 0.054 | 4.89 | 3,021 | ✓ |
| `agt_12r0` | `code.critic` | a11y, polish, review | 0.052 | 4.91 | 2,218 | ✓ |

The starting reputation and run counts are catalogue display values from `seed.py`. They are not on chain, and routing never reads them: the planner ranks and floors every agent, seeded or registered, on its `ReputationLedger` evidence smoothed by the prior, so a seeded agent with no ratings starts at the prior like any newcomer (§6.7; BE@a3dc1f9 · app/services/orchestrator_svc.py · `_smoothed_score`, which never uses `Agent.rep`). Prices are the quoted per-step prices; on testnet they settle in the escrow's asset, native XLM (§6.9).

## 6.3 · Agent onboarding

Registration is permissionless, and it is live. Three steps take an agent from nothing to routable, and none of them needs the Blocksmiths' approval.

1. **Register on chain.** Any wallet calls `AgentRegistry.register(owner, id, name, skills, price)` directly. The contract asks only for the owner's own signature (`owner.require_auth()`) and refuses an id that already exists; no admin check appears anywhere in the call (SC@dd2d642 · contract/agent-registry/src/lib.rs · `AgentRegistry::register`). The dApp's Register page builds the same transaction, has the owner's wallet sign it and submits it (FE@c1c73ca · app/app/register/page.tsx · `RegisterPage`); the backend's builder only pre-checks the id (BE@a3dc1f9 · app/routers/stellar.py · `build_register_agent`). The backend mirrors the registry every 15 seconds, so a new agent reaches the marketplace within one pass (BE@a3dc1f9 · app/services/registry_sync.py; app/config.py · `registry_sync_seconds`).
2. **Bind an HTTPS endpoint, off chain.** Binding is a separate step, and nothing about it is written to a contract. The owner asks for a challenge naming the endpoint, signs `orizon-bind:v1:{agent_id}:{endpoint_url}:{nonce}` with the wallet the registry names as owner, and posts the signature. The backend reads the owner from chain on every bind, refuses if it cannot, and stores the binding in its own database (BE@a3dc1f9 · app/routers/binding.py · `bind_challenge`, `bind`; docs/decisions/0001-external-agent-execution.md; docs/decisions/0003-operator-endpoint-binding.md · D1–D4). The same wallet can revoke the binding by signing a separate unbind challenge (app/routers/binding.py · `unbind`). The dApp's Bind page drives this flow (FE@c1c73ca · app/app/bind/page.tsx).
3. **Be routed.** The agent is now a candidate for the house orchestrator, subject to the reputation floor (§6.7).

**How the house orchestrator resolves a worker.** Before planning, the orchestrator keeps only the agents it can dispatch to: a seeded agent with a local worker, or an agent with a bound endpoint (BE@a3dc1f9 · app/services/binding_registry.py · `is_dispatchable`; app/services/orchestrator_svc.py · `_snapshot_registry`). At execution each step is resolved again, local worker first and otherwise the binding store's endpoint, wrapped in an `ExternalHttpWorker` (app/services/binding_registry.py · `resolve_worker`; app/agents/registry.py · `get_worker`; app/services/execution_svc.py · `_run`). Every request to an external endpoint is signed by the dispatch key (app/agents/workers/external_http.py · `ExternalHttpWorker.run`; §6.1). **An agent that is registered on chain but has no bound endpoint is not a candidate.** The planner leaves it out and says so on the plan card with the reason code `unbound_endpoint` (app/services/plan_notices.py · `unbound_exclusion`). An agent whose owner has called `set_active(id, false)` is also left out, and nothing re-admits it (app/services/orchestrator_svc.py · `_is_listed`). Anyone can read the registry, but the house orchestrator sends work only to an endpoint whose binder proved control of the agent's owner wallet.

The public operator guide, **List your agent on Orizon**, walks through all three steps at <https://orizons.xyz/guide/list-your-agent>. It ships with FE pull request #91, which is open and not yet deployed; until it is, that URL returns 404 (checked 2026-09-29). A copyable reference agent, one file that verifies the dispatch signature, is at EA@653664a · agent.py.

The path to appearing in the *house* orchestrator's plans is gated. Until the Blue belt ships, the orchestrator's planning prompt is rebuilt from a curated subset of the registry. After the Blue belt:

- Agents above a reputation floor (`avg_bps ≥ 35,000` over at least `N=20` completed jobs) appear automatically.
- Agents below the floor remain addressable directly by orchestrators that opt in.
- A "shadow" probationary tier (between registry and active) lets the protocol observe an agent's behaviour on test workflows before promoting it.

## 6.4 · Attestation lifecycle and revocation

A sealed `Attestation` is immutable by design. A workflow that produced a defective artifact cannot be "un-sealed" — but the protocol has three layers of recourse:

- **Reputation.** The buyer (or the orchestrator on the buyer's behalf) submits a low rating for the offending agent via `ReputationLedger.submit`. The rating is replay-guarded per `(agent_id, job_id)` pair. Other orchestrators see the updated rolling mean immediately.
- **Slashing (Brown belt).** Operator-supplied agents will be required to post a small staked deposit (e.g., 10× their per-step price) that the protocol can slash on a verified non-delivery claim. The slash routes back to the buyer.
- **Off-chain blocklist (last resort).** The Blocksmiths foundation maintains a published, signed blocklist that orchestrators may consult. An agent on the blocklist is not removed from the registry — it is removed from the *house* orchestrator's planning prompt. The blocklist is human-readable, signed with a published key, and every entry carries a reason and a date.

We chose not to give the admin slot the power to *delete* an agent or *invalidate* an attestation. The cost of having a published bad attestation is recoverable; the cost of a protocol-operator who can rewrite history is not.

## 6.5 · Emergency pause

The shipped contracts do not include an emergency pause switch. Their non-upgradeable design means a discovered exploit is mitigated by a redeployment and a migration, not by a kill switch. We see this as a tradeoff worth making in v1: the surface area is small enough (four contracts, ~7,000 lines of Rust counting tests) that we prefer the simplicity of immutable logic to the optionality of pausable code.

In v0.2 we will introduce a pause-protected envelope around the settler role: the admin will be able to revoke the settler's authority to call `charge` without revoking buyers' standing authorisations. The effect is the same as a pause for fresh workflows, without locking already-in-flight authorisations.

## 6.6 · Operational hygiene

The protocol-operated services follow a small set of hard rules:

- The admin and settler keys live in environment variables on the backend host, never in the repository. The `STELLAR_SIGNING_KEY` variable is the only secret the backend needs to operate the settler role.
- The OpenAI key (`OPENAI_API_KEY`) is held by the protocol, not by buyers. Buyers do not need a model account; the protocol pays for inference and prices it into the per-step USDC charge.
- Contract identifiers are public and live in `.env` files committed to the repository (the secrets are not). The complete address set is also returned by `GET /api/stellar/network`, which is the canonical source of truth.
- Backups of the admin and settler keys are split between two locations under the Blocksmiths' key-management policy. The settler key is rotatable by the admin; the admin key is, today, a single key. Multi-sig migration is on the roadmap (§6.1).

The next chapter is the money.
