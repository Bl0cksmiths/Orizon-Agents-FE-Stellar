"use client";

/**
 * One part's video behind a facade, and that part's chapters. Each part has
 * its own player, so a chapter only ever seeks the video it belongs to.
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
 * plain "Watch part N on YouTube" link under the player is always there.
 */

import { useEffect, useRef, useState, type MouseEvent } from "react";
import type { DemoChapter, DemoVideo } from "@/lib/demo/load";
import {
  formatDuration,
  youtubeEmbedUrl,
  youtubeWatchUrl,
} from "@/lib/demo/display";
import { faultPoint } from "@/lib/fault-injection";
import { focusRing } from "@/lib/ui";
import { cn } from "@/lib/utils";
import {
  CHAPTER_LINK,
  ChapterLabel,
  ChapterList,
  PlayGlyph,
  Poster,
  PosterLink,
  WatchLink,
} from "./demo-player-parts";

type Playing = { start: number; load: number };

export function DemoPlayer({
  video,
  chapters,
  index,
}: {
  video: DemoVideo;
  chapters: DemoChapter[];
  /** Which part this is, from 0: it names the links and the headings' ids. */
  index: number;
}) {
  faultPoint("demo-player");
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
              <Poster video={video} first={index === 0} />
              <span className="relative">
                <PlayGlyph />
              </span>
            </button>
          ) : (
            // Before hydration (or with no JavaScript): the poster goes to
            // YouTube.
            <PosterLink video={video} first={index === 0} />
          )}
        </div>
        <WatchLink video={video} index={index} />
      </div>

      <ChapterList index={index}>
        {chapters.map((chapter) => {
          const current = playing?.start === chapter.t;
          return (
            <li key={chapter.t}>
              <a
                href={youtubeWatchUrl(video.id, chapter.t)}
                onClick={(e) => onChapter(e, chapter.t)}
                aria-current={current ? "true" : undefined}
                className={cn(
                  CHAPTER_LINK,
                  current && "bg-surface/70",
                  focusRing,
                )}
              >
                <ChapterLabel chapter={chapter} />
              </a>
            </li>
          );
        })}
      </ChapterList>
    </div>
  );
}
