"use client";

/**
 * The demo video behind a facade, and its chapters.
 *
 * Nothing from YouTube loads until the viewer asks for it: the page paints a
 * poster (YouTube's thumbnail, fetched and re-served by our own image
 * optimiser, so the browser talks only to us) and a Play button. Pressing it
 * swaps in the privacy-enhanced youtube-nocookie.com embed, playing, and moves
 * focus into it so a keyboard user is already in the player.
 *
 * Chapters are plain links to the video on YouTube at their time, which is
 * what they are with JavaScript off. With JavaScript on, choosing one (re)loads
 * the embed with its `start` parameter: a reload, not a player API, so there
 * is no YouTube script on the page to seek with and nothing to go stale.
 *
 * Before hydration the poster is a link to YouTube too, so a click before the
 * JavaScript arrives, or without it at all, still reaches the video. The
 * plain "Watch on YouTube" link under the player is always there.
 */

import Image from "next/image";
import { useEffect, useRef, useState, type MouseEvent } from "react";
import type { DemoChapter, DemoVideo } from "@/lib/demo/load";
import {
  deliverableLabel,
  deliverableTag,
  formatDuration,
  formatTimestamp,
  isoDuration,
  youtubeEmbedUrl,
  youtubePosterUrl,
  youtubeWatchUrl,
} from "@/lib/demo/display";
import { focusRing, inlineLink } from "@/lib/ui";
import { cn } from "@/lib/utils";

type Playing = { start: number; load: number };

function PlayGlyph() {
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

function Poster({ video }: { video: DemoVideo }) {
  return (
    <Image
      src={youtubePosterUrl(video.id)}
      alt=""
      fill
      priority
      sizes="(min-width: 896px) 832px, 100vw"
      className="object-cover opacity-80 transition-opacity group-hover:opacity-100"
    />
  );
}

export function DemoPlayer({
  video,
  chapters,
}: {
  video: DemoVideo;
  chapters: DemoChapter[];
}) {
  const [hydrated, setHydrated] = useState(false);
  const [playing, setPlaying] = useState<Playing | null>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  useEffect(() => setHydrated(true), []);

  // Each load is a new iframe, so focus follows it into the player.
  useEffect(() => {
    if (playing) frameRef.current?.focus();
  }, [playing]);

  function play(start: number) {
    setPlaying((p) => ({ start, load: (p?.load ?? 0) + 1 }));
    stageRef.current?.scrollIntoView?.({ block: "nearest" });
  }

  function onChapter(event: MouseEvent<HTMLAnchorElement>, t: number) {
    // A modified click keeps the link's own meaning: YouTube, in a new tab.
    if (
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      event.button !== 0
    ) {
      return;
    }
    event.preventDefault();
    play(t);
  }

  const duration = formatDuration(video.duration_seconds);

  return (
    <div className="space-y-8">
      <div>
        <div
          ref={stageRef}
          data-demo-player={playing ? "embed" : "facade"}
          className="relative aspect-video w-full overflow-hidden border border-border bg-surface"
        >
          {playing ? (
            <iframe
              key={playing.load}
              ref={frameRef}
              src={youtubeEmbedUrl(video.id, playing.start)}
              title={`YouTube video player: ${video.title}`}
              // The site sends no Referer; YouTube's embed refuses to play
              // without one, so this frame alone sends the origin.
              referrerPolicy="strict-origin-when-cross-origin"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
              className={cn("absolute inset-0 h-full w-full", focusRing)}
            />
          ) : hydrated ? (
            <button
              type="button"
              onClick={() => play(0)}
              aria-label={`Play video: ${video.title} (${duration})`}
              className={cn(
                "group absolute inset-0 grid h-full w-full place-items-center bg-bg",
                focusRing,
              )}
            >
              <Poster video={video} />
              <span className="relative">
                <PlayGlyph />
              </span>
            </button>
          ) : (
            // Before hydration (or with no JavaScript): the poster goes to
            // YouTube. The text link below is the named fallback, so this
            // copy is hidden from the accessibility tree and the tab order.
            <a
              href={youtubeWatchUrl(video.id)}
              aria-hidden="true"
              tabIndex={-1}
              className="group absolute inset-0 grid h-full w-full place-items-center bg-bg"
            >
              <Poster video={video} />
              <span className="relative">
                <PlayGlyph />
              </span>
            </a>
          )}
        </div>
        <p className="mt-3 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 text-sm text-muted">
          <span>
            Nothing loads from YouTube until you press play; the player is
            YouTube&rsquo;s privacy-enhanced embed.
          </span>
          <a
            href={youtubeWatchUrl(video.id)}
            rel="noreferrer"
            className={cn(inlineLink, "shrink-0")}
          >
            Watch on YouTube
          </a>
        </p>
      </div>

      <section aria-labelledby="demo-chapters">
        <h2
          id="demo-chapters"
          className="text-2xl font-semibold tracking-tight text-text"
        >
          Chapters
        </h2>
        <p className="mt-2 text-sm text-muted">
          Each chapter is tagged with the funded deliverable it shows. Choosing
          one plays the video from that point.
        </p>
        <ol className="mt-5 divide-y divide-border border-y border-border">
          {chapters.map((chapter) => {
            const current = playing?.start === chapter.t;
            return (
              <li key={chapter.t}>
                <a
                  href={youtubeWatchUrl(video.id, chapter.t)}
                  onClick={(e) => onChapter(e, chapter.t)}
                  aria-current={current ? "true" : undefined}
                  className={cn(
                    "flex items-baseline gap-4 px-2 py-3 transition-colors hover:bg-surface/70",
                    current && "bg-surface/70",
                    focusRing,
                  )}
                >
                  <time
                    dateTime={isoDuration(chapter.t)}
                    className="w-12 shrink-0 font-mono text-sm text-cyan"
                  >
                    {formatTimestamp(chapter.t)}
                  </time>{" "}
                  <span className="min-w-0 flex-1 text-text">
                    {chapter.title}
                  </span>{" "}
                  <span
                    title={deliverableLabel(chapter.deliverable)}
                    className="shrink-0 border border-violet/60 px-1.5 py-0.5 font-mono text-[11px] uppercase tracking-widest text-violet-readable"
                  >
                    <span className="sr-only">
                      {deliverableLabel(chapter.deliverable)}
                    </span>
                    <span aria-hidden="true">
                      {deliverableTag(chapter.deliverable)}
                    </span>
                  </span>
                </a>
              </li>
            );
          })}
        </ol>
      </section>
    </div>
  );
}
