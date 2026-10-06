/**
 * Amounts in the backend's trace lines, read and shown in the network's asset.
 *
 * The backend writes every amount into its trace prose as "<n.nnn> USDC"
 * (app/services/execution_svc.py):
 *
 *   cost   "x402 payment → agt_09l5 :: 0.024 USDC (simulated)"
 *   cost   "x402 charge → 0.162 USDC settled · tx 1a2b3c4d5e…"
 *   cost   "x402 settle → 0.162 USDC paid to 3 operator payout(s), the rest released · tx …"
 *   cost   "x402 settle → nothing paid, custody released to the buyer · tx …"
 *   cost   "custody released to the buyer · tx …"
 *   cost   "dispute window open — any delivered step can be disputed until 2026-09-29 12:00 UTC"
 *   proof  "workflow sealed — 3 agents · 0.162 USDC · 4.21s"
 *   error  "charge 0.162 USDC exceeds cap 0.500 — skipping on-chain charge/seal"
 *
 * "USDC" there is the backend's field name talking (`est_price_usdc`,
 * `total_usdc`), not the asset: the figure is in stroops of whatever the
 * escrow's SAC wraps, and on testnet that is native XLM (friction F-022). So
 * the parser keys on the number beside an asset code and accepts either code
 * the backend could write, and the rendered line swaps the code for the
 * network's own label — or drops it while the asset is unknown. The backend's
 * text is otherwise shown as sent.
 */
import {
  assetLabel,
  decimalToStroops,
  formatStroops,
  parseStroops,
  unitsToStroops,
  type AssetRef,
} from "./money";
import type { TraceLine } from "./types";

/** An amount and the asset code the backend wrote after it. */
const AMOUNT = /(\d+\.\d+)\s+(?:USDC|XLM)\b/;
const AMOUNTS = new RegExp(AMOUNT.source, "g");

/** A cost line that reports a payment nobody made. */
export const isSimulatedLine = (l: TraceLine) => /\(simulated\)/.test(l.msg);

/** The amount one trace line reports, in stroops read digit by digit, or 0
 *  when it reports none (or one finer than a stroop, which no transfer
 *  could have carried). */
export function amountIn(msg: string): bigint {
  const m = msg.match(AMOUNT);
  return (m && decimalToStroops(m[1])) ?? 0n;
}

/**
 * What the trace says moved: the amounts on its cost lines, leaving out every
 * simulated one — summing those under "Spent" stated as paid a payment nobody
 * made. `simulatedOnly` is true when there were cost lines and every one of
 * them was simulated.
 */
export function traceSpend(lines: TraceLine[]): {
  /** In stroops, summed exactly. */
  spent: bigint;
  simulatedOnly: boolean;
} {
  const cost = lines.filter((l) => l.level === "cost");
  const real = cost.filter((l) => !isSimulatedLine(l));
  return {
    spent: real.reduce((acc, l) => acc + amountIn(l.msg), 0n),
    simulatedOnly: cost.length > 0 && real.length === 0,
  };
}

/**
 * A trace line's text with each amount's asset code replaced by the
 * network's label: "0.162 XLM" on testnet, "0.162" while the asset is
 * unknown. Everything else in the line is left exactly as the backend sent it.
 */
export function relabelAmounts(msg: string, asset: AssetRef): string {
  const unit = assetLabel(asset);
  return msg.replace(AMOUNTS, (_, n: string) => (unit ? `${n} ${unit}` : n));
}

/**
 * "Spent" as the trace summary and the task list print it, in the network's
 * asset and to the stroop. Takes the trace's exact sum, or a task row's
 * legacy float `spent`, converted as the backend converts it. A figure that
 * is not an amount prints as a dash, never as "NaN" or a negative charge.
 */
export function formatSpent(spent: bigint | number, asset: AssetRef): string {
  const stroops = typeof spent === "bigint" ? spent : unitsToStroops(spent);
  return stroops === null || stroops < 0n ? "—" : formatStroops(stroops, asset);
}

/** A task row's bill in stroops: the exact `spent_stroops` when the backend
 *  sends it, otherwise the legacy float converted as the backend converts
 *  it. Null when neither is an amount. */
export function taskSpent(t: {
  spent: number;
  spent_stroops?: number | string | null;
}): bigint | null {
  return parseStroops(t.spent_stroops) ?? unitsToStroops(t.spent);
}
