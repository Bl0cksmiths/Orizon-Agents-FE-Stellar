// @vitest-environment jsdom
/**
 * Rendering tests for the demo page in both states, against the fixture
 * manifests in test/fixtures/demo/.
 *
 * What is asserted is what a reviewer depends on: an unpublished page shows
 * nothing as real (no player, no poster, no evidence) and says so in the
 * agreed words; a published page keeps YouTube off the page until Play, then
 * puts the viewer inside the player; chapters seek by reloading at their
 * time; every evidence row links to its own testnet transaction; and the
 * limitations are there either way.
 *
 * Assertions are plain DOM checks — this repo does not install jest-dom.
 */

import path from "node:path";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import { demoPaths, loadDemo, type PublishedDemo } from "@/lib/demo/load";
import { UNPUBLISHED_NOTICE } from "@/lib/demo/display";
import { DemoArticle } from "./demo-article";
import { DemoPlayer } from "./demo-player";

const FIXTURES = path.resolve(__dirname, "../../test/fixtures/demo");
const load = (state: "published" | "unpublished") =>
  loadDemo(
    demoPaths({
      DEMO_CONTENT_DIR: path.join(FIXTURES, state),
      DEMO_PUBLIC_DIR: path.join(FIXTURES, "public"),
    }),
  );
const published = () => load("published") as PublishedDemo;

const TITLE = "Fixture: Orizon Agents on Stellar testnet";
const EMBED =
  "https://www.youtube-nocookie.com/embed/fixtureVid0?autoplay=1&rel=0&cc_load_policy=1";

const text = (el: Element) => (el.textContent ?? "").replace(/\s+/g, " ");

afterEach(cleanup);

