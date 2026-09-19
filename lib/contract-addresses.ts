/**
 * Build-time fallback contract ids, and the rule for when one may be shown.
 *
 * These ids are DISPLAY-ONLY. The live contract id arrives from the backend
 * (`GET /stellar/reputation/params`), which reads it from the deployment's own
 * environment; that value is the runtime source of truth and must always win.
 * A constant compiled into the bundle can only ever be a guess about which
 * ledger the backend is pointed at, so every call site resolves it as
 * `params?.contract_id ?? fallbackReputationLedgerId(...)` and labels the
 * result unverified. Nothing here may be promoted above the backend read.
 *
 * What a stale value costs: not a wrong number — a dead explorer link. The
 * chip and the "view on stellar.expert" link would send an operator to a
 * contract that is not the one the system is using, which is the kind of wrong
 * that looks right.
 *
 * Why the ids live in a sibling JSON file rather than inline here: that file is
 * a mirror of the deploy scripts' address book in
 * `Bl0cksmiths/Orizon-Agents-Smart-Contract-Stellar` (`addresses.json` for
 * testnet, `addresses.mainnet.json` for mainnet), and
 * `scripts/check-contract-addresses.mjs` compares the two key by key in CI.
 * Keeping them as data means that guard is a plain JSON read with no
 * TypeScript toolchain in the loop, and means there is exactly ONE copy of
 * each id in this repo to go stale — the two components that render them used
 * to carry a copy each, which is the same drift this module exists to catch,
 * only inside one repo instead of across two.
 */

import addressBook from "./contract-addresses.json";

/**
 * The two segments stellar.expert publishes, as resolved by
 * `defaultExplorerNetwork` in `components/ui/stellar-link.tsx`. Deliberately
 * narrow: the backend legitimately reports "mainnet", but a fallback id is a
 * fact about THIS BUILD's network, never about what a backend replied, so the
 * only networks that can select one are the ones the build itself can be in.
 */
export type ExplorerNetwork = "public" | "testnet";

/** Mirror of the deployment address book, keyed by contract then by network. */
export const FALLBACK_CONTRACT_IDS: Readonly<
  Record<string, Readonly<Record<ExplorerNetwork, string>>>
> = addressBook;

/**
 * The ReputationLedger id to show when the backend has not told us one.
 *
 * Takes the network as an argument rather than reading `IS_MAINNET` itself so
 * the mapping from passphrase to explorer segment keeps a single owner
 * (`stellar-link.tsx`) and so this stays a pure function the suite can pin
 * both branches of.
 */
export function fallbackReputationLedgerId(network: ExplorerNetwork): string {
  return addressBook.reputation_ledger[network];
}
