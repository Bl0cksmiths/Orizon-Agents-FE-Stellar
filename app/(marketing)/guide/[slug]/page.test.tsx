/**
 * The guide route: which pages it builds, and what it tells search engines
 * and link previews about each.
 */

import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { dynamicParams, generateMetadata, generateStaticParams } from "./page";

beforeEach(() => {
  vi.stubEnv(
    "GUIDE_CONTENT_DIR",
    path.resolve(__dirname, "../../../../test/fixtures/guides"),
  );
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("guide route", () => {
  it("builds one static page per guide and no others", () => {
    expect(generateStaticParams()).toEqual([{ slug: "list-your-agent" }]);
    expect(dynamicParams).toBe(false);
  });

  it("builds nothing when there are no guides", () => {
    vi.stubEnv("GUIDE_CONTENT_DIR", path.resolve(__dirname, "no-such-dir"));
    expect(generateStaticParams()).toEqual([]);
  });

  it("gives each guide a title, description, canonical URL and share card", () => {
    const meta = generateMetadata({ params: { slug: "list-your-agent" } });
    expect(meta.title).toBe("List your agent on Orizon — Orizon Agents");
    expect(meta.description).toBe(
      "A fixture guide that exercises every construct of the guide dialect.",
    );
    expect(meta.alternates).toEqual({ canonical: "/guide/list-your-agent" });
    expect(meta.openGraph).toMatchObject({
      title: "List your agent on Orizon",
      type: "article",
      url: "/guide/list-your-agent",
      modifiedTime: "2026-09-29",
      images: [expect.objectContaining({ url: "/opengraph-image" })],
    });
    expect(meta.twitter).toMatchObject({
      card: "summary_large_image",
      images: [expect.objectContaining({ url: "/opengraph-image" })],
    });
  });
});
