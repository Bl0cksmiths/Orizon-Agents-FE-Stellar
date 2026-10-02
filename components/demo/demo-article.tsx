/**
 * The whole /demo page, in either state.
 *
 * Published: the demo's parts in order, each with its own player, details
 * and chapters, then the sprint's on-chain evidence, the limitations, every
 * part's transcript and where to go next.
 * Unpublished: the notice and how to verify each deliverable, the
 * limitations, and where to go next. Nothing that exists only once the video
 * does (a player, a poster, an evidence row) is drawn before it does.
 */

import type { LoadedDemo } from "@/lib/demo/load";
import { formatDuration, isoDuration } from "@/lib/demo/display";
import { DemoLinks } from "./demo-links";
import { DemoPart } from "./demo-part";
import { EvidenceTable } from "./evidence-table";
import { Limitations } from "./limitations";
import { DemoTranscript } from "./transcript";
import { UnpublishedNotice } from "./unpublished-notice";

const term = "font-mono text-[10px] uppercase tracking-[0.25em] text-muted";
const value = "font-mono text-xs text-text";

export function DemoArticle({ demo }: { demo: LoadedDemo }) {
  return (
    <article
      data-demo={demo.status}
      className="mx-auto max-w-3xl space-y-14 px-4 pb-24 pt-28 sm:px-6"
    >
      <header>
        <p className="mb-4 inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.3em] text-cyan">
          <span aria-hidden="true" className="h-px w-8 bg-cyan/60" />
          Demo
        </p>
        <h1 className="text-3xl font-semibold leading-tight tracking-tight text-text sm:text-4xl">
          Orizon Agents, end to end
        </h1>
        {demo.status === "published" ? (
          <>
            <p className="mt-4 max-w-2xl leading-relaxed text-muted">
              The demo in {demo.parts.length} parts, each its own video: the
              operator&rsquo;s side and the buyer&rsquo;s, on Stellar testnet.
              Nothing loads from YouTube until you press play, and the player is
              YouTube&rsquo;s privacy-enhanced embed.
            </p>
            <dl className="mt-6 flex flex-wrap gap-x-8 gap-y-3">
              <div>
                <dt className={term}>Parts</dt>
                <dd className={value}>{demo.parts.length}</dd>
              </div>
              <div>
                <dt className={term}>Running time</dt>
                <dd className={value}>
                  <time dateTime={isoDuration(demo.duration_seconds)}>
                    {formatDuration(demo.duration_seconds)}
                  </time>{" "}
                  together
                </dd>
              </div>
              <div>
                <dt className={term}>Network</dt>
                <dd className={value}>testnet</dd>
              </div>
            </dl>
          </>
        ) : (
          <p className="mt-4 max-w-2xl leading-relaxed text-muted">
            A three-to-five-minute walkthrough from both sides: an operator
            registering an agent and getting paid, and a buyer routing, paying
            and disputing, on Stellar testnet.
          </p>
        )}
      </header>

      {demo.status === "published" ? (
        <>
          {demo.parts.map((part, i) => (
            <DemoPart key={part.id} part={part} index={i} />
          ))}
          <EvidenceTable evidence={demo.evidence} />
          <Limitations />
          <DemoTranscript parts={demo.parts} />
        </>
      ) : (
        <>
          <UnpublishedNotice />
          <Limitations />
        </>
      )}
      <DemoLinks />
    </article>
  );
}
