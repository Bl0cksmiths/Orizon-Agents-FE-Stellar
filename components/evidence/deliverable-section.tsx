/**
 * One deliverable, the way SOW §6.1 lists it: its name, the SOW's Evidence
 * Type and its Description quoted word for word, then each item. An item is
 * a claim in plain language, its status as an icon and a word, the links that
 * prove it, and, when it is partial or missing, why.
 */

import { SOW_VERSION } from "@/lib/evidence/sow.mjs";
import { suggestMarking } from "@/lib/evidence/checklist";
import { deliverableAnchor, deliverableHeading } from "@/lib/evidence/display";
import type { EvidenceDeliverable, EvidenceItem } from "@/lib/evidence/types";
import { EvidenceLinks } from "./evidence-links";
import { StatusBadge } from "./status-badge";

const term = "font-mono text-[11px] uppercase tracking-[0.2em] text-muted";

function Item({ item }: { item: EvidenceItem }) {
  const headingId = `item-${item.id.replace(/[^A-Za-z0-9-]/g, "-")}`;
  return (
    <li
      data-item={item.id}
      className="break-inside-avoid border border-border bg-surface/40 p-4 sm:p-5 print:border-black/40 print:bg-transparent"
    >
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <h4
          id={headingId}
          className="min-w-0 flex-1 basis-60 font-medium leading-snug text-text"
        >
          {item.claim}
        </h4>
        <StatusBadge status={item.status} prefix="Status:" />
      </div>
      <p className="mt-1 font-mono text-[11px] text-muted">
        <span className="sr-only">Item </span>
        {item.id}
      </p>
      <EvidenceLinks links={item.links} className="mt-3" />
      {item.note && (
        <p className="mt-3 text-sm leading-relaxed text-text/90">
          <strong className="font-semibold text-text">
            {item.status === "present" ? "Note:" : "Why:"}
          </strong>{" "}
          {item.note}
        </p>
      )}
    </li>
  );
}

export function DeliverableSection({
  deliverable: d,
}: {
  deliverable: EvidenceDeliverable;
}) {
  const id = deliverableAnchor(d.id);
  return (
    <section aria-labelledby={id} className="scroll-mt-24">
      <h3
        id={id}
        className="text-xl font-semibold tracking-tight text-text sm:text-2xl"
      >
        {deliverableHeading(d.id, d.name)}
      </h3>
      <dl className="mt-4 space-y-3">
        <div>
          <dt className={term}>Evidence type (SOW §6.1)</dt>
          <dd className="mt-1 text-text">{d.evidence_type}</dd>
        </div>
        <div>
          <dt className={term}>What the SOW asks for (§6.1, quoted)</dt>
          <dd className="mt-1">
            <blockquote className="border-l-2 border-violet/70 bg-violet/10 px-4 py-3 leading-relaxed text-text/90 print:border-black print:bg-transparent">
              <p>“{d.sow_text}”</p>
              <footer className="mt-2 text-xs text-muted">
                SOW {SOW_VERSION}, §6.1, Description
              </footer>
            </blockquote>
          </dd>
        </div>
        <div>
          <dt className={term}>Suggested marking</dt>
          <dd className="mt-1">
            <StatusBadge status={suggestMarking(d.items)} />
          </dd>
        </div>
      </dl>
      <ol
        className="mt-5 space-y-3"
        aria-label={`Evidence items for ${deliverableHeading(d.id, d.name)}`}
      >
        {d.items.map((item) => (
          <Item key={item.id} item={item} />
        ))}
      </ol>
    </section>
  );
}
