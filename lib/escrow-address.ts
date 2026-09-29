/**
 * The PaymentEscrow v2 contract this build is written for, per network.
 *
 * What the console says about paying under v2 — that authorizing moves the
 * cap into escrow NOW, that delivered steps are paid from it and the rest
 * comes back, that an unsettled authorization can be reclaimed — is false of
 * v1, whose `authorize` moves nothing and whose `charge` can never settle
 * (D-039). So the id is pinned, the copy says v2's story only when the pin
 * and the live escrow agree (lib/escrow-generation.ts), and the pin is
 * checked three ways:
 *
 * 1. `scripts/check-contract-addresses.mjs` (CI, and daily in drift.yml)
 *    compares it with the contract repo's address book (`payment_escrow`).
 * 2. `scripts/smoke-deploy.mjs` (post-deploy) compares it with the escrow the
 *    LIVE backend reports on `GET /api/stellar/network`.
 * 3. At runtime the plan card compares it with that same read and will not
 *    ask a buyer to sign against a different escrow (`escrowAgreement`).
 *
 * `null` means "no v2 escrow deployed on this network yet". It is the only
 * honest value until one is: an id is NEVER guessed here, and none of the
 * three checks can pass a guessed one. The switch that fills it in is written
 * down in docs/escrow-v2-switch.md.
 *
 * Kept as data beside `contract-addresses.json`, not in it: that file mirrors
 * ids that must exist on BOTH networks, and this one is legitimately null on
 * a network v2 has not reached.
 */

import pins from "./escrow-address.json";
import type { ExplorerNetwork } from "./contract-addresses";
import type { StellarNetworkInfo } from "./types";

const CONTRACT_ID = /^C[A-Z2-7]{55}$/;

/** The pinned escrow v2 id for this build's network, or null when none is. */
export function pinnedEscrowId(network: ExplorerNetwork): string | null {
  const pin: unknown = (pins as Record<string, unknown>)[network];
  return typeof pin === "string" && CONTRACT_ID.test(pin) ? pin : null;
}

/**
 * Whether the escrow the backend settles through is the one this build
 * describes.
 *
 * - `unknown`: the network read has not landed (or failed). Nothing is
 *   decided on it — the card's own states cover a failed read.
 * - `unpinned`: no v2 id is pinned for this network, so there is nothing to
 *   compare. Which story the copy tells is `escrowGeneration`'s to decide.
 * - `match` / `mismatch`: compared.
 */
export type EscrowAgreement =
  | { kind: "unknown" }
  | { kind: "unpinned" }
  | { kind: "match"; id: string }
  | { kind: "mismatch"; live: string | null; pinned: string };

export function escrowAgreement(
  network: StellarNetworkInfo | null | undefined,
  pinned: string | null,
): EscrowAgreement {
  if (!network) return { kind: "unknown" };
  if (pinned === null) return { kind: "unpinned" };
  const live = network.contracts.payment_escrow ?? null;
  return live === pinned
    ? { kind: "match", id: pinned }
    : { kind: "mismatch", live: live || null, pinned };
}
