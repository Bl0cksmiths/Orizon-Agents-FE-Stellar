# §7 · Economics

The protocol's economics are deliberately small. There is no native token in v1. There is no inflation, no staking yield, no governance auction. There is a stablecoin moving through an escrow contract in fractions of a cent per step. Everything else is layered on top of that primitive and is introduced only when a concrete problem demands it.

## 7.1 · Fee model

Every step in a workflow has a price, set by the agent owner at registration and stored in `AgentRegistry`. The total cost of a workflow is the sum of the prices of the steps the orchestrator chose. Buyers see the total before they authorise; the authorisation envelope caps the spend at exactly that total.

A worked example. The calculator demo kit decomposes to a fixed six-step pipeline. The shipped registry prices the agents as follows:

| Step | Agent | Skill | Price (USDC) | Cumulative |
| --- | --- | --- | :---: | :---: |
| 1 | `research.pro` (`agt_09l5`) | extract feature brief + edge cases | 0.024 | 0.024 |
| 2 | `seo.brief` (`agt_05x7`) | produce brand identity | 0.009 | 0.033 |
| 3 | `design.figma` (`agt_02k2`) | lock design tokens | 0.018 | 0.051 |
| 4 | `code.gen` (`agt_11c0`) | implement single-file HTML | 0.054 | 0.105 |
| 5 | `code.critic` (`agt_12r0`) | polish: a11y, motion, persistence | 0.052 | 0.157 |
| 6 | `deploy.v0` (`agt_08j2`) | seal artifact + record proof | 0.011 | 0.168 |
| | **Workflow total** | | **0.168** | |

A buyer authorises an envelope of 0.18 USDC (a small headroom above the planned total) for a 600-second TTL. Under escrow v2, merged but not deployed, the 0.18 USDC moves into escrow custody at `authorize`, and one `settle` pays each delivered step's price to that agent's on-chain owner and returns the rest, here at least the unspent 0.012 USDC, to the buyer (SC@dd2d642 · contract/payment-escrow/src/lib.rs · `PaymentEscrow::authorize`, `PaymentEscrow::settle`). The six seeded agents in this example have no on-chain owner, so v2 returns their share to the buyer as well (§6.2). The deployed v1 escrow leaves the funds in the buyer's wallet and asks `charge` to move them on the settler's signature alone, which cannot complete, so no workflow has yet been paid through it (§6.9). A tetris workflow runs the same six-step shape with slightly different totals; the kit's `plan` exposes the numbers up front.

The protocol itself does not extract a fee in v1. Every USDC paid by the buyer is paid through to an agent owner; the only on-chain fees the buyer pays beyond agent prices are Stellar's per-operation network fees, which are denominated in stroops (fractions of a cent in USD terms) and are *not* charged in USDC. That property — the protocol takes nothing, the network takes near-zero — is the property that makes a 0.012 USDC translation step economically possible to ship.

In v0.2 the protocol may introduce a small marketplace fee (e.g., 1% of each step) routed to a Blocksmiths-controlled address, used to fund grants for new agents joining the registry. The fee, if introduced, will be a constant in the `PaymentEscrow.charge` implementation and visible to buyers in the decompose plan before any signature.

## 7.2 · Reputation as currency

Reputation is the second economic primitive — and, in our design, the more important one over time.

The `ReputationLedger` contract keeps, per agent, decayed, value-weighted evidence, `RepState { sum_w, weight, count, disputed }`. `submit` takes a rating from 0 to 100, stores it as basis points weighted by the job's value, and refuses a second rating for the same `(agent_id, job_id)` through a persistent replay guard; each week the evidence keeps 92.5% of its weight. The views include the raw `rep_state` and a basis-points average, `avg_bps = sum_w / weight`, clamped to 0..10,000 (SC@dd2d642 · contract/reputation-ledger/src/lib.rs · `ReputationLedger::submit`, `ReputationLedger::avg_bps`, `decay_to`).

Reputation is *not transferable*. An agent's `avg_bps` is tied to its on-chain id; a clone with a fresh id starts at zero. The cost of churning identities is therefore the cost of climbing back to the reputation floor — which, by the Blue belt, will gate access to the house orchestrator's planning prompt.

The protocol does not assume buyers will rate every workflow. The rating step is settler-emitted today (the protocol's backend submits a synthetic rating based on workflow signals — was the artifact produced, did the critic pass, did the buyer's session close cleanly). When a buyer explicitly rates, that rating overwrites the synthetic one within the same job. We expect the synthetic-first design to widen the rated sample without putting the burden of every rating on the buyer.

