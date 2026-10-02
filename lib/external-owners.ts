/**
 * External agents and operator wallets, derived from the registry's owners
 * by the backend's own adoption rule. The interim path for the hero: the
 * measured overview's `agents.external` and `operators.external_wallets` are
 * preferred, and this runs only when the overview cannot supply them (a
 * legacy backend, or an overview snapshot older than the registry read).
 *
 * The rule, from app/services/adoption_svc.py on the backend's main
 * (`onchain_mirror`, `OwnerRule.classify`, `_external` in
 * app/routers/metrics.py):
 *   - only on-chain agents count, and never one in the seeded catalog's
 *     `agt_` namespace, whatever the registry holds under it;
 *   - an agent with no known owner is not counted (and leaves the count
 *     possibly low, so the derivation reports it);
 *   - an owner is external only when it is in NEITHER the committed team
 *     register NOR the keys the deployment holds at runtime.
 *
 * THE REGISTER IS VENDORED (lib/team-wallets.json, a byte-identical copy of
 * the backend's app/data/team_wallets.json) rather than fetched from raw
 * GitHub at render time. A fetch would add a third-party dependency to every
 * regeneration, and any blip in it would leave the hero stale for nothing;
 * GitHub's main can also run ahead of what Render has deployed. The copy's
 * risk is drift — a wallet added on the backend and not here would be
 * counted as external — so refresh it whenever the backend's changes, and
 * note this path only runs when the overview cannot answer.
 *
 * The runtime keys come from what the backend publishes: `admin` and
 * `dispatch_signer` from GET /api/stellar/network, and the signing key
 * (`ratings.signer`, `ratings.scorer`) from GET /readiness. The escrow's
 * settler and the registry's admin, which the backend reads from the chain,
 * are not published; on the live deployment they are the signing key and
 * the admin, both in the register.
 */

import type { Agent } from "./types";
import register from "./team-wallets.json";

/** The seeded catalog's namespace: never an operator's. */
export const SEEDED_PREFIX = "agt_";

/** Every address in the committed team register. */
export const TEAM_WALLETS: ReadonlySet<string> = new Set(
  register.wallets.map((w) => w.address),
);

export type ExternalOwners = {
  external: number;
  operatorWallets: number;
  /** On-chain agents with no known owner, which the rule cannot place. */
  unowned: number;
};

/** The adoption rule over a registry read. `ours` is the register plus the
 * deployment's runtime keys. */
export function deriveExternalOwners(
  agents: readonly Agent[],
  ours: ReadonlySet<string>,
): ExternalOwners {
  const onchain = agents.filter(
    (a) => a.source === "onchain" && !a.id.startsWith(SEEDED_PREFIX),
  );
  const external = onchain.filter((a) => a.owner && !ours.has(a.owner));
  return {
    external: external.length,
    operatorWallets: new Set(external.map((a) => a.owner)).size,
    unowned: onchain.filter((a) => !a.owner).length,
  };
}

const str = (v: unknown): v is string => typeof v === "string" && v !== "";
const rec = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null;

/**
 * The register plus the runtime keys the backend publishes, or null when the
 * network read does not name its admin: an owner that might be ours cannot
 * be ruled out, so nothing may be counted as external. The readiness read is
 * best effort — the signing key it names is in the register as well.
 */
export function ourKeys(
  network: unknown,
  readiness: unknown,
  team: ReadonlySet<string> = TEAM_WALLETS,
): Set<string> | null {
  if (!rec(network) || !str(network.admin)) return null;
  const keys = new Set(team);
  keys.add(network.admin);
  if (str(network.dispatch_signer)) keys.add(network.dispatch_signer);
  const ratings = rec(readiness) ? readiness.ratings : null;
  if (rec(ratings)) {
    if (str(ratings.signer)) keys.add(ratings.signer);
    if (str(ratings.scorer)) keys.add(ratings.scorer);
  }
  return keys;
}
