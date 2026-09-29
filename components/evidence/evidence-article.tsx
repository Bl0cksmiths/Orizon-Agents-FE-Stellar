/**
 * The whole /evidence page (story 5.05): one index linking every claim in
 * the SOW to its proof, for a reviewer who is not a developer.
 *
 * In order: the header and how to use the page; the §6.2 checklist summary,
 * derived from the items; one section per §6.1 deliverable; the eleven §6.3
 * metrics; the disclosures; the notes; and where else to look. Everything is
 * server-rendered from the build-time index, so it reads in full with
 * JavaScript off, and it prints as a clean evidence pack (see print.css).
 */

import type { EvidenceIndex } from "@/lib/evidence/types";
import { ChecklistSummary } from "./checklist-summary";
import { DeliverableSection } from "./deliverable-section";
import { Disclosures } from "./disclosures";
import { EvidenceHeader } from "./evidence-header";
import { MetricsTable } from "./metrics-table";
import { Notes } from "./notes";
import { WhereElse } from "./where-else";

export function EvidenceArticle({ index }: { index: EvidenceIndex }) {
  return (
    <article
      data-evidence-page
      className="mx-auto max-w-4xl space-y-16 px-4 pb-24 pt-28 sm:px-6 print:max-w-none print:space-y-10 print:px-0 print:pb-0 print:pt-0"
    >
      <EvidenceHeader index={index} />
      <ChecklistSummary deliverables={index.deliverables} />
      <section aria-labelledby="deliverables" className="space-y-12">
        <div>
          <h2
            id="deliverables"
            className="text-2xl font-semibold tracking-tight text-text"
          >
            Evidence by deliverable (SOW §6.1)
          </h2>
          <p className="mt-3 leading-relaxed text-muted">
            Each deliverable as the SOW lists it: its evidence type and
            description, quoted, then each item with its status and proof.
          </p>
        </div>
        {index.deliverables.map((d) => (
          <DeliverableSection key={d.id} deliverable={d} />
        ))}
      </section>
      <MetricsTable metrics={index.metrics} />
      <Disclosures disclosures={index.disclosures} />
      <Notes notes={index.notes} />
      <WhereElse />
    </article>
  );
}
