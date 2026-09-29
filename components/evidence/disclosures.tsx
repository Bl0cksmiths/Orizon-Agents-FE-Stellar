/**
 * "Disclosures": what the evidence does not prove, and where the system as
 * built differs from the SOW, stated plainly. Each names its SOW section and,
 * where it applies, what changed since the SOW was approved.
 */

import type { EvidenceDisclosure } from "@/lib/evidence/types";

export function Disclosures({
  disclosures,
}: {
  disclosures: EvidenceDisclosure[];
}) {
  return (
    <section aria-labelledby="disclosures">
      <h2
        id="disclosures"
        className="text-2xl font-semibold tracking-tight text-text"
      >
        Disclosures
      </h2>
      <p className="mt-3 leading-relaxed text-muted">
        The limits of what this evidence shows, stated plainly.
      </p>
      <ul className="mt-5 space-y-4">
        {disclosures.map((d) => (
          <li
            key={d.id}
            data-disclosure={d.id}
            className="break-inside-avoid border-l-2 border-violet/70 bg-violet/10 px-4 py-4 sm:px-5 print:border-black print:bg-transparent"
          >
            <h3 className="font-semibold text-text">{d.title}</h3>
            <p className="mt-2 leading-relaxed text-text/90">{d.text}</p>
            {d.sow_ref && (
              <p className="mt-2 text-sm text-muted">
                SOW reference: {d.sow_ref}
              </p>
            )}
            {d.changed_since_sow && (
              <p className="mt-2 text-sm leading-relaxed text-text/90">
                <strong className="font-semibold text-text">
                  Changed since the SOW:
                </strong>{" "}
                {d.changed_since_sow}
              </p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
