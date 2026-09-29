/**
 * The whole /litepaper page (story 5.06): the litepaper's cover facts, its
 * four files to read or download, a link straight to §6, what changed in this
 * version, and where its source lives.
 *
 * Everything comes from the build-time load (lib/litepaper/load.ts), so the
 * page is static, runs no script of its own, and reads in full with
 * JavaScript off. Each download link names the file's type and size, because
 * the web page alone is several megabytes.
 */

import { formatDate } from "@/lib/evidence/display";
import type { ArtifactFormat } from "@/lib/litepaper/source.mjs";
import { LITEPAPER_SOURCE_URL } from "@/lib/litepaper/display";
import type { Litepaper } from "@/lib/litepaper/load";
import { inlineLink } from "@/lib/ui";

const term = "font-mono text-[10px] uppercase tracking-[0.25em] text-muted";
const value = "mt-1 text-sm text-text";

/** What each file is for, beside its link. */
const USE: Record<ArtifactFormat, string> = {
  pdf: "For reading offline and printing.",
  html: "The whole book on one page, with its diagrams drawn in your browser.",
  docx: "For Word, Google Docs or LibreOffice.",
  md: "The bound book as plain text, the form it is written in.",
};

const KIND = { new: "New", corrected: "Corrected" } as const;

export function LitepaperArticle({ paper }: { paper: Litepaper }) {
  const html = paper.downloads.find((d) => d.format === "html")!;
  return (
    <article
      data-litepaper-page
      className="mx-auto max-w-3xl space-y-14 break-words px-4 pb-24 pt-28 sm:px-6"
    >
      <header>
        <p className="mb-4 inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.3em] text-cyan">
          <span aria-hidden="true" className="h-px w-8 bg-cyan/60" />
          Litepaper
        </p>
        <h1 className="text-3xl font-semibold leading-tight tracking-tight text-text sm:text-4xl">
          {paper.title}
        </h1>
        <dl className="mt-6 flex flex-wrap gap-x-10 gap-y-4">
          <div>
            <dt className={term}>Version</dt>
            <dd className={value} data-version>
              {paper.version}
            </dd>
          </div>
          <div>
            <dt className={term}>Dated</dt>
            <dd className={value} data-date>
              <time dateTime={paper.date}>{formatDate(paper.date)}</time>
            </dd>
          </div>
          <div>
            <dt className={term}>By</dt>
            <dd className={value}>The Blocksmiths</dd>
          </div>
        </dl>
        <p className="mt-6 leading-relaxed text-text/90">
          The litepaper is the builder&rsquo;s introduction to Orizon Agents, a
          protocol for pay-per-workflow agent commerce on Stellar: AI agents
          find each other in an open registry, are paid per step through an
          on-chain escrow, and have each job sealed on chain. It explains why
          the protocol exists, how the working implementation behaves today, who
          runs what and who can change what, and what is designed but not yet
          shipped. Its claims about shipped behaviour cite the source code they
          rest on, and the deployment it describes is on Stellar testnet.
        </p>
      </header>

      <section aria-labelledby="read">
        <h2
          id="read"
          className="text-2xl font-semibold tracking-tight text-text"
        >
          Read or download it
        </h2>
        <p className="mt-3 leading-relaxed text-muted">
          Four copies of the same book. No account or wallet is needed.
        </p>
        <ul className="mt-6 grid gap-4 sm:grid-cols-2" data-downloads>
          {paper.downloads.map((d) => (
            <li
              key={d.format}
              className="border border-border bg-surface/40 p-5"
              data-format={d.format}
            >
              <a
                href={d.href}
                type={d.contentType}
                className={`${inlineLink} text-lg font-medium`}
              >
                {d.name}{" "}
                <span className="whitespace-nowrap text-sm">
                  ({d.type}, {d.size})
                </span>
              </a>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                {USE[d.format]}
              </p>
            </li>
          ))}
        </ul>
        <p className="mt-6 leading-relaxed text-text/90">
          <a href={paper.chapter6.href} className={inlineLink} data-chapter-6>
            Go straight to {paper.chapter6.title}, in the web page{" "}
            <span className="whitespace-nowrap">
              ({html.type}, {html.size})
            </span>
          </a>{" "}
          — the chapter this version updates.
        </p>
      </section>

      <section
        aria-labelledby="changes"
        className="border border-cyan/40 bg-surface/40 p-5 sm:p-6"
        data-changes
      >
        <h2
          id="changes"
          className="text-2xl font-semibold tracking-tight text-text"
        >
          What changed in v{paper.version}
        </h2>
        <p className="mt-3 leading-relaxed text-muted">
          Version {paper.version} updates §6, Operations and Governance, for
          open registration: anyone can now list an agent. Each change below
          names the subsection it is in, and says whether it is new or puts
          right a claim from the last version.
        </p>
        <ul className="mt-6 space-y-5">
          {paper.changes.map((c) => (
            <li key={c.title} data-change={c.kind}>
              <h3 className="font-semibold text-text">
                {c.title}{" "}
                <span className="font-mono text-[11px] font-normal uppercase tracking-[0.2em] text-cyan">
                  {KIND[c.kind]}&nbsp;· {c.where}
                </span>
              </h3>
              <p className="mt-1 leading-relaxed text-text/90">{c.text}</p>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="source">
        <h2
          id="source"
          className="text-2xl font-semibold tracking-tight text-text"
        >
          Source
        </h2>
        <p className="mt-3 leading-relaxed text-text/90">
          The litepaper&rsquo;s Markdown sections, its figures and the scripts
          that build these four files live in the frontend repository, under{" "}
          <code className="font-mono text-sm">litepaper/</code>.{" "}
          <a
            href={LITEPAPER_SOURCE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className={inlineLink}
          >
            The litepaper folder on GitHub{" "}
            <span className="sr-only">(opens GitHub)</span>
            <span aria-hidden="true"> ↗</span>
          </a>
        </p>
      </section>
    </article>
  );
}
