/**
 * Formatting settled value, and being honest about what it is.
 *
 * There was no shared money formatter: prices used `toFixed(3)` in one place,
 * spend used it in another, and `STROOPS_PER_USDC` was re-declared locally. A
 * dashboard that reports settled value needs one definition.
 */

/** Soroban i128 amounts are integer stroops; 1 unit = 10^7 stroops. */
export const STROOPS_PER_UNIT = 10_000_000;

export function stroopsToUnits(stroops: number): number {
  return stroops / STROOPS_PER_UNIT;
}

/**
 * The asset the configured SAC actually wraps.
 *
 * On testnet this is the NATIVE asset — the SAC reports `name` and `symbol` of
 * "native" — so a figure labelled "USDC" would be wrong. The network route
 * reports the truth in its `asset` field; callers pass it through rather than
 * hard-coding a currency that is only correct on mainnet.
 */
export function assetLabel(asset: string | null | undefined): string {
  if (!asset) return "";
  return asset === "native" ? "XLM" : asset.toUpperCase();
}

/** A settled amount with its real unit. Never invents a currency. */
export function formatSettled(
  stroops: number,
  asset: string | null | undefined,
): string {
  const label = assetLabel(asset);
  return `${stroopsToUnits(stroops).toFixed(7).replace(/0+$/, "").replace(/\.$/, ".0")}${label ? ` ${label}` : ""}`;
}
