/**
 * The whole /demo page, in either state.
 *
 * Published: the video behind its facade, the chapters, the on-chain
 * evidence, the limitations, the transcript and where to go next.
 * Unpublished: the notice and how to verify each deliverable, the
 * limitations, and where to go next. Nothing that exists only once the video
 * does (a player, a poster, an evidence row) is drawn before it does.
 */

import type { LoadedDemo } from "@/lib/demo/load";
import {
  formatDemoDate,
  formatDuration,
  isoDuration,
} from "@/lib/demo/display";
import { inlineLink } from "@/lib/ui";
import { DemoLinks } from "./demo-links";
import { DemoPlayer } from "./demo-player";
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
        <p className="mt-4 max-w-2xl leading-relaxed text-muted">
          A three-to-five-minute walkthrough from both sides: an operator
          registering an agent and getting paid, and a buyer routing, paying and
          disputing, on Stellar testnet.
        </p>
        {demo.status === "published" && (
          <dl className="mt-6 flex flex-wrap gap-x-8 gap-y-3">
            <div>
              <dt className={term}>Video</dt>
              <dd className={value}>{demo.video.title}</dd>
            </div>
            <div>
              <dt className={term}>Running time</dt>
              <dd className={value}>
                <time dateTime={isoDuration(demo.video.duration_seconds)}>
                  {formatDuration(demo.video.duration_seconds)}
                </time>
              </dd>
            </div>
            <div>
              <dt className={term}>Published</dt>
              <dd className={value}>
                <time dateTime={demo.video.published_at}>
                  {formatDemoDate(demo.video.published_at)}
                </time>
              </dd>
            </div>
            <div>
              <dt className={term}>Network</dt>
              <dd className={value}>testnet</dd>
            </div>
            <div>
              <dt className={term}>Captions</dt>
              <dd className={value}>
                <a href={demo.captionsHref} className={inlineLink} download>
                  English (WebVTT)
                </a>
              </dd>
            </div>
          </dl>
        )}
      </header>

      {demo.status === "published" ? (
        <>
          <DemoPlayer video={demo.video} chapters={demo.chapters} />
          <EvidenceTable evidence={demo.evidence} />
          <Limitations />
          <DemoTranscript tree={demo.transcript} />
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
