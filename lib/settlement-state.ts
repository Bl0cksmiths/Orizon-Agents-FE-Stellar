/**
 * Reading the backend's machine-readable settlement state, in one place.
 *
 * Two surfaces receive it — the receipt read (`GET /tasks/{id}/disputes`,
 * `settlement_state`) and the trace (`TraceLine.settlement`, on the one line
 * that reports a paid run's outcome) — and they must never disagree about a
 * word neither has seen before.
 */

import {
  SETTLEMENT_STATES,
  type SettlementState,
  type TraceLine,
} from "./types";

const KNOWN: ReadonlySet<string> = new Set(SETTLEMENT_STATES);

/**
 * The state as this build can use it: absent stays absent (a backend that
 * predates the field), null stays null (a run that asked for no settlement),
 * and a string this build cannot name reads as `unconfirmed` — the answer
 * that claims least. Nothing shown as paid, nothing as failed, nothing as
 * returned. Dropping it would fall back to the pre-v2 reading, in which a
 * receipt on record is a confirmed charge.
 */
export function readSettlementState(
  v: string | null | undefined,
): SettlementState | null | undefined {
  if (v === undefined || v === null) return v;
  return KNOWN.has(v) ? (v as SettlementState) : "unconfirmed";
}

/**
 * What the trace says happened to the run's money: the last line that
 * reports it, or undefined while none has (a run still going, a simulated
 * run, or a backend that predates the field).
 */
export function traceSettlementState(
  lines: readonly TraceLine[],
): SettlementState | undefined {
  for (let i = lines.length - 1; i >= 0; i--) {
    const state = readSettlementState(lines[i].settlement);
    if (state !== undefined && state !== null) return state;
  }
  return undefined;
}
