/**
 * The evidence route: what it tells search engines and link previews, and
 * that a bad index fails the build rather than publishing.
 */

import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { generateMetadata } from "./page";

const FIXTURES = path.resolve(__dirname, "../../../test/fixtures/evidence");

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("evidence route metadata", () => {
  it("is canonical at /evidence with a share card, and says how many metrics were met", () => {
    vi.stubEnv("EVIDENCE_CONTENT_DIR", FIXTURES);
    const meta = generateMetadata();
    expect(meta.title).toBe(
      "Evidence index: every claim linked to its proof — Orizon Agents",
    );
    expect(meta.description).toBe(
      "The Orizon Agents Instaward evidence as of September 28, 2026: each SOW deliverable and success metric linked to its proof on Stellar testnet. 7 of 10 metrics met.",
    );
    expect(meta.alternates).toEqual({ canonical: "/evidence" });
    expect(meta.openGraph).toMatchObject({
      title: "Evidence index: every claim linked to its proof",
      url: "/evidence",
      images: [expect.objectContaining({ url: "/opengraph-image" })],
    });
    expect(meta.twitter).toMatchObject({ card: "summary_large_image" });
    // The share cards carry the same count, out of the metrics shown.
    expect(meta.openGraph?.description).toBe(meta.description);
    expect(meta.twitter?.description).toBe(meta.description);
  });

  it("fails the build on a bad index", () => {
    vi.stubEnv("EVIDENCE_CONTENT_DIR", path.join(FIXTURES, "no-such-dir"));
    expect(() => generateMetadata()).toThrow(
      /the evidence page cannot be published/,
    );
  });
});
