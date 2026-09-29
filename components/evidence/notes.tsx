/**
 * "Notes": context a reviewer needs to read the numbers right, such as the
 * asset the testnet settles in or which SOW version's targets apply. Nothing
 * is drawn when the index has none.
 */

import type { EvidenceNote } from "@/lib/evidence/types";

export function Notes({ notes }: { notes: EvidenceNote[] }) {
  if (notes.length === 0) return null;
  return (
    <section aria-labelledby="notes">
      <h2
        id="notes"
        className="text-2xl font-semibold tracking-tight text-text"
      >
        Notes
      </h2>
      <ul className="mt-5 space-y-5">
        {notes.map((n) => (
          <li key={n.id} data-note={n.id} className="break-inside-avoid">
            <h3 className="font-semibold text-text">{n.title}</h3>
            <p className="mt-1 leading-relaxed text-text/90">{n.text}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
