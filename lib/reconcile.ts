/**
 * A settled run's money, reconciled: for each step, what the plan priced it
 * at, what the settlement charged for it and what went back to the buyer —
 * and totals that must add up, to the stroop.
 *
 * The pricing contract (ADR 0015 on the backend): the buyer authorizes the
 * plan's total; each delivered step settles exactly its price; every step not
 * paid returns its price. So per step `planned = charged + returned`, and in
 * all `authorized = charged + returned` — where the escrow's return also
 * carries any authorization above the plan's price (the minimum cap a
 * zero-priced plan signs), shown as the authorization's headroom.
 *
 * Read from the backend's integer `*_stroops` fields where it sends them,
 * and otherwise from the legacy floats, converted exactly as the backend
 * converts them. A figure the record does not establish is null — shown as
 * not known — never a guessed zero: an unconfirmed settlement has charged
 * nothing yet and returned nothing yet, and a failed one still holds the
 * custody.
 */
import { agentLabel } from "./disputes";
import {
  knownAsset,
  parseStroops,
  unitsToStroops,
  type PlanAsset,
} from "./money";
import type {
  SettlementState,
  SettlementStepView,
  SettlementView,
} from "./types";

export type ReconRow = {
  /** 0-based, as the backend enumerates the plan. */
  stepIndex: number;
  agent: string;
  delivered: boolean;
  planned: bigint;
  /** Null while not established (unconfirmed, or a payout not reported). */
  charged: bigint | null;
  /** Null while not established, and while a failed settlement holds it. */
  returned: bigint | null;
  /** `charged + returned === planned`; null while either is unknown. */
  balanced: boolean | null;
};

export type Reconciliation = {
  rows: ReconRow[];
  planned: bigint;
  charged: bigint | null;
  returned: bigint | null;
  /** What the authorization moved into escrow, when the backend says. */
  authorized: bigint | null;
  /** What the escrow returned beyond the steps' own returns. */
  headroom: bigint | null;
  /** Every check passed; false with `issues` when one failed; null while
   *  the figures are not all known. */
  balanced: boolean | null;
  /** Each check that failed, in plain words. */
  issues: string[];
  /** A failed settlement: the custody is still held in escrow. */
  held: boolean;
  /** Every figure came from the exact `*_stroops` fields. */
  exact: boolean;
  /** The settlement's own asset, when it names one. */
  asset: PlanAsset | null;
  /** The transaction that paid the steps and returned the rest (escrow v2
   *  does both in its one `settle`). */
  settleTx: string | null;
};

const fromUnits = (v: number | null | undefined): bigint | null =>
  typeof v === "number" ? unitsToStroops(v) : null;

/** What the settlement paid this step, or null where it does not say. */
function paidOf(step: SettlementStepView): bigint | null {
  return parseStroops(step.paid_stroops) ?? fromUnits(step.paid_usdc);
}

/** Whether the record is escrow v2's: it reports per-step payouts or the
 *  exact figures. A v1 settlement charged one total and holds no custody,
 *  so it has nothing to reconcile step by step. */
function isPerStep(s: SettlementView): boolean {
  return (
    s.steps.some(
      (x) =>
        (x.paid_usdc !== undefined && x.paid_usdc !== null) ||
        parseStroops(x.paid_stroops) !== null ||
        parseStroops(x.returned_stroops) !== null,
    ) ||
    parseStroops(s.authorized_stroops) !== null ||
    parseStroops(s.returned_stroops) !== null
  );
}

const sum = (xs: (bigint | null)[]): bigint | null =>
  xs.every((x): x is bigint => x !== null)
    ? xs.reduce((a, b) => a + b, 0n)
    : null;

export function reconcileSettlement(
  settlement: SettlementView,
  state: SettlementState | null | undefined,
): Reconciliation | null {
  if (state !== "released" && !isPerStep(settlement)) return null;
  // A backend with no state wrote this record only for a confirmed charge.
  const phase = state ?? "settled";

  let exact = true;
  const rows: ReconRow[] = [...settlement.steps]
    .sort((a, b) => a.step_index - b.step_index)
    .map((step) => {
      const exactPrice = parseStroops(step.price_stroops);
      if (exactPrice === null) exact = false;
      const planned = exactPrice ?? fromUnits(step.price_usdc) ?? 0n;
      let charged: bigint | null;
      let returned: bigint | null;
      switch (phase) {
        case "unconfirmed":
          charged = null;
          returned = null;
          break;
        case "failed":
          charged = 0n;
          returned = null;
          break;
        case "released":
        case "skipped":
          charged = 0n;
          returned = planned;
          break;
        case "settled": {
          charged = paidOf(step);
          const exactReturn = parseStroops(step.returned_stroops);
          if (parseStroops(step.paid_stroops) === null || exactReturn === null)
            exact = false;
          returned =
            exactReturn ?? (charged === null ? null : planned - charged);
          break;
        }
      }
      return {
        stepIndex: step.step_index,
        agent: agentLabel(step),
        delivered: step.delivered,
        planned,
        charged,
        returned,
        balanced:
          charged === null || returned === null
            ? null
            : charged >= 0n && returned >= 0n && charged + returned === planned,
      };
    });

  const planned = rows.reduce((a, r) => a + r.planned, 0n);
  const charged = sum(rows.map((r) => r.charged));
  const returned = sum(rows.map((r) => r.returned));
  const authorized = parseStroops(settlement.authorized_stroops);
  const reportedCharged =
    parseStroops(settlement.settled_stroops) ??
    fromUnits(settlement.settled_usdc);
  const reportedReturned =
    parseStroops(settlement.returned_stroops) ??
    fromUnits(settlement.returned_usdc);

  const issues: string[] = [];
  for (const r of rows) {
    if (r.balanced === false)
      issues.push(`step ${r.stepIndex + 1}: charged + returned ≠ planned`);
  }
  if (phase === "settled" && charged !== null && reportedCharged !== null) {
    if (charged !== reportedCharged)
      issues.push("the steps' charges do not sum to the settlement's total");
  }
  let headroom: bigint | null = null;
  if (returned !== null && reportedReturned !== null && phase !== "failed") {
    headroom = reportedReturned - returned;
    if (headroom < 0n)
      issues.push("the escrow returned less than the steps' returns");
  }
  if (
    authorized !== null &&
    charged !== null &&
    reportedReturned !== null &&
    phase !== "failed" &&
    authorized !== charged + reportedReturned
  ) {
    issues.push("charged + returned ≠ authorized");
  }
  if (authorized !== null && authorized < planned) {
    issues.push("the authorization is smaller than the plan");
  }

  const known = charged !== null && returned !== null;
  return {
    rows,
    planned,
    charged,
    returned,
    authorized,
    headroom: headroom !== null && headroom >= 0n ? headroom : null,
    balanced: issues.length > 0 ? false : known ? true : null,
    issues,
    held: phase === "failed",
    exact,
    asset: knownAsset(settlement.asset),
    settleTx: settlement.charge_tx,
  };
}
