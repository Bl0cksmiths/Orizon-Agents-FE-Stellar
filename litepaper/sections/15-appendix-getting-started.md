# §E · Appendix E — Getting Started

Three onboarding paths, depending on who you are. Each one is a copy-pasteable thirty-minute exercise against the live protocol.

## E.1 · Path A — Buyer

You want to type an intent, get a result, see the receipts on chain. Five steps.

**1. Get a Stellar testnet wallet.** Install Freighter (<https://freighter.app>) or any other StellarWalletsKit-supported wallet, switch it to **Testnet**, and copy your public address (`G…`).

**2. Fund it.** Visit <https://friendbot.stellar.org> and request friendbot funds for your address. You will receive 10,000 test XLM. Refresh the wallet to confirm.

**3. Open the live deployment.** Go to <https://orizon-agents-fe-stellar.vercel.app/app/orchestrator>. Click **Connect Wallet** in the topbar. Pick Freighter (or your installed wallet). Approve the connection.

**4. Type an intent and click Decompose.** Try `tetris game in html` or `calculator web app`. After ~2 s a six-step plan card appears with prices and ETAs. Read it. The total is roughly 0.168 USDC.

**5. Click Authorize & Execute.** Freighter pops up with the `authorize` XDR. Approve. The frontend submits it, gets your `auth_id`, navigates to `/app/trace?task=…`, and starts streaming. You see seven trace levels appear in real time: input, exec, cost, out, artifact, proof. After ~6 s the workflow seals. Click the artifact tab to play the result. Click the receipt links to confirm the on-chain charges on Stellar Expert.

That is the buyer experience end-to-end. No subscription, no API key, no model account. One signature, one workflow, one receipt.

## E.2 · Path B — Agent operator

You want to register an agent that earns from the protocol. Six steps.

**1. Build an HTTPS endpoint.** An outside agent is an HTTPS endpoint, in any language, that accepts the dispatch envelope; the `Worker` class of §4.5 is how the twelve seeded agents run inside the backend, not something you implement (§6.1; BE@a3dc1f9 · docs/decisions/0001-external-agent-execution.md · "The dispatch envelope"). The endpoint can call any model, any tool, any external API — the protocol cares only about the reply.

**2. Serve it where the backend can reach it.** Put it at a public HTTPS URL, and check the dispatch signature on each request so you know it came from Orizon (BE@a3dc1f9 · docs/operators/verifying-a-dispatch.md). A copyable reference agent that does this is EA@653664a · agent.py.

**3. Set a price.** Decide the per-step USDC you want. As a sanity reference: the lowest seeded price is `translate.42` at 0.007 USDC per step; the highest is `sol-audit` at 0.180 USDC per step. Pricing reflects the per-step value, not the per-second cost.

**4. Register on chain.**

```bash
# Sign an XDR for AgentRegistry.register
curl -s -X POST https://orizon-agents-be-stellar.onrender.com/api/stellar/build/register-agent \
  -H "Content-Type: application/json" \
  -d '{ "owner": "G7…", "id": "agt_my", "name": "my.worker", "skills": ["code","ts"], "price": 0.020 }' \
  | jq -r '.xdr' > register.xdr

# Sign register.xdr with Freighter (or any Stellar signer) → register-signed.xdr

curl -s -X POST https://orizon-agents-be-stellar.onrender.com/api/stellar/submit \
  -H "Content-Type: application/json" \
  -d "$(jq -Rs '{ signed_xdr: . }' < register-signed.xdr)"
```

A successful submission returns the transaction hash and your agent is live on `AgentRegistry`.

**5. Pass the reputation floor.** The house orchestrator routes by reputation; new agents start at zero. You can earn reputation by running test workflows against your agent directly (the orchestrator can be invoked with an explicit `agent_id` override) and accumulating positive ratings. Path to the public catalogue: `avg_bps ≥ 35,000` over at least 20 jobs (Blue belt).

**6. Wait for your first charge.** When the orchestrator routes a workflow to your agent, you'll see USDC arrive in your owner wallet — one transfer per executed step, with the per-step amount and the workflow's `job_id` as the memo.

## E.3 · Path C — Integrator / orchestrator builder

You want to build an alternative orchestrator that routes through the same agent registry and settlement layer. Four steps.

**1. Read the registry.** Call `GET /api/agents` for the protocol's agent catalogue, or read `AgentRegistry.list_ids()` and `AgentRegistry.get(id)` directly via Soroban RPC for the canonical on-chain view.

**2. Build your own plan structure.** Your orchestrator builds a `Plan` shape (see §4.3) that names which agents it will call and at what price. There is no requirement to use the LLM-based orchestrator's prompt — a fully rule-based router works equally well.

**3. Call the protocol's execution service.** Either:

- Use the protocol's backend by `POST /api/orchestrator/execute` with your plan, OR
- Implement the equivalent execution loop yourself — call each agent's HTTP endpoint, sign and submit `charge` per step against the buyer's `auth_id`, sign and submit `seal` at the end. The contract interfaces are unchanged; you do not need our backend to use the contracts.

**4. Build your own UI.** The contracts are public, the registry is public, every event is indexed by Soroban RPC. The frontend at `app/orchestrator-fe-stellar.vercel.app` is one client; yours can be another.

The protocol's value is the substrate and the receipts. Orchestrators, frontends, and indexers are deliberately pluggable.

## E.4 · Common pitfalls

- **Insufficient `max_amount`.** If your `authorize` envelope is smaller than the workflow's actual total, the first `charge` to exceed the cap errors `Insufficient`. Set the envelope to ~10% above the planned total.
- **Short `expires_at`.** Free-form intents take 15–30 s; kit intents take ~6 s. Set `expires_at` at least 300 s in the future to avoid the workflow lapsing mid-execution.
- **Trying to use a different network.** The frontend, backend, and contracts are configured against a specific network. The network metadata is the source of truth at `GET /api/stellar/network` — confirm the network passphrase matches your wallet before signing.
- **Skipping the rating step.** A successful workflow that does not produce a rating is *fine* — the settler emits a synthetic rating by default. But buyer-direct ratings carry more weight (post-Blue), so submitting an explicit rating after a workflow you cared about is the right move.
