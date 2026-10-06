"use client";
/**
 * The receipt's reconciliation: what the plan priced each step at, what the
 * settlement charged for it, and what went back to the buyer — with totals
 * that add up, to the stroop, and the transaction that did it.
 *
 * Its own chunk (receipt-panel loads it on demand): only a settled escrow v2
 * receipt draws it, and the trace route sits at its first-load budget.
 *
 * Presentational: `reconcileSettlement` decided every figure and every check;
 * this only lays them out. Amounts in the cells carry no unit — the caption
 * names it once — so four columns of figures still fit a 360px screen.
 */
import { useId } from "react";

import { StellarExpertLink } from "@/components/ui/stellar-link";
import { assetLabel, formatStroops, stroopsToDecimal } from "@/lib/money";
import type { Reconciliation } from "@/lib/reconcile";
import { cn } from "@/lib/utils";
import { useAmountAsset } from "./amount-asset";

export function ReconciliationTable({ recon }: { recon: Reconciliation }) {
  const headingId = useId();
  const networkAsset = useAmountAsset();
  const asset = recon.asset ?? networkAsset;
  const unit = assetLabel(asset);
  const decimals = recon.asset?.decimals ?? undefined;
  const figure = (v: bigint) => stroopsToDecimal(v, decimals);
  const amount = (v: bigint) => formatStroops(v, asset);
  // What a cell says when the record does not establish a figure: a price
  // too old to have been kept, a return a failed settlement still holds, or
  // anything else not confirmed yet.
  const unknown = (column: "planned" | "charged" | "returned") =>
    column === "planned"
      ? "not recorded"
      : recon.held && column === "returned"
        ? "held"
        : "pending";
  const cell = (
    v: bigint | null,
    column: "planned" | "charged" | "returned",
  ) =>
    v === null ? (
      <span className="text-muted">{unknown(column)}</span>
    ) : (
      figure(v)
    );

  const num = "px-2 py-2 text-right font-mono tabular-nums";
  return (
    <section
      aria-labelledby={headingId}
      className="space-y-3 border-t border-border/60 pt-5"
    >
      <h3
        id={headingId}
        className="font-mono text-[11px] uppercase tracking-widest text-cyan"
      >
        Reconciliation
      </h3>
      {/* Scrolls on its own if a figure is ever wider than a phone: the page
          clips horizontal overflow rather than scrolling it. Focusable so a
          keyboard can scroll it too. */}
      <div
        className="-mx-1 overflow-x-auto px-1"
        role="region"
        aria-label="Reconciliation figures"
        tabIndex={0}
      >
        <table className="w-full min-w-[18rem] border-collapse text-xs">
          <caption className="pb-2 text-left text-xs leading-relaxed text-muted">
            Planned, charged and returned per step
            {unit ? `, in ${unit}` : ""}.
          </caption>
          <thead>
            <tr className="border-b border-border/60 font-mono text-[10px] uppercase tracking-widest text-muted">
              <th scope="col" className="px-2 py-2 text-left font-normal">
                Step
              </th>
              <th scope="col" className={cn(num, "font-normal")}>
                Planned
              </th>
              <th scope="col" className={cn(num, "font-normal")}>
                Charged
              </th>
              <th scope="col" className={cn(num, "font-normal")}>
                Returned
              </th>
            </tr>
          </thead>
          <tbody>
            {recon.rows.map((r) => (
              <tr
                key={r.stepIndex}
                className={cn(
                  "border-b border-border/30",
                  r.balanced === false && "bg-magenta/5",
                )}
              >
                <th
                  scope="row"
                  className="px-2 py-2 text-left font-normal [overflow-wrap:anywhere]"
                >
                  {r.stepIndex + 1} · {r.agent}
                  {!r.delivered && (
                    <span className="text-muted"> · not delivered</span>
                  )}
                </th>
                <td className={num}>{cell(r.planned, "planned")}</td>
                <td className={num}>{cell(r.charged, "charged")}</td>
                <td className={num}>{cell(r.returned, "returned")}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="font-semibold text-text">
              <th scope="row" className="px-2 py-2 text-left">
                Total
              </th>
              <td className={num}>{cell(recon.planned, "planned")}</td>
              <td className={num}>{cell(recon.charged, "charged")}</td>
              <td className={num}>{cell(recon.returned, "returned")}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {recon.balanced === false ? (
        <div
          role="alert"
          className="clip-cyber-sm border border-magenta/40 bg-magenta/5 px-4 py-3 text-xs leading-relaxed text-magenta"
        >
          <p>These figures do not add up:</p>
          <ul className="mt-1 list-disc pl-5">
            {recon.issues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-xs leading-relaxed text-muted">
          {recon.balanced === true
            ? "Charged plus returned equals planned, to the stroop."
            : recon.held
              ? "Nothing was charged. The rest is still held in escrow until the platform returns it or the payer reclaims it after expiry."
              : "Charges and returns are shown once the settlement confirms."}
          {recon.headroom !== null && recon.headroom > 0n
            ? ` The escrow also returned ${amount(recon.headroom)} authorized above the plan's price.`
            : null}
        </p>
      )}

      {(recon.authorized !== null || recon.settleTx) && (
        <p className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[11px] text-muted">
          {recon.authorized !== null && (
            <span>Authorized {amount(recon.authorized)}</span>
          )}
          {recon.settleTx && (
            <StellarExpertLink
              kind="tx"
              id={recon.settleTx}
              className="inline-flex min-h-6 items-center gap-[1ch]"
            >
              view the settlement that paid and returned on stellar.expert
              <span aria-hidden="true"> ▸</span>
            </StellarExpertLink>
          )}
        </p>
      )}
    </section>
  );
}
