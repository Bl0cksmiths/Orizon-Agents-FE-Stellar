/**
 * Unit tests for lib/demo/display.ts: how the demo page writes times, hashes
 * and links.
 */

import { describe, expect, it } from "vitest";
import {
  deliverableLabel,
  formatDemoDate,
  formatDuration,
  formatTimestamp,
  formatUnixUtc,
  isoDuration,
  truncateHash,
  youtubeEmbedUrl,
  youtubePosterUrl,
  youtubeWatchUrl,
} from "./display";

describe("times", () => {
  it("writes chapter timestamps as m:ss", () => {
    expect(formatTimestamp(0)).toBe("0:00");
    expect(formatTimestamp(75)).toBe("1:15");
    expect(formatTimestamp(300)).toBe("5:00");
  });

  it("writes ISO 8601 durations for <time>", () => {
    expect(isoDuration(0)).toBe("PT0S");
    expect(isoDuration(75)).toBe("PT1M15S");
    expect(isoDuration(240)).toBe("PT4M");
  });

  it("writes the running time in words", () => {
    expect(formatDuration(252)).toBe("4 min 12 s");
    expect(formatDuration(240)).toBe("4 min");
  });

  it("writes dates the same on every server", () => {
    expect(formatDemoDate("2026-10-02")).toBe("October 2, 2026");
    expect(formatUnixUtc(1790856300)).toBe("October 1, 2026, 12:05 UTC");
  });
});

describe("deliverables", () => {
  it("names a deliverable in full", () => {
    expect(deliverableLabel("D3")).toBe(
      "Deliverable D3: Dispute window and partial-credit refund",
    );
  });
});

describe("links", () => {
  it("shortens a hash to its ends", () => {
    const hash =
      "9b8ffaa44b2b966e4c3f1ab581f4203a30d282901ba3b231a578e46d8f919a68";
    expect(truncateHash(hash)).toBe("9b8ffaa4…8f919a68");
  });

  it("builds the watch, embed and poster URLs", () => {
    expect(youtubeWatchUrl("abcDEF12_-x")).toBe(
      "https://www.youtube.com/watch?v=abcDEF12_-x",
    );
    expect(youtubeWatchUrl("abcDEF12_-x", 75)).toBe(
      "https://www.youtube.com/watch?v=abcDEF12_-x&t=75s",
    );
    expect(youtubeEmbedUrl("abcDEF12_-x")).toBe(
      "https://www.youtube-nocookie.com/embed/abcDEF12_-x?autoplay=1&rel=0&cc_load_policy=1",
    );
    expect(youtubeEmbedUrl("abcDEF12_-x", 75)).toBe(
      "https://www.youtube-nocookie.com/embed/abcDEF12_-x?autoplay=1&rel=0&cc_load_policy=1&start=75",
    );
    expect(youtubePosterUrl("abcDEF12_-x")).toBe(
      "https://i.ytimg.com/vi/abcDEF12_-x/hqdefault.jpg",
    );
  });
});
