/**
 * The demo route: what it tells search engines and link previews in each
 * state. An unpublished page must not describe a video that does not exist.
 */

import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { generateMetadata } from "./page";

const FIXTURES = path.resolve(__dirname, "../../../test/fixtures/demo");

function state(name: "published" | "unpublished") {
  vi.stubEnv("DEMO_CONTENT_DIR", path.join(FIXTURES, name));
  vi.stubEnv("DEMO_PUBLIC_DIR", path.join(FIXTURES, "public"));
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("demo route metadata", () => {
  it("says an unpublished demo has not been recorded", () => {
    state("unpublished");
    const meta = generateMetadata();
    expect(meta.title).toBe("Demo: Orizon Agents, end to end — Orizon Agents");
    expect(meta.description).toBe(
      "The Orizon Agents demo video has not been recorded yet. Until it is, verify each funded deliverable yourself on Stellar testnet.",
    );
    expect(meta.alternates).toEqual({ canonical: "/demo" });
  });

  it("describes a published demo by its parts' running time together, with a share card", () => {
    state("published");
    const meta = generateMetadata();
    expect(meta.description).toBe(
      "A 4 min 12 s walkthrough of Orizon Agents on Stellar testnet in 2 parts, the operator's side and the buyer's, with the sprint's own transactions linked on Stellar Expert.",
    );
    expect(meta.openGraph).toMatchObject({
      title: "Demo: Orizon Agents, end to end",
      url: "/demo",
      images: [expect.objectContaining({ url: "/opengraph-image" })],
    });
    expect(meta.twitter).toMatchObject({ card: "summary_large_image" });
  });

  it("fails the build on a bad manifest", () => {
    vi.stubEnv("DEMO_CONTENT_DIR", path.join(FIXTURES, "no-such-dir"));
    expect(() => generateMetadata()).toThrow(
      /the demo page cannot be published/,
    );
  });
});
