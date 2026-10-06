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
 * Read from the backend's exact amounts (`planned`, `charged`, `returned`
 * per step and the settlement's `totals`) where it sends them, and otherwise
 * from the legacy floats, converted exactly as the backend converts them. A figure the record does not establish is null — shown as
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
  WireAmount,
} from "./types";

export type ReconRow = {
  /** 0-based, as the backend enumerates the plan. */
  stepIndex: number;
  agent: string;
  delivered: boolean;
  /** Null on a record too old to have kept the plan's price for it. */
  planned: bigint | null;
  /** Null while not established (unconfirmed, or a payout not reported). */
  charged: bigint | null;
  /** Null while not established, and while a failed settlement holds it. */
  returned: bigint | null;
  /** `charged + returned === planned`; null while any is unknown. */
  balanced: boolean | null;
  /** A delivered step the backend says it could not pay because its agent
   *  has no on-chain owner (`unpaid_reason: "no_onchain_owner"`): its price
   *  went back to the buyer. Only ever the backend's word — never inferred
   *  from the agent being built-in, since built-in agents are being given an
   *  on-chain owner. */
  builtInUnpaid: boolean;
};

export type Reconciliation = {
  rows: ReconRow[];
  planned: bigint | null;
  charged: bigint | null;
  returned: bigint | null;
  /** What the authorization moved into escrow, when the backend says. */
  authorized: bigint | null;
  /** What the escrow returned beyond the steps' own returns: the part of
   *  the authorization above the plan's price (`totals.surplus`). */
  headroom: bigint | null;
  /** Every check passed; false with `issues` when one failed; null while
   *  the figures are not all known. */
  balanced: boolean | null;
  /** Each check that failed, in plain words. */
  issues: string[];
  /** A failed settlement: the custody is still held in escrow. */
  held: boolean;
  /** A confirmed settlement that charged nothing, where every step whose
   *  price came back carries `no_onchain_owner`: the whole authorization went
   *  back to the buyer, as built — not a failure. */
  allReturnedBuiltIn: boolean;
  /** Every figure came from the backend's exact amounts. */
  exact: boolean;
  /** The settlement's own asset, when it names one. */
  asset: PlanAsset | null;
  /** The transaction that paid the steps and returned the rest (escrow v2
   *  does both in its one `settle`). */
  settleTx: string | null;
};

const fromUnits = (v: number | null | undefined): bigint | null =>
  typeof v === "number" ? unitsToStroops(v) : null;

/** An exact wire amount's stroops, or null. */
const exactOf = (a: WireAmount | null | undefined): bigint | null =>
  a ? parseStroops(a.stroops) : null;

/** Whether the backend sent the step's exact field at all (null included:
 *  a null it sent is its word that the figure is not known). */
const sent = (
  step: SettlementStepView,
  key: "planned" | "charged" | "returned",
) => step[key] !== undefined;

/**
 * The plan's price for a step. The exact `planned` when the backend sends it;
 * otherwise as the backend itself reads an older record: `price_usdc` is the
 * plan's price, except on a delivered v2 step that was paid nothing, where it
 * is the 0.0 credit basis — and that price is unknown, never a guessed zero.
 */
function plannedOf(step: SettlementStepView): bigint | null {
  if (sent(step, "planned")) return exactOf(step.planned);
  const paidNothingDelivered =
    step.paid_usdc !== undefined &&
    step.paid_usdc !== null &&
    step.delivered &&
    step.unpaid_reason != null;
  return paidNothingDelivered ? null : fromUnits(step.price_usdc);
}

/** What the settlement paid the step, or null where it does not say. */
function chargedOf(step: SettlementStepView): bigint | null {
  return sent(step, "charged")
    ? exactOf(step.charged)
    : fromUnits(step.paid_usdc);
}

/** Whether the record is escrow v2's: it reports per-step payouts or the
 *  run's totals. A v1 settlement charged one total and holds no custody,
 *  so it has nothing to reconcile step by step. */
function isPerStep(s: SettlementView): boolean {
  return (
    s.steps.some((x) => chargedOf(x) !== null) ||
    exactOf(s.totals?.authorized) !== null
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

  const rows: ReconRow[] = [...settlement.steps]
    .sort((a, b) => a.step_index - b.step_index)
    .map((step) => {
      const planned = plannedOf(step);
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
        case "settled":
          charged = chargedOf(step);
          returned = sent(step, "returned")
            ? exactOf(step.returned)
            : planned === null || charged === null
              ? null
              : planned - charged;
          break;
      }
      return {
        stepIndex: step.step_index,
        agent: agentLabel(step),
        delivered: step.delivered,
        planned,
        charged,
        returned,
        balanced:
          planned === null || charged === null || returned === null
            ? null
            : charged >= 0n && returned >= 0n && charged + returned === planned,
        builtInUnpaid:
          phase === "settled" &&
          step.delivered &&
          charged === 0n &&
          step.unpaid_reason === "no_onchain_owner",
      };
    });

  const planned = sum(rows.map((r) => r.planned));
  const charged = sum(rows.map((r) => r.charged));
  const returned = sum(rows.map((r) => r.returned));
  const totals = settlement.totals ?? null;
  const authorized = exactOf(totals?.authorized);
  const reportedPlanned = exactOf(totals?.planned);
  const reportedCharged =
    exactOf(totals?.charged) ?? fromUnits(settlement.settled_usdc);
  const reportedReturned =
    exactOf(totals?.returned) ?? fromUnits(settlement.returned_usdc);
  const surplus = exactOf(totals?.surplus);

  const issues: string[] = [];
  for (const r of rows) {
    if (r.balanced === false)
      issues.push(`step ${r.stepIndex + 1}: charged + returned ≠ planned`);
  }
  if (
    planned !== null &&
    reportedPlanned !== null &&
    planned !== reportedPlanned
  )
    issues.push("the steps' prices do not sum to the planned total");
  if (phase === "settled" && charged !== null && reportedCharged !== null) {
    if (charged !== reportedCharged)
      issues.push("the steps' charges do not sum to the settlement's total");
  }
  let headroom: bigint | null = surplus;
  if (returned !== null && reportedReturned !== null && phase !== "failed") {
    const beyond = reportedReturned - returned;
    if (beyond < 0n)
      issues.push("the escrow returned less than the steps' returns");
    else if (surplus !== null && beyond !== surplus)
      issues.push(
        "the return beyond the steps is not the authorization's surplus",
      );
    headroom = headroom ?? (beyond >= 0n ? beyond : null);
  }
  if (
    authorized !== null &&
    reportedCharged !== null &&
    reportedReturned !== null &&
    phase === "settled" &&
    authorized !== reportedCharged + reportedReturned
  ) {
    issues.push("charged + returned ≠ authorized");
  }
  if (authorized !== null && planned !== null && authorized < planned) {
    issues.push("the authorization is smaller than the plan");
  }

  const known = planned !== null && charged !== null && returned !== null;
  const exact =
    totals !== null &&
    settlement.steps.every(
      (x) => sent(x, "planned") && sent(x, "charged") && sent(x, "returned"),
    );
  return {
    rows,
    planned,
    charged,
    returned,
    authorized,
    headroom,
    balanced: issues.length > 0 ? false : known ? true : null,
    issues,
    held: phase === "failed",
    allReturnedBuiltIn:
      phase === "settled" &&
      charged === 0n &&
      rows.some((r) => r.builtInUnpaid) &&
      rows.every((r) => r.builtInUnpaid || r.returned === 0n),
    exact,
    asset: knownAsset(settlement.asset),
    settleTx: settlement.charge_tx,
  };
}
