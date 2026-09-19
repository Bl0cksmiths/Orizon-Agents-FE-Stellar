# 04 — The external agent execution path (Epic 2)

**Why it matters:** Deliverable 1 made agent registration permissionless, but until this week a registered outside agent could be listed and never do any work — execution only knew the twelve built-in workers. Epic 2 closes that gap: an agent **operated by someone outside the team** can now receive a workflow step, do the work, and be paid and rated for it. It is the path every Week-4 adoption metric (externally operated agents, workflows routed to them) depends on.

**Status: ✅ built, deployed and QA-tested on testnet.** Epic 2 ([BLO-6](https://linear.app/bl0cksmiths/issue/BLO-6)) — all six stories Done.

## How it works, end to end

| Step                             | What happens                                                                                                                                                                     | Story      |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| 1. Register                      | The operator registers their agent on-chain from their own wallet (Deliverable 1).                                                                                               | 1.05       |
| 2. Bind an endpoint              | The operator attaches their service URL to the agent, proving ownership with a **wallet signature** — no account, password or API key. Can be done inside the registration flow. | 2.01, 2.05 |
| 3. Planner routes a step to it   | A bound agent that clears the reputation floor becomes routable like any built-in agent.                                                                                         | 2.01, 3.02 |
| 4. Signed dispatch               | Orizon sends the step to the endpoint, **signed** with a dedicated dispatch key so the operator can verify it came from Orizon.                                                  | 2.02       |
| 5. Operator verifies and answers | The operator's agent checks the signature, rejects replays and late requests, does the work and returns the published response format.                                           | 2.04       |
| 6. Failure has consequences      | A timeout or unusable answer is **not charged** to the buyer and counts against the agent's reputation; an agent never actually called is never blamed.                          | 2.03       |
| 7. The operator sees the result  | The operator dashboard shows their agents, earnings and reputation, with a link to each charge's transaction.                                                                    | 2.06       |

## Security properties

- **Ownership by signature:** only the wallet that owns an agent on-chain can bind, replace or unbind its endpoint; unbinding needs its own signed message, and a revoked binding cannot quietly return.
- **Signed requests:** the public half of the dispatch key is published so operators can pin it — live value from `GET /api/stellar/network`:
  `dispatch_signer = GB5MKHDFLJZ6OFPAHM7R4HGBUPFV5PZYL3W27VTIUZZ25JMQSDZBKCMR`. The key signs messages only; it never holds funds or touches the chain, and it is separate from the key that settles money.
- **Safe addresses only:** plaintext, private-network and loopback URLs are refused, and each address is resolved once and pinned (no DNS-rebinding).
- **Bounded:** every step has a deadline and a response-size cap; compressed responses cannot inflate past the cap.
- **Untrusted output fenced:** an external agent's answer is fenced before later steps read it, so it cannot smuggle instructions to the next agent.
- **Kill switches:** two switches stop external dispatch without a redeploy.

Design records (backend repo): ADR 0003 (binding), ADR 0004 (dispatch hardening), ADR 0005 (failure semantics). Operator recipe for verifying a dispatch: `docs/operators/verifying-a-dispatch.md`.

## The reference agent (story 2.04)

A public, copyable example operators start from: [Orizon-Agents-Example-Agent-Stellar](https://github.com/Bl0cksmiths/Orizon-Agents-Example-Agent-Stellar) — created 2026-09-15, runnable straight from its README ([PR #1](https://github.com/Bl0cksmiths/Orizon-Agents-Example-Agent-Stellar/pull/1)). It implements signature verification against the pinned dispatch signer, replay and deadline checks, and the response contract, with its own test suite and a free-tier Render blueprint.

## QA on testnet (Rie, stories 6.05 / 6.06)

From [UAT PR #3](https://github.com/Bl0cksmiths/Orizon-Agents-UAT-Stellar/pull/3) and the QA tickets:

- **6.05 — external execution end to end** ([BLO-128](https://linear.app/bl0cksmiths/issue/BLO-128)): registration, endpoint binding, signed dispatch, signature verification, failure scenarios, ratings and restart, validated on testnet with a test operator endpoint that verifies Orizon's signed dispatches. 5 live test cases passing; defects D-036 → D-041 logged and tracked.
- **6.06 — operator surfaces** ([BLO-129](https://linear.app/bl0cksmiths/issue/BLO-129)): the reference agent walked from a fresh clone (37/37 tests pass), binding and rebind pages, endpoint refusals, the dashboard across wallet states, phone width. Defects D-042 → D-049 logged and tracked.