A subtle but important property: ratings are public. Any client, including a competing orchestrator, can read `avg_bps(agent_id)` and route accordingly. The protocol does not have a monopoly on reputation discovery — it has a monopoly only on *writing* ratings sealed under a job id, and only because the settler key has the scorer authority. We will open scoring to other roles (e.g., a buyer-direct rating channel with a higher weight) in the Blue belt.

## 7.3 · Why no native token in v1

A new chain token would be the easiest answer to a number of questions — alignment of agent owners with protocol growth, governance over the agent registry, staking-backed slashing. We declined to ship one in v1 for two reasons.

First, **a token before product–market fit is a distraction**. The metric we care about in v1 is "did the buyer get the result they wanted, paid the agents that earned it, and accept the receipt that landed on chain?" A token would change none of that. It would, however, add a category of users (token holders) whose incentives are not aligned with workflow buyers.

Second, **stablecoin settlement is good for buyers**. Buyers price the workflow in USDC, see USDC charges, settle from a USDC balance. A native-token-priced workflow would force the buyer either to hold the token or to pay an additional swap fee per workflow. Either friction is worse than no token at all for v1's user base.

We commit to revisiting a native token if and only if three conditions are jointly true:

- the registry has more than 100 permissionless agents earning across the protocol;
- the workflow-rated-per-week count is in the high four digits;
- a governance question exists that the admin slot cannot answer (e.g., a multi-vendor dispute over agent provenance).

Until then, the protocol's economic surface area is one stablecoin, one settler key, and a small number of price tags.

## 7.4 · A worked monthly projection

A concrete picture of the economics for a small operator running, say, **1,000 buyer workflows per month**, evenly split across the four kits and a 30%-share free-form long tail. We hold the seeded prices constant.

| Workflow type | Runs/mo | USDC per run | USDC per mo |
| --- | :---: | :---: | :---: |
| Kit (tetris/calculator/snake/pomodoro) | 700 | 0.168 | 117.60 |
| Free-form coding | 200 | 0.220 | 44.00 |
| Brand & content | 80 | 0.115 | 9.20 |
| Translation / OCR / Ads | 20 | 0.043 | 0.86 |
| **Total agent payouts** | **1,000** | — | **≈ 171.66** |

Network fees over the same window:

| Operation | Calls/mo | Stroops each | XLM total |
| --- | :---: | :---: | :---: |
| `authorize` | 1,000 | ~100 | 0.0100 |
| `charge` | 6,000 | ~100 | 0.0600 |
| `seal` | 1,000 | ~100 | 0.0100 |
| `submit` (rating) | 6,000 | ~100 | 0.0600 |
| **Total network fee** | **14,000** | — | **≈ 0.14 XLM** |

At any plausible XLM price under USD 0.50, the protocol's monthly network cost across 1,000 workflows is **under 7 US cents**. The agent payouts of ≈ 172 USDC flow entirely through to agent owners; the protocol takes zero margin in v1.

Two observations for prospective operators:

- **The cost of being a buyer is the agents you hire**, not infrastructure. A buyer running ten kit workflows a month pays 1.68 USDC and a vanishing network fee — at the limit of what's possible to charge for a sub-second-finality, fully-audited multi-agent workflow today.
- **The cost of operating the protocol is dominated by the inference bill**, not the chain. The protocol covers OpenAI for the orchestrator and the live workers; an operator running their own deployment can substitute a self-hosted model and bring the inference cost to zero. The on-chain footprint stays small.

## 7.5 · Open questions

We name the unsolved economic questions plainly:

- **Settlement-fee budget.** When network fees on Stellar are paid in stroops, the protocol still picks who pays. Today the buyer pays the per-operation fee for the authorize and the backend pays for the per-step charge. We will publish a per-month operations-fee budget when we move to mainnet.
- **Agent price discovery.** Today prices are set unilaterally by the agent owner. A market-clearing alternative — agents bid into a plan at decompose time — is design space we have explored, but the simpler "fixed-price catalog" mechanism is what v1 needs. We will revisit the bidding model in the Purple belt once multiple orchestrators compete for buyers.
- **Long-tail spam.** Once permissionless registration opens, low-quality agents will appear. The reputation floor handles the planning-time question (who gets routed to). It does not handle the registration-time question (who can claim a slot in the registry at all). A small registration deposit, refundable on first verified delivery, is the simplest answer and the one we expect to ship.

The next chapter introduces the team building the protocol.
