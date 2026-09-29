/**
 * Which PaymentEscrow the deployment actually settles through, as far as this
 * page can tell — the one decision every custody sentence and control reads.
 *
 * Escrow v2 takes the buyer's funds into custody at `authorize`, pays each
 * delivered step at `settle`, returns the rest, and lets the buyer `reclaim`
 * an authorization nobody settled. Escrow v1 does none of that: its
 * `authorize` only records a spending allowance, and its `charge` can never
 * complete a buyer's payment (D-039). A page that tells a v1 buyer their
 * funds moved into escrow, or offers them a reclaim, says something false.
 *
 * - `v2`: a v2 escrow is pinned for this network AND the backend reports that
 *   same escrow. The only case in which custody is claimed.
 * - `v1`: no v2 escrow is pinned for this network, so the backend's escrow is
 *   v1 — the pin is filled in only once v2 is deployed (see
 *   docs/escrow-v2-switch.md).
 * - `unknown`: the network read has not answered or failed, or a v2 pin is set
 *   and the backend reports another escrow (the plan card's mismatch guard
 *   then pauses Authorize). Copy then claims neither custody nor its absence.
 */

import { defaultExplorerNetwork } from "@/components/ui/stellar-link";
import {
  escrowAgreement,
  pinnedEscrowId,
  type EscrowAgreement,
} from "./escrow-address";
import type { StellarNetworkInfo } from "./types";

export type EscrowGeneration = "v1" | "v2" | "unknown";

/** The generation an agreement between the pin and the backend implies. */
export function generationOf(agreement: EscrowAgreement): EscrowGeneration {
  switch (agreement.kind) {
    case "match":
      return "v2";
    case "unpinned":
      return "v1";
    case "unknown":
    case "mismatch":
      return "unknown";
  }
}

/**
 * The generation of the escrow behind `network` (the `GET /stellar/network`
 * read), checked against this build's v2 pin for its own network.
 */
export function escrowGeneration(
  network: StellarNetworkInfo | null | undefined,
): EscrowGeneration {
  return generationOf(
    escrowAgreement(network, pinnedEscrowId(defaultExplorerNetwork)),
  );
}

/**
 * Why a paid run cannot settle under v1, in the words every v1 surface uses.
 * Plain on purpose: the buyer needs the consequence, not the defect number.
 */
export const V1_CANNOT_SETTLE =
  "On this deployment the escrow cannot yet complete a payment (a known defect; the fix is deployed separately), so a paid run reports its settlement as failed and nothing is charged.";
