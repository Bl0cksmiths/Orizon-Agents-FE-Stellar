/**
 * The litepaper route: what it tells search engines and link previews, read
 * from the litepaper's own cover, and that a missing litepaper fails the
 * build rather than publishing.
 */

import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { generateMetadata } from "./page";

const FIXTURE = path.resolve(__dirname, "../../../test/fixtures/litepaper");

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("litepaper route metadata", () => {
  it("is canonical at /litepaper with a share card, naming the version and date", () => {
    vi.stubEnv("LITEPAPER_DIR", FIXTURE);
    const meta = generateMetadata();
    expect(meta.title).toBe(
      "The Orizon Agents Protocol Litepaper (fixture), v0.5 — Orizon Agents",
    );
    expect(meta.description).toBe(
      "Version 0.5, dated September 27, 2026. Read the Orizon Agents litepaper as a PDF, a web page, a Word document or Markdown. §6 is updated for open registration.",
    );
    expect(meta.alternates).toEqual({ canonical: "/litepaper" });
    expect(meta.openGraph).toMatchObject({
      title: "The Orizon Agents Protocol Litepaper (fixture), v0.5",
      url: "/litepaper",
      images: [expect.objectContaining({ url: "/opengraph-image" })],
    });
    expect(meta.twitter).toMatchObject({ card: "summary_large_image" });
  });

  it("fails the build when the litepaper is missing", () => {
    vi.stubEnv("LITEPAPER_DIR", path.join(FIXTURE, "no-such-dir"));
    expect(() => generateMetadata()).toThrow(
      /the litepaper cannot be published/,
    );
  });
});
