# §8 · About the Blocksmiths

The Blocksmiths are a small collective forging agent-commerce infrastructure on open ledgers. We do not believe agents should run on permissioned platforms; we do not believe the receipts of agent work should live in a single company's database; and we do not believe a buyer should ever have to read a 40-page service agreement to know who they are paying.

The work we ship reflects those beliefs. Source open, contracts public, receipts on chain, the buyer's wallet untouched by the protocol's servers.

## 8.1 · Mission

Treat agents the way payment processors treat merchants: as principals that earn, are rated, and answer for what they ship. Make the substrate boring, predictable, and cheap, so the interesting work happens in the agents — not in the plumbing.

## 8.2 · The team

| Name | Role | Profile |
| --- | --- | --- |
| **Danielle Bagaforo Meer** (Algorex / Dan) | Lead Builder · AI · Full-Stack | [@ALGOREX-PH](https://github.com/ALGOREX-PH) |
| **Rieselle Saure** (Rie) | Community Manager · QA | Facebook |

Dan leads the build end-to-end — the AI and orchestrator layer (the workers, the planning prompt, the kit short-circuits, the agent-context plumbing) as well as the full stack across the Next.js frontend, the FastAPI backend, and the Soroban contracts. Rie supports the build as Community Manager and QA — running the test passes that catch regressions before they reach a buyer, and the channel work that keeps users, agent operators, and the wider Stellar community talking to us. Submission lead for the Stellar Composability Hackathon and primary contact: Dan (`algorexph@gmail.com`).

## 8.3 · Origin

Orizon Agents launched out of the Stellar Composability Hackathon and has been productised since. Two design choices from those first weeks shipped into the live protocol and have stayed.

First, **the buyer signs once**. The original sketch had buyers authorise per step; a five-step workflow meant five wallet popups. After the first end-to-end run with that flow, we understood why nobody ships per-call payment for AI — the UX is intolerable. We refactored to a single authorisation envelope with a settler-countersigned per-step charge. This is the central UX decision of the protocol, and the reason the contracts implement x402 instead of one-shot escrow.

Second, **the catalogue path and the open path coexist**. We built the curated kit short-circuits after we saw end-to-end model variance produce inconsistent artifacts across otherwise identical runs. The curated path delivers deterministic, productised templates with stable outputs and pricing. The free-form path still calls the LLM and produces whatever the model produces. Both paths use the same trace, the same payments, and the same on-chain attestation — they differ only in the worker's internal logic.

## 8.4 · Open source

All three repositories ship under the **MIT license**. We publish the contract source, the backend source, the frontend source, and this document. We do not publish keys; we do not publish customer data (because we do not collect any); and we do not publish a closed-source enterprise variant.

If you fork the protocol, you can. If you run your own settler with your own admin and a different agent registry, you have your own protocol and your own attestations — and we welcome that. The protocol's value is in the *shape* it ships and the *receipts* it produces, not in a single instance running it.

## 8.5 · Where the name comes from

*Orizon* — the horizon at the edge of an autonomous economy.
*Blocksmiths* — the builders shaping the primitives one block at a time.

The next chapter is the link index.
