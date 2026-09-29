/**
 * The SOW §6.2 checklist summary, derived from the items and never stored.
 *
 * The Ambassador Chapter Lead ticks one box per deliverable: Evidence
 * Present, Partial or Missing. The page suggests a box from the items' own
 * statuses, by one rule stated in words beside it, and says the reviewer
 * decides. Because the suggestion is computed here, the index cannot claim a
 * marking its items do not support.
 */

import { SOW_6_1 } from "./sow.mjs";
import type {
  DeliverableId,
  EvidenceDeliverable,
  EvidenceItem,
  EvidenceMetric,
  ItemStatus,
} from "./types";

export type Marking = ItemStatus;

/** The rule, in the words the page shows. */
export const DERIVATION_RULE =
  "If every item is present, the suggestion is Present. If at least one item is present or partial, it is Partial. If none is, it is Missing.";

/**
 * All present → present; any present or partial → partial; none → missing.
 * A deliverable with no items has nothing present, so it is missing.
 */
export function suggestMarking(
  items: readonly Pick<EvidenceItem, "status">[],
): Marking {
  if (items.length > 0 && items.every((i) => i.status === "present")) {
    return "present";
  }
  if (items.some((i) => i.status === "present" || i.status === "partial")) {
    return "partial";
  }
  return "missing";
}

export type StatusCounts = Record<ItemStatus, number>;

export function countStatuses(
  items: readonly Pick<EvidenceItem, "status">[],
): StatusCounts {
  const counts: StatusCounts = { present: 0, partial: 0, missing: 0 };
  for (const item of items) counts[item.status] += 1;
  return counts;
}

/** "2 present, 1 partial, 0 missing (of 3)". */
export function describeCounts(counts: StatusCounts): string {
  const total = counts.present + counts.partial + counts.missing;
  return `${counts.present} present, ${counts.partial} partial, ${counts.missing} missing (of ${total})`;
}

/** The §6.2 checklist's own name for a row: "Deliverable 1" … "Repositories & Deployments". */
export function checklistRowName(id: DeliverableId): string {
  return SOW_6_1.find((row) => row.id === id)?.row ?? id;
}

export type ChecklistRow = {
  id: DeliverableId;
  row: string;
  name: string;
  marking: Marking;
  counts: StatusCounts;
};

export function checklistRows(
  deliverables: readonly EvidenceDeliverable[],
): ChecklistRow[] {
  return deliverables.map((d) => ({
    id: d.id,
    row: checklistRowName(d.id),
    name: d.name,
    marking: suggestMarking(d.items),
    counts: countStatuses(d.items),
  }));
}

/** How many of the metrics met their target. */
export function metCount(metrics: readonly Pick<EvidenceMetric, "status">[]) {
  return metrics.filter((m) => m.status === "met").length;
}
