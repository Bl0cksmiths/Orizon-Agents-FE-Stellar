/**
 * The shape of content/evidence/index.json once lib/evidence/validate.mjs has
 * passed it. The validator is the contract; these types only describe what it
 * guarantees, so the page never re-checks what the build already has.
 */

export type DeliverableId = "D1" | "D2" | "D3" | "D4" | "RD";
export type ItemStatus = "present" | "partial" | "missing";
export type MetricStatus = "met" | "not_met";
export type LinkKind =
  "tx" | "contract" | "account" | "page" | "pr" | "repo" | "video" | "doc";

export type EvidenceLink = {
  /** Plain language: what the link shows. Never a bare hash. */
  label: string;
  /** https only; a tx link is exactly the testnet Stellar Expert page for tx_hash. */
  url: string;
  kind: LinkKind;
  /** Only on a tx link: 64 lowercase hex. */
  tx_hash?: string;
  /** YYYY-MM-DD. */
  date?: string;
};

export type EvidenceItem = {
  id: string;
  claim: string;
  status: ItemStatus;
  /** Required when partial or missing: why, plainly. */
  note?: string;
  links: EvidenceLink[];
};

export type EvidenceDeliverable = {
  id: DeliverableId;
  name: string;
  /** SOW §6.1's Evidence Type column, verbatim. */
  evidence_type: string;
  /** SOW §6.1's Description column, verbatim. */
  sow_text: string;
  items: EvidenceItem[];
};

export type EvidenceMetric = {
  id: string;
  category: string;
  /** SOW §6.3, verbatim. */
  metric: string;
  target: string;
  achieved: string;
  status: MetricStatus;
  /** Required when not_met. */
  reason?: string;
  method: string;
  links: EvidenceLink[];
};

export type EvidenceDisclosure = {
  id: string;
  title: string;
  text: string;
  sow_ref?: string;
  changed_since_sow?: string;
};

export type EvidenceNote = { id: string; title: string; text: string };

export type EvidenceIndex = {
  schema: "orizon.evidence-index/1";
  title: string;
  sow: { version: string; date: string; note: string };
  snapshot: { as_of: string; network: "testnet"; method: string };
  deliverables: EvidenceDeliverable[];
  metrics: EvidenceMetric[];
  disclosures: EvidenceDisclosure[];
  notes: EvidenceNote[];
};