describe("the unpublished page", () => {
  it("says the video does not exist yet, in the agreed words", () => {
    render(<DemoArticle demo={load("unpublished")} />);
    expect(screen.getByRole("note").textContent).toContain(UNPUBLISHED_NOTICE);
    expect(UNPUBLISHED_NOTICE).toBe(
      "The demo video has not been recorded yet. It will show only real testnet transactions. Until then, here is how to verify each deliverable yourself.",
    );
  });

  it("links the guide, the ecosystem page, the operator dashboard and the evidence bundles", () => {
    render(<DemoArticle demo={load("unpublished")} />);
    const verify = screen.getByRole("heading", {
      name: "Verify each deliverable yourself",
    }).parentElement!;
    const href = (name: string) =>
      within(verify).getByRole("link", { name }).getAttribute("href");
    expect(href("operator guide")).toBe("/guide/list-your-agent");
    expect(href("operator dashboard")).toBe("/app/operator");
    expect(href("ecosystem page")).toBe("/app/ecosystem");
    expect(href("orchestrator")).toBe("/app/orchestrator");
    for (const week of [1, 2, 3]) {
      expect(
        within(verify)
          .getAllByRole("link", { name: `Week ${week} evidence bundle` })
          .every((a) =>
            a
              .getAttribute("href")!
              .endsWith(`/tree/main/Week-${week}-Tranche-Submission`),
          ),
      ).toBe(true);
    }
    for (const d of ["D1", "D2", "D3", "D4"]) {
      expect(text(verify)).toContain(d);
    }
  });

  it("shows no player, poster, chapter or evidence", () => {
    const { container } = render(<DemoArticle demo={load("unpublished")} />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(container.querySelector("iframe, img, video")).toBeNull();
    expect(screen.queryByRole("heading", { name: "Chapters" })).toBeNull();
    expect(
      screen.queryByRole("heading", { name: "On-chain evidence" }),
    ).toBeNull();
    expect(screen.queryByRole("heading", { name: "Transcript" })).toBeNull();
    expect(container.innerHTML).not.toMatch(/youtube|ytimg|stellar\.expert/);
  });

  it("still states the limitations", () => {
    render(<DemoArticle demo={load("unpublished")} />);
    expectLimitations();
  });
});

function expectLimitations() {
  const section = screen.getByRole("heading", {
    level: 2,
    name: "Limitations",
  }).parentElement!;
  const items = within(section).getAllByRole("listitem").map(text);
  expect(items).toHaveLength(4);
  expect(items[0]).toMatch(/^Testnet only\./);
  expect(items[1]).toMatch(
    /^Dispute credits are platform-funded and platform-adjudicated\./,
  );
  expect(items[2]).toMatch(/^Endpoint binding is off-chain\./);
  expect(items[3]).toMatch(/^One platform key\./);
}

describe("the published page", () => {
  it("names the video, its running time, date, network and captions", () => {
    const { container } = render(<DemoArticle demo={published()} />);
    const header = container.querySelector("header")!;
    expect(text(header)).toContain(`Video${TITLE}`);
    expect(text(header)).toContain("Running time4 min 12 s");
    expect(text(header)).toContain("PublishedOctober 2, 2026");
    expect(text(header)).toContain("Networktestnet");
    expect(
      screen
        .getByRole("link", { name: "English (WebVTT)" })
        .getAttribute("href"),
    ).toBe("/demo/demo.en.vtt");
  });

  it("states the limitations", () => {
    render(<DemoArticle demo={published()} />);
    expectLimitations();
  });

  it("links every evidence row to its own testnet transaction", () => {
    render(<DemoArticle demo={published()} />);
    const table = screen.getByRole("region", {
      name: "On-chain evidence table",
    });
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(5);
    const kinds = rows.map(
      (r) => within(r).getAllByRole("cell")[1].textContent,
    );
    expect(kinds).toEqual([
      "Registration",
      "Authorization",
      "Settlement",
      "Dispute rating",
      "Refund credit",
    ]);
    rows.forEach((row, i) => {
      const hash = String(i + 1).repeat(64);
      const link = within(row).getByRole("link");
      expect(link.getAttribute("href")).toBe(
        `https://stellar.expert/explorer/testnet/tx/${hash}`,
      );
      expect(link.textContent).toBe(
        `${hash.slice(0, 8)}…${hash.slice(-8)} on Stellar Expert (opens in a new tab)`,
      );
    });
    expect(text(rows[3])).toContain("Fixture dispute rating");
    expect(text(rows[3])).toContain("D3");
  });

  it("renders the transcript from its file, without anything unsafe", () => {
    const { container } = render(<DemoArticle demo={published()} />);
    const section = screen.getByRole("heading", {
      level: 2,
      name: "Transcript",
    }).parentElement!;
    expect(
      within(section).getByRole("heading", { level: 4, name: "Operator" }),
    ).toBeTruthy();
    expect(text(section)).toContain(
      "one agent is excluded for being below the floor",
    );
    expect(
      within(section).queryByRole("link", { name: "unsafe one" }),
    ).toBeNull();
    expect(container.querySelector("script")).toBeNull();
  });

  it("links the guide, the ecosystem page and the repositories", () => {
    render(<DemoArticle demo={published()} />);
    const links = screen.getByRole("heading", {
      name: "Go further",
    }).parentElement!;
    const href = (name: string) =>
      within(links).getByRole("link", { name }).getAttribute("href");
    expect(href("List your agent")).toBe("/guide/list-your-agent");
    expect(href("Ecosystem")).toBe("/app/ecosystem");
    expect(href("Frontend repository")).toBe(
      "https://github.com/Bl0cksmiths/Orizon-Agents-FE-Stellar",
    );
    expect(href("Backend repository")).toBe(
      "https://github.com/Bl0cksmiths/Orizon-Agents-BE-Stellar",
    );
    expect(href("Smart contracts repository")).toBe(
      "https://github.com/Bl0cksmiths/Orizon-Agents-Smart-Contract-Stellar",
    );
  });
});

describe("the video facade", () => {
  it("is a link to YouTube before hydration, never a dead button", () => {
    const html = renderToStaticMarkup(
      <DemoPlayer video={published().video} chapters={published().chapters} />,
    );
    expect(html).not.toContain("<button");
    expect(html).not.toContain("<iframe");
    expect(html).not.toContain("youtube-nocookie");
    expect(html).toContain(
      'href="https://www.youtube.com/watch?v=fixtureVid0"',
    );
    expect(html).toContain(">Watch on YouTube</a>");
  });

  it("loads nothing from YouTube until Play, then swaps in the embed and focuses it", () => {
    const { container } = render(<DemoArticle demo={published()} />);
    expect(container.querySelector("iframe")).toBeNull();
    expect(container.innerHTML).not.toContain("youtube-nocookie");

    fireEvent.click(
      screen.getByRole("button", { name: `Play video: ${TITLE} (4 min 12 s)` }),
    );

    const frame = container.querySelector("iframe")!;
    expect(frame.getAttribute("src")).toBe(EMBED);
    expect(frame.getAttribute("title")).toBe(`YouTube video player: ${TITLE}`);
    expect(frame.getAttribute("referrerpolicy")).toBe(
      "strict-origin-when-cross-origin",
    );
    expect(frame.getAttribute("allow")).toContain("autoplay");
    expect(document.activeElement).toBe(frame);
    expect(screen.queryByRole("button", { name: /^Play video/ })).toBeNull();
  });

  it("keeps the Watch on YouTube link", () => {
    render(<DemoArticle demo={published()} />);
    expect(
      screen
        .getByRole("link", { name: "Watch on YouTube" })
        .getAttribute("href"),
    ).toBe("https://www.youtube.com/watch?v=fixtureVid0");
  });
});

describe("chapters", () => {
  it("list every chapter with its timestamp, deliverable and YouTube link", () => {
    render(<DemoArticle demo={published()} />);
    const list = screen.getByRole("heading", {
      name: "Chapters",
    }).parentElement!;
    const links = within(list).getAllByRole("link");
    expect(links.map(text)).toEqual([
      "0:00 What Orizon is",
      "0:25 An operator registers and binds an agent Deliverable D1: Permissionless agent registrationD1",
      "1:15 A buyer's plan excludes a sub-floor agent Deliverable D2: Reputation-gated routingD2",
      "2:20 A dispute is credited and the score falls Deliverable D3: Dispute window and partial-credit refundD3",
      "3:20 External operators on the ecosystem page Deliverable D4: Ecosystem validationD4",
      "3:52 Limitations",
    ]);
    expect(links[2].getAttribute("href")).toBe(
      "https://www.youtube.com/watch?v=fixtureVid0&t=75s",
    );
    expect(links[2].querySelector("time")!.getAttribute("dateTime")).toBe(
      "PT1M15S",
    );
  });

  it("seek by reloading the embed at their start, each time they are chosen", () => {
    const { container } = render(<DemoArticle demo={published()} />);
    const chapter = screen.getByRole("link", { name: /^1:15 / });

    fireEvent.click(chapter);
    const first = container.querySelector("iframe")!;
    expect(first.getAttribute("src")).toBe(`${EMBED}&start=75`);
    expect(document.activeElement).toBe(first);
    expect(chapter.getAttribute("aria-current")).toBe("true");

    // Choosing it again goes back to its start: a fresh frame, not a no-op.
    fireEvent.click(chapter);
    const second = container.querySelector("iframe")!;
    expect(second).not.toBe(first);
    expect(second.getAttribute("src")).toBe(`${EMBED}&start=75`);

    fireEvent.click(screen.getByRole("link", { name: /^0:00 / }));
    expect(container.querySelector("iframe")!.getAttribute("src")).toBe(EMBED);
    expect(chapter.getAttribute("aria-current")).toBeNull();
  });

  it("leave a modified click to the browser", () => {
    const { container } = render(<DemoArticle demo={published()} />);
    const chapter = screen.getByRole("link", { name: /^1:15 / });
    const allowed = fireEvent.click(chapter, { ctrlKey: true });
    expect(allowed).toBe(true);
    expect(container.querySelector("iframe")).toBeNull();
  });
});
