# §1 · The AI Coordination Dilemma

> *"Type what you want. A team of AI agents builds it, pays each other on Stellar, and hands you the result — in seconds."* — Orizon Agents, README

Artificial intelligence has, in the span of three years, become the most concentrated industrial input in modern software. A small number of frontier models behind a small number of HTTP endpoints sit beneath nearly every meaningful AI product shipped today. That arrangement scaled the *capability* of intelligence faster than anyone predicted. It did not scale the *coordination* of it.

Coordination is where the next bottleneck lives. When one model writes the spec, a second writes the code, a third audits the result, and a fourth ships it, the problem is no longer "is the model smart enough?" — it is "who paid whom, in what order, for what work, and how do we prove it?" Today, that question has no good answer. We see five concrete failures.

**1. Centralized AI breaks at scale.** A single provider's outage, rate limit, or policy change cascades through every product downstream. There is no second source for an opinionated agent: if `gpt-4o`'s code is bad today, the developer has nowhere to route around it. Marketplaces solve this problem for goods. The AI economy does not yet have one for *work*.

**2. Per-call billing has no provenance.** A monthly invoice from a model provider tells you total spend; it does not tell you which prompt produced which output, who authorized the call, or whether the result was used. When work crosses team or company boundaries, that opacity becomes intolerable. Every accounting team that has tried to reconcile model spend across product lines knows what we mean.

**3. Agents have no settlement layer.** A modern "agent" is a wrapper around prompts, tools, and a memory store. There is no protocol-level concept of an agent that earns. The closest analogue is a Stripe Connect destination — but Stripe assumes the principal is a human or a corporation with a tax ID, not an autonomous program registered by its owner. The semantics are wrong, the latency is wrong, and the unit cost (a few cents over a 30-second hop) is wrong.

**4. Multi-step workflows are opaque to the user.** When a user asks for "a calculator web app," the chain that actually runs — research the feature set, brand the product, generate the code, polish it, deploy it — is invisible. Users see a result, or a failure, with no insight into which step did what, what each step cost, or which step could be improved. Trust degrades as the chain grows longer; nobody can audit it.

**5. There is no notion of *reputation* for an agent.** When you hire a freelancer, you look at their stars. When you call an agent, you have nothing. Quality is a per-call lottery. The market cannot self-correct because the signal of who did good work this month is captured by the platform, not by the agent.

These failures are not academic. They are the reason every enterprise AI deal in 2026 still includes a per-seat licence, a per-API rate card, and a master services agreement instead of just calling agents the way modern systems already call APIs. Coordination overhead has become a tax on intelligence.

## What a working answer looks like

A working answer to the coordination problem must do four things at once:

- **Settle.** Move money from the buyer of a workflow to the providers of each step, atomically with execution, with proof.
- **Attribute.** Record who did what, for whom, in what order, at what price — in a way that survives the operators that produced it.
- **Compose.** Let an arbitrary agent be invoked by an arbitrary orchestrator with no out-of-band relationship.
- **Verify.** Anyone — including the user, a competing orchestrator, a regulator, or a future buyer of an agent's reputation — can replay the workflow's receipts and confirm what happened.

Stellar offers a near-ideal substrate for this. Soroban gives us programmable settlement with sub-second finality. The native asset can wrap a stablecoin (USDC) via the Stellar Asset Contract. Transaction fees are denominated in *fractions of a cent*, which means an agent earning eight cents on a single step is not eaten alive by infrastructure. The same chain that settles a remittance can settle a `code.gen` call.

What is missing is *the protocol on top* — the agreement about how an intent becomes a plan, how a plan becomes a sequence of paid calls, how the result is sealed, and how the agents involved are credited or debited in reputation. That protocol is the **Orizon Agents Protocol**, and the rest of this document is about it.

We make one more observation before we begin. The coordination problem and the *confidentiality* problem are siblings. The same workflow that needs proof of execution also, frequently, needs proof *without revealing the input*. We do not solve confidentiality in v1, and the protocol is honest about the boundary. §5.7 sketches the research path; §10 names the gap plainly.

The next chapter introduces the protocol.
