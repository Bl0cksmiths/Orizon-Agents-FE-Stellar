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
 * Both stories are claimed only on positive evidence, never inferred from
 * the absence of a pin, so the copy stays honest whatever order the backend
 * and the frontend are switched in:
 *
 * - `v2`: a v2 escrow is pinned for this network AND the backend reports that
 *   same escrow. The only case in which custody is claimed.
 * - `v1`: the backend reports escrow v1's own id (`v1EscrowId`, mirrored from
 *   the address book and checked in CI).
 * - `unknown`: anything else — the network read has not answered or failed,
 *   or the backend reports an escrow that is neither the pinned v2 nor v1
 *   (for example v2 before this build pins it). Copy then claims neither
 *   custody nor its absence. A pinned build facing another escrow also keeps
 *   the plan card's mismatch guard, which pauses Authorize.
 */

import { defaultExplorerNetwork } from "@/components/ui/stellar-link";
import { v1EscrowId } from "./contract-addresses";
import { pinnedEscrowId } from "./escrow-address";
import type { StellarNetworkInfo } from "./types";

export type EscrowGeneration = "v1" | "v2" | "unknown";

/**
 * The generation of the escrow `live` names, given this build's v2 pin and
 * escrow v1's id. Pure, so each case can be pinned by the suite.
 */
export function generationOf(
  live: string | null | undefined,
  pinnedV2: string | null,
  v1Id: string,
): EscrowGeneration {
  if (!live) return "unknown";
  if (pinnedV2 !== null && live === pinnedV2) return "v2";
  if (live === v1Id) return "v1";
  return "unknown";
}

/**
 * The generation of the escrow behind `network` (the `GET /stellar/network`
 * read), for this build's own network. `unknown` until the read answers.
 */
export function escrowGeneration(
  network: StellarNetworkInfo | null | undefined,
): EscrowGeneration {
  return generationOf(
    network?.contracts.payment_escrow,
    pinnedEscrowId(defaultExplorerNetwork),
    v1EscrowId(defaultExplorerNetwork),
  );
}

/**
 * Why a paid run cannot settle under v1, in the words every v1 surface uses.
 * Plain on purpose: the buyer needs the consequence, not the defect number.
 */
export const V1_CANNOT_SETTLE =
  "On this deployment the escrow cannot yet complete a payment (a known defect; the fix is deployed separately), so a paid run reports its settlement as failed and nothing is charged.";
