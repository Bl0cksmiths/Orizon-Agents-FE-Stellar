/**
 * One part of the demo: whose side it shows, the video's own title, length
 * and publication date, its captions, and its player with its chapters.
 *
 * A part recorded on an earlier version of the console says so in one plain
 * sentence above its player, so a viewer never takes it for the console as
 * it is now.
 */

import {
  earlierConsoleNote,
  formatDemoDate,
  formatDuration,
  isoDuration,
  partHeading,
} from "@/lib/demo/display";
import type { DemoPart as Part } from "@/lib/demo/load";
import { inlineLink } from "@/lib/ui";
import { Isolate } from "@/components/isolate";
import { DemoPlayer } from "./demo-player";
import { DemoPlayerStatic } from "./demo-player-static";

const term = "font-mono text-[10px] uppercase tracking-[0.25em] text-muted";
const value = "font-mono text-xs text-text";

export function DemoPart({ part, index }: { part: Part; index: number }) {
  const id = `demo-part-${index + 1}`;
  return (
    <section aria-labelledby={id} data-demo-part={part.role}>
      <h2 id={id} className="text-2xl font-semibold tracking-tight text-text">
        {partHeading(index, part.role)}
      </h2>
      <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-3">
        <div className="min-w-0">
          <dt className={term}>Video</dt>
          <dd className={value}>{part.title}</dd>
        </div>
        <div>
          <dt className={term}>Length</dt>
          <dd className={value}>
            <time dateTime={isoDuration(part.duration_seconds)}>
              {formatDuration(part.duration_seconds)}
            </time>
          </dd>
        </div>
        <div>
          <dt className={term}>Published</dt>
          <dd className={value}>
            <time dateTime={part.published_at}>
              {formatDemoDate(part.published_at)}
            </time>
          </dd>
        </div>
        <div>
          <dt className={term}>Captions</dt>
          <dd className={value}>
            <a href={part.captionsHref} className={inlineLink} download>
              English (WebVTT)
              <span className="sr-only">, part {index + 1}</span>
            </a>
          </dd>
        </div>
      </dl>
      {part.recorded_on_earlier_console && (
        <p
          data-earlier-console
          className="mt-4 border-l-2 border-violet/70 bg-violet/10 px-4 py-3 text-sm leading-relaxed text-text/90"
        >
          {earlierConsoleNote(part.recorded_on_earlier_console)}
        </p>
      )}
      <div className="mt-6">
        {/* A player that fails leaves the part's poster and chapters as
            plain links to the video, not an error screen for the page. */}
        <Isolate
          name="demo-player"
          fallback={
            <DemoPlayerStatic
              video={part}
              chapters={part.chapters}
              index={index}
            />
          }
        >
          <DemoPlayer video={part} chapters={part.chapters} index={index} />
        </Isolate>
      </div>
    </section>
  );
}
