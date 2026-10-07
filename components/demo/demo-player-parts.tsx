/**
 * The pieces of a part's player that need no script: the poster, the play
 * glyph, the plain YouTube links and the chapter list's frame. Shared by the
 * player (./demo-player.tsx) and its static stand-in
 * (./demo-player-static.tsx), so the two cannot drift apart.
 */

import Image from "next/image";
import type { ReactNode } from "react";
import type { DemoChapter, DemoVideo } from "@/lib/demo/load";
import {
  deliverableLabel,
  formatTimestamp,
  isoDuration,
  youtubePosterUrl,
  youtubeWatchUrl,
} from "@/lib/demo/display";
import { inlineLink } from "@/lib/ui";

export function PlayGlyph() {
  return (
    <span
      aria-hidden="true"
      className="grid h-16 w-16 place-items-center rounded-full border border-cyan/70 bg-bg/80 text-cyan shadow-lg backdrop-blur transition-transform group-hover:scale-105 sm:h-20 sm:w-20"
    >
      <svg viewBox="0 0 24 24" className="ml-1 h-7 w-7 sm:h-8 sm:w-8">
        <path d="M7 4.5v15l12-7.5-12-7.5Z" fill="currentColor" />
      </svg>
    </span>
  );
}

export function Poster({ video, first }: { video: DemoVideo; first: boolean }) {
  return (
    <Image
      src={youtubePosterUrl(video.id)}
      alt=""
      fill
      // Only the first part's poster is above the fold.
      priority={first}
      sizes="(min-width: 896px) 832px, 100vw"
      className="object-cover opacity-80 transition-opacity group-hover:opacity-100"
    />
  );
}

/**
 * The poster as a link to the video on YouTube: the player before it
 * hydrates, without JavaScript, and in its static stand-in. The text link
 * under the player is the named way to the video, so this copy is hidden
 * from the accessibility tree and the tab order.
 */
export function PosterLink({
  video,
  first,
}: {
  video: DemoVideo;
  first: boolean;
}) {
  return (
    <a
      href={youtubeWatchUrl(video.id)}
      aria-hidden="true"
      tabIndex={-1}
      className="group absolute inset-0 grid h-full w-full place-items-center bg-bg"
    >
      <Poster video={video} first={first} />
      <span className="relative">
        <PlayGlyph />
      </span>
    </a>
  );
}

/** The plain link to the part's video, always under its player. */
export function WatchLink({
  video,
  index,
}: {
  video: DemoVideo;
  index: number;
}) {
  return (
    <p className="mt-3 text-right text-sm">
      <a
        href={youtubeWatchUrl(video.id)}
        rel="noreferrer"
        className={inlineLink}
      >
        Watch part {index + 1} on YouTube
      </a>
    </p>
  );
}

/** The chapters' heading, note and list; each item is the caller's link. */
export function ChapterList({
  index,
  children,
}: {
  index: number;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={`demo-part-${index + 1}-chapters`}>
      <h3
        id={`demo-part-${index + 1}-chapters`}
        className="text-lg font-semibold tracking-tight text-text"
      >
        Chapters
      </h3>
      <p className="mt-2 text-sm text-muted">
        A chapter is tagged with the funded deliverable it shows, and left
        untagged when it shows none. Choosing one plays the video from that
        point.
      </p>
      <ol className="mt-5 divide-y divide-border border-y border-border">
        {children}
      </ol>
    </section>
  );
}

/** A chapter link's content: its time, its title and its deliverable tag. */
export function ChapterLabel({ chapter }: { chapter: DemoChapter }) {
  return (
    <>
      <time
        dateTime={isoDuration(chapter.t)}
        className="w-12 shrink-0 font-mono text-sm text-cyan"
      >
        {formatTimestamp(chapter.t)}
      </time>{" "}
      <span className="min-w-0 flex-1 text-text">{chapter.title}</span>
      {chapter.deliverable && (
        <>
          {" "}
          <span
            title={deliverableLabel(chapter.deliverable)}
            className="shrink-0 border border-violet/60 px-1.5 py-0.5 font-mono text-[11px] uppercase tracking-widest text-violet-readable"
          >
            <span className="sr-only">
              {deliverableLabel(chapter.deliverable)}
            </span>
            <span aria-hidden="true">{chapter.deliverable}</span>
          </span>
        </>
      )}
    </>
  );
}

/** A chapter link's frame, shared so both players' rows look the same. */
export const CHAPTER_LINK =
  "flex items-baseline gap-4 px-2 py-3 transition-colors hover:bg-surface/70";
