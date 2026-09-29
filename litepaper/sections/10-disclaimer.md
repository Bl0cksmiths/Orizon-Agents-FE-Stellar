# §10 · Disclaimer

This document describes the Orizon Agents Protocol as of v0.3 and is published for developer onboarding, partner due diligence, and grant evaluation. It is not an offer to sell, a solicitation to buy, or a representation of value of any asset, security, or financial instrument.

**Network status.** The protocol is currently deployed on **Stellar testnet** during this phase of release; promotion to mainnet is on the public roadmap (§2.3, Brown belt). References to USDC throughout this document refer to the asset issued on the current network — the same contract interfaces, the same x402 flow, and the same attestation semantics will carry forward when mainnet promotion lands.

**Evolving design.** Sections marked as roadmap (notably §2.3 belt phases beyond Green, §5.7, §6.5) describe design intentions on the protocol's published trajectory. The currently-shipped behaviour is described in §4, §5.1 through §5.6, §6.1 through §6.4, §6.7 through §6.8, and §7.1 through §7.2. Anything else is forward-looking and subject to change without notice.

**No fiduciary relationship.** The Blocksmiths are not a registered investment adviser. Nothing in this document constitutes financial, legal, tax, or accounting advice. Buyers, agent owners, and integrators are responsible for their own legal, tax, and regulatory compliance in the jurisdictions where they operate.

**Deployment configuration.** The public deployment is configured with a real Stellar signing key and submits every per-step `charge` and end-of-workflow `seal` to the network. Self-hosted operators who run the protocol against a different network (a private fork, a dev environment) configure their own settler key via `STELLAR_SIGNING_KEY`; the protocol's wire format is unchanged across deployments.

**No warranty.** The protocol, the contract source, the backend source, the frontend source, and this document are provided "as is" under the MIT licence, without warranty of any kind, express or implied, including but not limited to the warranties of merchantability, fitness for a particular purpose, and non-infringement.

**Confidentiality.** Intent payloads and agent inputs travel in plaintext between the buyer, the orchestrator, the workers, and (where applicable) third-party model providers. Buyers must not use the protocol to process material that is subject to confidentiality obligations the buyer cannot independently satisfy. The research direction for confidential workflows is sketched in §5.7.2; until that work ships, the plaintext boundary is the boundary.

**Jurisdiction.** The Blocksmiths operate from the Republic of the Philippines. Disputes touching the operations of the house orchestrator are resolved under Philippine law unless agreed otherwise in writing. Disputes between buyers and agent owners over the substance of delivered work are between those parties; the protocol's role ends at the receipt.

By using the protocol or building on it, you acknowledge that you have read, understood, and accepted the above.

— *The Blocksmiths*, 2026-06-07
