/**
 * The top of the evidence page: what it is, as of when, on which network,
 * against which SOW, and how to use it without running anything.
 */

import { formatDate } from "@/lib/evidence/display";
import type { EvidenceIndex } from "@/lib/evidence/types";

const term = "font-mono text-[10px] uppercase tracking-[0.25em] text-muted";
const value = "mt-1 text-sm text-text";

export function EvidenceHeader({ index }: { index: EvidenceIndex }) {
  return (
    <header>
      <p className="mb-4 inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.3em] text-cyan print:text-black">
        <span aria-hidden="true" className="h-px w-8 bg-cyan/60" />
        Evidence
      </p>
      <h1 className="text-3xl font-semibold leading-tight tracking-tight text-text sm:text-4xl">
        {index.title}
      </h1>
      <dl className="mt-6 flex flex-wrap gap-x-10 gap-y-4">
        <div>
          <dt className={term}>As of</dt>
          <dd className={value} data-as-of>
            <time dateTime={index.snapshot.as_of}>
              {formatDate(index.snapshot.as_of)}
            </time>
          </dd>
        </div>
        <div>
          <dt className={term}>Network</dt>
          <dd className={value}>Stellar {index.snapshot.network}</dd>
        </div>
        <div>
          <dt className={term}>SOW</dt>
          <dd className={value}>
            {index.sow.version}, dated{" "}
            <time dateTime={index.sow.date}>{formatDate(index.sow.date)}</time>
          </dd>
        </div>
      </dl>
      <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted">
        {index.sow.note}
      </p>

      <section
        aria-labelledby="how-to-use"
        className="mt-8 border border-border bg-surface/40 p-5 print:border-black/40 print:bg-transparent"
      >
        <h2 id="how-to-use" className="text-lg font-semibold text-text">
          How to use this page
        </h2>
        <p className="mt-2 leading-relaxed text-text/90">
          Each row below shows a claim and the links that prove it; click a link
          to see the proof on Stellar Expert, the public ledger explorer, or on
          the page it names. You do not need an account, a wallet or any
          software. Start with the checklist summary, which suggests a marking
          for each deliverable, then open that deliverable&rsquo;s items to
          check them yourself.
        </p>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          How this snapshot was taken: {index.snapshot.method}
        </p>
      </section>
    </header>
  );
}
