"use client";

import { Card } from "@/components/ui/card";
import { KVRow } from "@/components/ui/kv-row";
import { SettlementBadge } from "@/components/ui/settlement-badge";
import { StellarExpertLink } from "@/components/ui/stellar-link";
import type { SettlementState } from "@/lib/types";

/**
 * The run's on-chain transactions — shown as EVIDENCE only once the backend
 * says the settlement confirmed (finding S7).
 *
 * A hash alone proves nothing: an older backend recorded the hash of a
 * settlement the ledger REJECTED as the run's `charge_tx`, and one that timed
 * out may never land. Linked under "On-chain receipts" either reads as proof
 * of payment. So a run whose settlement is anything but `settled` gets its
 * state instead, and a run whose state the backend never reported gets a
 * sentence saying so — never the links.
 */
export function OnChainReceipts({
  state,
  chargeTx,
  proofTx,
}: {
  state: SettlementState | undefined;
  chargeTx: string | null;
  proofTx: string | null;
}) {
  if (state === "settled") {
    return (
      <Card>
        <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-magenta mb-4">
          On-chain receipts
        </div>
        <dl className="space-y-3 text-sm font-mono">
          {chargeTx && <TxRow label="charge" hash={chargeTx} />}
          {proofTx && <TxRow label="seal" hash={proofTx} />}
        </dl>
      </Card>
    );
  }
  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-magenta">
          Settlement
        </span>
        {state !== undefined && <SettlementBadge state={state} />}
      </div>
      <p role="status" className="max-w-2xl text-xs leading-relaxed text-muted">
        {state === undefined
          ? "The backend has not reported how this run settled, so no transaction is shown here as evidence of payment."
          : `No transaction is shown here as evidence of payment: ${TRACE_SETTLEMENT_REASON[state]}`}
      </p>
    </Card>
  );
}

/** Why a run that did not settle has no receipts, by its state. */
const TRACE_SETTLEMENT_REASON: Record<
  Exclude<SettlementState, "settled">,
  string
> = {
  released:
    "nothing was delivered, so the settlement paid no agent and returned the whole authorization to the wallet that paid.",
  skipped: "nothing was delivered, so nothing was charged.",
  unconfirmed:
    "the settlement was sent but is not confirmed on-chain, and it may still land.",
  failed:
    "the settlement did not go through, so no agent was paid. Anything the authorization moved into escrow stays there until the platform releases it or the wallet that paid reclaims it after expiry.",
};

function TxRow({ label, hash }: { label: string; hash: string }) {
  return (
    <KVRow k={label}>
      <div className="break-all">{hash}</div>
      <StellarExpertLink kind="tx" id={hash} className="inline-block mt-1" />
    </KVRow>
  );
}
