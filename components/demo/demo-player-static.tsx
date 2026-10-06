/**
 * A part's player with no script: what stands in for the player
 * (./demo-player.tsx) if it fails (components/isolate.tsx). The poster and
 * every chapter link to the video on YouTube, as the player itself does
 * before it hydrates, so the part stays watchable.
 */

import type { DemoChapter, DemoVideo } from "@/lib/demo/load";
import { youtubeWatchUrl } from "@/lib/demo/display";
import { focusRing } from "@/lib/ui";
import { cn } from "@/lib/utils";
import {
  CHAPTER_LINK,
  ChapterLabel,
  ChapterList,
  PosterLink,
  WatchLink,
} from "./demo-player-parts";

export function DemoPlayerStatic({
  video,
  chapters,
  index,
}: {
  video: DemoVideo;
  chapters: DemoChapter[];
  index: number;
}) {
  return (
    <div className="space-y-8">
      <div>
        <div
          data-demo-player="static"
          className="relative aspect-video w-full overflow-hidden border border-border bg-surface"
        >
          <PosterLink video={video} first={index === 0} />
        </div>
        <WatchLink video={video} index={index} />
      </div>
      <ChapterList index={index}>
        {chapters.map((chapter) => (
          <li key={chapter.t}>
            <a
              href={youtubeWatchUrl(video.id, chapter.t)}
              className={cn(CHAPTER_LINK, focusRing)}
            >
              <ChapterLabel chapter={chapter} />
            </a>
          </li>
        ))}
      </ChapterList>
    </div>
  );
}
