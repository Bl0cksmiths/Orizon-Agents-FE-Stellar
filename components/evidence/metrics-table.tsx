/**
 * "Success metrics (SOW §6.3)": the eleven metrics with target, achieved
 * value, status and proof, and how many were met.
 *
 * A missed target is stated plainly with its reason, in the row itself, never
 * behind a tooltip or a toggle: a reviewer reading the table, or its printout,
 * sees why without doing anything.
 */

import { metricsHeadline } from "@/lib/evidence/checklist";
import type { EvidenceMetric } from "@/lib/evidence/types";
import { EvidenceLinks } from "./evidence-links";
import { EvidenceTable } from "./evidence-table";
import { StatusBadge } from "./status-badge";

export function MetricsTable({ metrics }: { metrics: EvidenceMetric[] }) {
  const headline = metricsHeadline(metrics);
  return (
    <section aria-labelledby="success-metrics">
      <h2
        id="success-metrics"
        className="text-2xl font-semibold tracking-tight text-text"
      >
        Success metrics (SOW §6.3)
      </h2>
      <p className="mt-3 text-lg font-semibold text-text" data-met-count>
        {headline}.
      </p>
      <p className="mt-1 leading-relaxed text-muted">
        Each target is the SOW&rsquo;s own. Where a target was missed, the
        reason is given in its row.
      </p>
      <EvidenceTable
        className="mt-5"
        caption={`SOW §6.3 success metrics: ${headline}. Target, achieved value, status and proof for each.`}
        columns={["Metric", "Target", "Achieved", "Status", "Proof"]}
        rows={metrics.map((m) => ({
          key: m.id,
          header: (
            <>
              <span className="block font-mono text-[10px] uppercase tracking-widest text-muted">
                {m.category}
              </span>
              <span className="mt-0.5 block">{m.metric}</span>
            </>
          ),
          cells: [
            <span key="target" className="whitespace-nowrap font-semibold">
              {m.target}
            </span>,
            <div key="achieved">
              <span className="block font-semibold text-text">
                {m.achieved}
              </span>
              <span className="mt-1 block text-xs leading-relaxed text-muted">
                How measured: {m.method}
              </span>
            </div>,
            <div key="status" data-metric-status={m.status}>
              <StatusBadge status={m.status} />
              {m.status === "not_met" && m.reason && (
                <p className="mt-2 text-sm leading-relaxed text-text/90">
                  <strong className="font-semibold text-text">Why:</strong>{" "}
                  {m.reason}
                </p>
              )}
              {m.status === "met" && m.reason && (
                <p className="mt-2 text-sm leading-relaxed text-text/90">
                  {m.reason}
                </p>
              )}
            </div>,
            <EvidenceLinks key="proof" links={m.links} />,
          ],
        }))}
      />
    </section>
  );
}
