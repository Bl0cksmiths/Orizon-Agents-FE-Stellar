/**
 * What the badges on the code blocks mean, said once on the page in full
 * sentences, rather than in tooltips that touch and keyboard users never see.
 */

import { VERIFY_MODES } from "@/lib/guide/fence";
import { VERIFY_TEXT } from "@/lib/guide/display";

export function VerifyLegend() {
  return (
    <section
      aria-labelledby="guide-legend-heading"
      className="border border-border bg-surface/40 px-5 py-4"
    >
      <h2
        id="guide-legend-heading"
        className="font-mono text-[10px] uppercase tracking-[0.3em] text-cyan"
      >
        Reading the code blocks
      </h2>
      <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-[auto_1fr] sm:gap-x-4">
        {VERIFY_MODES.map((mode) => (
          <div key={mode} className="contents">
            <dt className="font-mono text-xs text-text">
              {VERIFY_TEXT[mode].label}
            </dt>
            <dd className="text-muted">{VERIFY_TEXT[mode].explanation}</dd>
          </div>
        ))}
        <div className="contents">
          <dt className="font-mono text-xs text-text">Expected response</dt>
          <dd className="text-muted">
            What the sample above it prints when it works. Your ids and times
            will differ.
          </dd>
        </div>
      </dl>
      <p className="mt-3 text-sm text-muted">
        Each block has a Copy button and a # link you can share.
      </p>
    </section>
  );
}
