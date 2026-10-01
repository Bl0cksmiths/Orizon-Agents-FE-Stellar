/**
 * "Checklist summary (SOW §6.2)": one row per checklist row, D1 to D4 and
 * Repositories & Deployments, each with a suggested box to tick.
 *
 * The suggestion is derived from the items below (lib/evidence/checklist.ts)
 * and the rule is printed beside it in words. The page only suggests: the
 * Chapter Lead decides, and the page says so before the table does.
 */

import Link from "next/link";
import {
  checklistRows,
  DERIVATION_RULE,
  describeCounts,
} from "@/lib/evidence/checklist";
import { deliverableAnchor } from "@/lib/evidence/display";
import type { EvidenceDeliverable } from "@/lib/evidence/types";
import { inlineLink } from "@/lib/ui";
import { cn } from "@/lib/utils";
import { EvidenceTable } from "./evidence-table";
import { StatusBadge } from "./status-badge";

export function ChecklistSummary({
  deliverables,
}: {
  deliverables: EvidenceDeliverable[];
}) {
  const rows = checklistRows(deliverables);
  return (
    <section aria-labelledby="checklist-summary" className="break-inside-avoid">
      <h2
        id="checklist-summary"
        className="text-2xl font-semibold tracking-tight text-text"
      >
        Checklist summary (SOW §6.2)
      </h2>
      <p className="mt-3 leading-relaxed text-text/90">
        For each deliverable, the Ambassador Chapter Lead marks the evidence
        Present, Partial or Missing.{" "}
        <strong className="font-semibold text-text">
          The Chapter Lead decides; this page only suggests a marking.
        </strong>
      </p>
      <p className="mt-2 leading-relaxed text-muted" data-derivation-rule>
        How the suggestion is worked out: {DERIVATION_RULE}
      </p>
      <EvidenceTable
        className="mt-5"
        caption="Suggested SOW §6.2 marking for each deliverable, worked out from its items below."
        columns={["Deliverable", "Suggested marking", "Items"]}
        rows={rows.map((r) => ({
          key: r.id,
          header: (
            <Link
              href={`#${deliverableAnchor(r.id)}`}
              className={cn(
                inlineLink,
                "[@media(pointer:coarse)]:inline-block [@media(pointer:coarse)]:py-3",
              )}
            >
              {r.row === r.name ? r.row : `${r.row}: ${r.name}`}
            </Link>
          ),
          cells: [
            <StatusBadge key="marking" status={r.marking} />,
            <span key="counts">{describeCounts(r.counts)}</span>,
          ],
        }))}
      />
    </section>
  );
}
