/**
 * The approved SOW's own words (Orizon Agents SOW v4, dated 2026-08-01), for
 * the evidence index to mirror. Extracted from the .docx's document.xml, not
 * retyped: every string here is the SOW's text exactly, dashes, "≥" and all.
 *
 *   SOW_6_1  the "Planned Evidence to Be Submitted" table, one row per
 *            deliverable: the §6.2 checklist's row name, the Evidence Type
 *            column and the Description column;
 *   SOW_6_3  the "Success Metrics" table: category, metric and target.
 *
 * lib/evidence/validate.mjs holds content/evidence/index.json to these, so
 * the index cannot drift from what was funded. Plain .mjs, so Node scripts
 * import the same copy the build does.
 */

export const SOW_VERSION = "v4";

/** @type {ReadonlyArray<{ id: "D1" | "D2" | "D3" | "D4" | "RD", row: string, evidence_type: string, sow_text: string }>} */
export const SOW_6_1 = Object.freeze([
  {
    id: "D1",
    row: "Deliverable 1",
    evidence_type: "Repo PR(s) · live URL · tx hash",
    sow_text:
      'Merged PRs for the registration flow, the live "Register an Agent" URL on the deployed dApp, and an externally owned agent\'s registration tx hash on Stellar Expert (testnet).',
  },
  {
    id: "D2",
    row: "Deliverable 2",
    evidence_type: "Screen recording · screenshots · code link",
    sow_text:
      "A short recording/screenshots of the decompose plan card showing on-chain reputation per agent, plus a routing example where a sub-floor agent is excluded, and a link to the routing code.",
  },
  {
    id: "D3",
    row: "Deliverable 3",
    evidence_type: "tx hash · screen recording",
    sow_text:
      "A dispute tx hash and the corresponding partial-refund tx on Stellar Expert (testnet), plus a recording of the dispute UI on the trace/receipt view.",
  },
  {
    id: "D4",
    row: "Deliverable 4",
    evidence_type: "Demo video · integration guide · tx-hash list",
    sow_text:
      'A 3–5 minute demo video (operator + buyer perspectives), the public "List your agent on Orizon" integration guide, and a list of ≥ 2 external registration tx hashes plus ≥ 3 settlement tx hashes on Stellar Expert (testnet).',
  },
  {
    id: "RD",
    row: "Repositories & Deployments",
    evidence_type: "GitHub repos · live deployments · on-chain proofs",
    sow_text:
      "GitHub repositories (all MIT): frontend github.com/ALGOREX-PH/Orizon-Agents-FE-Stellar, backend github.com/ALGOREX-PH/Orizon-Agents-BE-Stellar, contracts github.com/ALGOREX-PH/Orizon-Agents-Smart-Contract-Stellar. Deployments: dApp orizons.xyz, API orizon-agents-be-stellar.onrender.com. On-chain proofs: every registration, settlement, and attestation is viewable on Stellar Expert (testnet) under the four live contract IDs.",
  },
]);

/** @type {ReadonlyArray<{ id: string, category: string, metric: string, target: string }>} */
export const SOW_6_3 = Object.freeze([
  {
    id: "m01",
    category: "Adoption targets",
    metric: "Externally-operated agents registered on Testnet",
    target: "≥ 2",
  },
  {
    id: "m02",
    category: "Adoption targets",
    metric: "Unique external operator wallet addresses",
    target: "≥ 2",
  },
  {
    id: "m03",
    category: "Transaction targets",
    metric: "Workflows routed to external agents & settled on Testnet",
    target: "≥ 3",
  },
  {
    id: "m04",
    category: "Transaction targets",
    metric: "On-chain USDC settlements (charges) recorded",
    target: "≥ 3",
  },
  {
    id: "m05",
    category: "Transaction targets",
    metric: "Dispute → partial-refund settlements",
    target: "≥ 1",
  },
  {
    id: "m06",
    category: "Technical milestones",
    metric: "Permissionless AgentRegistry.register flow live on the dApp",
    target: "Yes",
  },
  {
    id: "m07",
    category: "Technical milestones",
    metric: "Reputation-gated routing (reads avg_bps, applies a floor) live",
    target: "Yes",
  },
  {
    id: "m08",
    category: "Technical milestones",
    metric: "Automated dispute window + partial-credit refund live",
    target: "Yes",
  },
  {
    id: "m09",
    category: "Technical milestones",
    metric: 'Public "List your agent on Orizon" integration guide published',
    target: "Yes",
  },
  {
    id: "m10",
    category: "Technical milestones",
    metric: "3–5 min demo video published",
    target: "Yes",
  },
  {
    id: "m11",
    category: "Technical milestones",
    metric: "All source code released under MIT License",
    target: "Yes",
  },
]);
