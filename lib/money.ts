/**
 * Money, exactly: the one place an amount is read, converted and printed.
 *
 * Every amount the chain moves is a whole number of stroops (7 decimals), so
 * every amount here is a `bigint` of stroops from the moment it is read until
 * the moment it is printed. Nothing is summed, rounded or compared as a
 * float: `0.1 + 0.2` is not `0.3`, and a price list that adds up in binary
 * floating point can disagree with the cap the wallet signs by a stroop.
 *
 * The backend's integer fields (`price_stroops`, `total_stroops`) are read
 * with `parseStroops`. A backend that predates them sends only the legacy
 * float fields (`est_price_usdc`, `total_usdc`), which `unitsToStroops`
 * converts exactly as the backend's own `usdc_to_i128` does — so the figure
 * printed is the figure the backend will charge.
 */

/** Soroban i128 amounts are integer stroops; 1 unit = 10^7 stroops. */
export const STROOPS_PER_UNIT = 10_000_000;

/** The decimals of every Stellar asset amount (`Plan.asset.decimals`). */
export const STELLAR_DECIMALS = 7;

/**
 * Never fewer fractional digits than this, so an amount still reads like a
 * price ("0.180", not "0.18") — the backend's `money.format_amount` rule, so
 * a figure on the card and the same figure in the trace's prose match
 * character for character.
 */
export const MIN_DISPLAY_DECIMALS = 3;

/** The asset a plan's amounts are denominated in (`Plan.asset`). */
export type PlanAsset = {
  code: string;
  issuer?: string | null;
  decimals?: number;
};

/**
 * What a caller may know of an asset: the plan's own `asset`, the network
 * route's `asset` string ("native" on testnet), or nothing yet.
 */
export type AssetRef = PlanAsset | string | null | undefined;

export function stroopsToUnits(stroops: number): number {
  return stroops / STROOPS_PER_UNIT;
}

/**
 * A wire amount in stroops, or null when it is not a whole, non-negative
 * count. Accepts a JSON integer (safe-integer range only: past 2^53 a JSON
 * number has already lost stroops), a string of digits (any size — i128
 * amounts may be sent that way), or a bigint. A null result means "not
 * reported", never zero.
 */
export function parseStroops(v: unknown): bigint | null {
  if (typeof v === "bigint") return v >= 0n ? v : null;
  if (typeof v === "number") {
    return Number.isSafeInteger(v) && v >= 0 ? BigInt(v) : null;
  }
  if (typeof v === "string" && /^\d+$/.test(v)) return BigInt(v);
  return null;
}

/**
 * A legacy float amount in stroops, exactly as the backend converts it:
 * `round(amount * 10_000_000)` in Python, whose `round` sends an exact half
 * to the even neighbour (JavaScript's `Math.round` sends it up). The product
 * is the same IEEE double in both languages, so the result is the same
 * integer the backend checks and charges. Null for a figure that is not a
 * finite, non-negative amount the chain could hold.
 */
export function unitsToStroops(units: number): bigint | null {
  if (!Number.isFinite(units) || units < 0) return null;
  const scaled = units * STROOPS_PER_UNIT;
  if (scaled > Number.MAX_SAFE_INTEGER) return null;
  const floor = Math.floor(scaled);
  const frac = scaled - floor;
  const rounded =
    frac > 0.5
      ? floor + 1
      : frac < 0.5
        ? floor
        : floor % 2 === 0
          ? floor
          : floor + 1;
  return BigInt(rounded);
}

/**
 * A plain decimal string ("12.3456789", Horizon's balance format) in
 * stroops, read digit by digit with no float in between. Trailing zeros past
 * the asset's decimals are accepted; a finer figure is not an amount the
 * chain can hold, and reads as null rather than being rounded.
 */
export function decimalToStroops(
  s: string,
  decimals: number = STELLAR_DECIMALS,
): bigint | null {
  const m = /^(\d+)(?:\.(\d+))?$/.exec(s);
  if (!m) return null;
  const whole = m[1];
  let frac = m[2] ?? "";
  if (frac.length > decimals) {
    if (!/^0*$/.test(frac.slice(decimals))) return null;
    frac = frac.slice(0, decimals);
  }
  return BigInt(whole + frac.padEnd(decimals, "0"));
}

/**
 * Stroops as a plain decimal: every significant digit, trailing zeros
 * dropped, at least one fractional digit ("0.0", "1.29", "0.0000001").
 * Exact for any size. It is also the figure the authorize request sends,
 * since it reads back to the same stroops through the backend's rounding.
 */
export function stroopsToDecimal(
  stroops: bigint,
  decimals: number = STELLAR_DECIMALS,
): string {
  const negative = stroops < 0n;
  const digits = (negative ? -stroops : stroops)
    .toString()
    .padStart(decimals + 1, "0");
  const whole = digits.slice(0, digits.length - decimals);
  const frac = digits
    .slice(digits.length - decimals)
    .replace(/0+$/, "")
    .padEnd(Math.min(MIN_DISPLAY_DECIMALS, decimals), "0");
  return `${negative ? "-" : ""}${whole}${frac ? `.${frac}` : ""}`;
}

/**
 * The unit an amount is printed in.
 *
 * On testnet the escrow's SAC wraps the NATIVE asset — the network route says
 * "native", the plan's asset says `{code: "XLM", issuer: null}` — so a figure
 * labelled "USDC" would be wrong. Only an asset whose code IS USDC is called
 * USDC; the "usdc" in a wire field's name never is. Unknown → no label: a
 * bare number is honest, a guessed currency is not.
 */
export function assetLabel(asset: AssetRef): string {
  if (!asset) return "";
  const code = typeof asset === "string" ? asset : asset.code;
  if (!code) return "";
  return code.toLowerCase() === "native" ? "XLM" : code.toUpperCase();
}

/** The decimals an asset's amounts carry: the plan's word, or Stellar's 7. */
function decimalsOf(asset: AssetRef): number {
  const d = typeof asset === "object" && asset ? asset.decimals : undefined;
  return typeof d === "number" && Number.isInteger(d) && d >= 0 && d <= 18
    ? d
    : STELLAR_DECIMALS;
}

/**
 * THE amount formatter: exact stroops, in the asset's decimals, with its real
 * label — or bare while the asset is unknown. Every price, cap, payout and
 * return a buyer reads goes through here.
 */
export function formatStroops(stroops: bigint, asset: AssetRef): string {
  const label = assetLabel(asset);
  const figure = stroopsToDecimal(stroops, decimalsOf(asset));
  return label ? `${figure} ${label}` : figure;
}

/**
 * A settled amount with its real unit. Never invents a currency. Takes the
 * stroops as a bigint, or as a JSON integer from a route that serves them
 * that way; a number that is not one prints as a dash.
 */
export function formatSettled(
  stroops: number | bigint,
  asset: AssetRef,
): string {
  if (typeof stroops === "number" && !Number.isFinite(stroops)) return "—";
  const exact =
    typeof stroops === "bigint" ? stroops : BigInt(Math.trunc(stroops));
  return formatStroops(exact, asset);
}
