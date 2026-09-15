/**
 * A plain-text evidence block for a completed registration (story 1.07, the
 * Milestone 1 exit gate). The register success card copies this to the
 * clipboard so a chapter contributor captures every artifact — agent id, owner
 * wallet, tx hash, both stellar.expert links, network and timestamp — in one
 * click, at the moment of the run, in the exact shape the story-5.05 evidence
 * index expects.
 *
 * Pure and total, zero dependencies: deterministic given its inputs
 * (`capturedAt` defaults to now — pass it for a stable value).
 */

export type RegistrationEvidence = {
  agentId: string;
  owner: string;
  txHash: string;
  /**
   * The network this registration landed on. Accepts what the backend's
   * GET /stellar/network reports ("testnet" | "mainnet") as well as a raw
   * explorer segment ("public"), and normalizes below — so a live value can be
   * threaded straight through without mislabelling a mainnet tx as testnet.
   */
  network: string;
  capturedAt?: string;
};

export function buildRegistrationEvidence(e: RegistrationEvidence): string {
  const captured = e.capturedAt ?? new Date().toISOString();
  const isMainnet = e.network === "public" || e.network === "mainnet";
  const seg = isMainnet ? "public" : "testnet";
  const label = isMainnet ? "mainnet" : "testnet";
  return [
    "Orizon Agents — registration evidence",
    `agent id:  ${e.agentId}`,
    `owner:     ${e.owner}`,
    `tx hash:   ${e.txHash}`,
    `network:   ${label}`,
    `tx:        https://stellar.expert/explorer/${seg}/tx/${e.txHash}`,
    `account:   https://stellar.expert/explorer/${seg}/account/${e.owner}`,
    `captured:  ${captured}`,
  ].join("\n");
}
