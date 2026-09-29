# §10 · Disclaimer

This document describes the Orizon Agents Protocol as of v0.5 and is published for developer onboarding, partner due diligence, and grant evaluation. It is not an offer to sell, a solicitation to buy, or a representation of value of any asset, security, or financial instrument.

**Network status.** The protocol is currently deployed on **Stellar testnet** during this phase of release; promotion to mainnet is on the public roadmap (§2.3, Brown belt). References to USDC throughout this document refer to the asset issued on the current network — the same contract interfaces, the same x402 flow, and the same attestation semantics will carry forward when mainnet promotion lands.

**Evolving design.** Sections marked as roadmap (notably §2.3 belt phases beyond Blue, with Blue's escrow v2 merged but not deployed, §5.7 other than what §5.7.4 reports as shipped, §6.5) describe design intentions on the protocol's published trajectory. The currently-shipped behaviour is described in §4, §5.1 through §5.6, §6.1 through §6.4, §6.7 through §6.8, and §7.1 through §7.2. Anything else is forward-looking and subject to change without notice.

**No fiduciary relationship.** The Blocksmiths are not a registered investment adviser. Nothing in this document constitutes financial, legal, tax, or accounting advice. Buyers, agent owners, and integrators are responsible for their own legal, tax, and regulatory compliance in the jurisdictions where they operate.

**Deployment configuration.** The public deployment signs with one Stellar key of its own, `STELLAR_SIGNING_KEY` (`GDB4N2…CDHP` on testnet), which writes ratings as the scorer, seals attestations as the sealer and pays dispute credits (§6.1, §6.6). On testnet that key is not the deployed escrow's settler, which is the admin key `GA7AI5…5OQV`, and the deployed v1 escrow cannot complete a charge in any case. The backend submits one `charge` for a workflow's total and seals only after that charge confirms, so no paid workflow has yet settled or been sealed through the deployed escrow (§6.9; BE@a3dc1f9 · app/services/execution_svc.py · `_settle_onchain`). The signing key becomes the escrow's settler once escrow v2 is deployed. Self-hosted operators who run the protocol against a different network (a private fork, a dev environment) set their own key in `STELLAR_SIGNING_KEY`; it acts as settler only on an escrow constructed with it as settler or, on escrow v2, moved to it by `set_settler`. The protocol's wire format is unchanged across deployments.

**No warranty.** The protocol, the contract source, the backend source, the frontend source, and this document are provided "as is" under the MIT licence, without warranty of any kind, express or implied, including but not limited to the warranties of merchantability, fitness for a particular purpose, and non-infringement.

**Confidentiality.** Intent payloads and agent inputs travel in plaintext between the buyer, the orchestrator, the workers, and (where applicable) third-party model providers. Buyers must not use the protocol to process material that is subject to confidentiality obligations the buyer cannot independently satisfy. The research direction for confidential workflows is sketched in §5.7.2; until that work ships, the plaintext boundary is the boundary.

**Jurisdiction.** The Blocksmiths operate from the Republic of the Philippines. Disputes touching the operations of the house orchestrator are resolved under Philippine law unless agreed otherwise in writing. Disputes between buyers and agent owners over the substance of delivered work are between those parties; the protocol's role ends at the receipt.

By using the protocol or building on it, you acknowledge that you have read, understood, and accepted the above.

— *The Blocksmiths*, 2026-09-29
