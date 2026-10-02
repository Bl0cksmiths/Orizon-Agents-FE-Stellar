// @vitest-environment jsdom
/**
 * Rendering tests for the demo page in both states, against the fixture
 * manifests in test/fixtures/demo/.
 *
 * What is asserted is what a reviewer depends on: an unpublished page shows
 * nothing as real (no player, no poster, no evidence) and says so in the
 * agreed words; a published page shows each part with its own details and
 * player, says when a part shows an earlier console, keeps YouTube off the
 * page until Play, then puts the viewer inside the player; chapters seek
 * their own part's player by reloading at their time; every evidence row
 * links to its own testnet transaction; and the limitations are there either
 * way.
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

const OPERATOR = "Fixture: an operator registers an agent";
const BUYER = "Fixture: a buyer pays for a workflow";
const embed = (id: string) =>
  `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&cc_load_policy=1`;
const EMBED = embed("fixtureOpr1");
const BUYER_EMBED = embed("fixtureBuy2");

const text = (el: Element) => (el.textContent ?? "").replace(/\s+/g, " ");

/** The section of part `n` (from 1), found by its heading. */
const part = (n: number) =>
  screen.getByRole("heading", { level: 2, name: new RegExp(`^Part ${n}: `) })
    .parentElement!;

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

  it("shows no part, player, poster, chapter or evidence", () => {
    const { container } = render(<DemoArticle demo={load("unpublished")} />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(container.querySelector("iframe, img, video")).toBeNull();
    expect(screen.queryByRole("heading", { name: /^Part \d/ })).toBeNull();
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
  it("gives the number of parts, their running time together and the network", () => {
    const { container } = render(<DemoArticle demo={published()} />);
    const header = container.querySelector("header")!;
    expect(text(header)).toContain("Parts2");
    expect(text(header)).toContain("Running time4 min 12 s together");
    expect(text(header)).toContain("Networktestnet");
    expect(header.querySelector("time")!.getAttribute("dateTime")).toBe(
      "PT4M12S",
    );
  });

  it("shows each part in order with whose side it is, its title, length, date and captions", () => {
    render(<DemoArticle demo={published()} />);
    expect(
      screen
        .getAllByRole("heading", { level: 2, name: /^Part \d/ })
        .map((h) => h.textContent),
    ).toEqual(["Part 1: The operator's side", "Part 2: The buyer's side"]);

    expect(text(part(1))).toContain(`Video${OPERATOR}`);
    expect(text(part(1))).toContain("Length2 min 30 s");
    expect(text(part(1))).toContain("PublishedOctober 2, 2026");
    expect(text(part(2))).toContain(`Video${BUYER}`);
    expect(text(part(2))).toContain("Length1 min 42 s");
    expect(text(part(2))).toContain("PublishedJuly 24, 2026");

    for (const [n, file] of [
      [1, "/demo/operator.en.vtt"],
      [2, "/demo/buyer.en.vtt"],
    ] as const) {
      const captions = within(part(n)).getByRole("link", {
        name: `English (WebVTT), part ${n}`,
      });
      expect(captions.getAttribute("href")).toBe(file);
      expect(captions.hasAttribute("download")).toBe(true);
    }
  });

  it("says in one plain sentence that a part shows an earlier console, and only for that part", () => {
    const { container } = render(<DemoArticle demo={published()} />);
    const notes = container.querySelectorAll("[data-earlier-console]");
    expect(notes).toHaveLength(1);
    expect(part(2).contains(notes[0])).toBe(true);
    expect(notes[0].textContent).toBe(
      "This part was recorded on July 20, 2026, on an earlier version of the console than the one live now.",
    );
  });

  it("states the limitations", () => {
    render(<DemoArticle demo={published()} />);
    expectLimitations();
  });

  it("labels the evidence as the sprint's own transactions, not the videos' payments", () => {
    render(<DemoArticle demo={published()} />);
    const section = screen.getByRole("heading", {
      level: 2,
      name: "On-chain evidence",
    }).parentElement!;
    expect(text(section)).toContain(
      "The sprint’s own transactions on Stellar testnet",
    );
    expect(text(section)).toContain(
      "They are not the payments seen in the videos.",
    );
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

  it("renders each part's transcript from its own file, without anything unsafe", () => {
    const { container } = render(<DemoArticle demo={published()} />);
    const section = screen.getByRole("heading", {
      level: 2,
      name: "Transcript",
    }).parentElement!;
    expect(
      within(section)
        .getAllByRole("heading", { level: 3 })
        .map((h) => h.textContent),
    ).toEqual(["Part 1: The operator's side", "Part 2: The buyer's side"]);
    const operator = within(section).getByRole("heading", {
      level: 3,
      name: "Part 1: The operator's side",
    }).parentElement!;
    const buyer = within(section).getByRole("heading", {
      level: 3,
      name: "Part 2: The buyer's side",
    }).parentElement!;
    expect(text(operator)).toContain(OPERATOR);
    expect(
      within(operator).getByRole("heading", { level: 5, name: "Registering" }),
    ).toBeTruthy();
    expect(text(operator)).toContain("binds its endpoint");
    expect(
      within(operator).queryByRole("link", { name: "unsafe one" }),
    ).toBeNull();
    // A plain-text transcript keeps its line breaks.
    expect(text(buyer)).toContain(BUYER);
    expect(text(buyer)).toContain(
      "one agent is excluded for being below the floor",
    );
    expect(buyer.querySelector("p br")).not.toBeNull();
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
    const first = published().parts[0];
    const html = renderToStaticMarkup(
      <DemoPlayer video={first} chapters={first.chapters} index={0} />,
    );
    expect(html).not.toContain("<button");
    expect(html).not.toContain("<iframe");
    expect(html).not.toContain("youtube-nocookie");
    expect(html).toContain(
      'href="https://www.youtube.com/watch?v=fixtureOpr1"',
    );
    expect(html).toContain(">Watch part 1 on YouTube</a>");
  });

  it("loads nothing from YouTube until Play, then swaps in that part's embed and focuses it", () => {
    const { container } = render(<DemoArticle demo={published()} />);
    expect(container.querySelector("iframe")).toBeNull();
    expect(container.innerHTML).not.toContain("youtube-nocookie");

    fireEvent.click(
      screen.getByRole("button", {
        name: `Play video: ${BUYER} (1 min 42 s)`,
      }),
    );

    const frame = container.querySelector("iframe")!;
    expect(part(2).contains(frame)).toBe(true);
    expect(frame.getAttribute("src")).toBe(BUYER_EMBED);
    expect(frame.getAttribute("title")).toBe(`YouTube video player: ${BUYER}`);
    expect(frame.getAttribute("referrerpolicy")).toBe(
      "strict-origin-when-cross-origin",
    );
    expect(frame.getAttribute("allow")).toContain("autoplay");
    expect(document.activeElement).toBe(frame);
    // The other part's player is untouched.
    expect(
      screen.getByRole("button", {
        name: `Play video: ${OPERATOR} (2 min 30 s)`,
      }),
    ).toBeTruthy();
    expect(container.querySelectorAll("iframe")).toHaveLength(1);
  });

  it("keeps a Watch on YouTube link for each part", () => {
    render(<DemoArticle demo={published()} />);
    expect(
      screen
        .getByRole("link", { name: "Watch part 1 on YouTube" })
        .getAttribute("href"),
    ).toBe("https://www.youtube.com/watch?v=fixtureOpr1");
    expect(
      screen
        .getByRole("link", { name: "Watch part 2 on YouTube" })
        .getAttribute("href"),
    ).toBe("https://www.youtube.com/watch?v=fixtureBuy2");
  });
});

describe("chapters", () => {
  it("list each part's chapters with their timestamp, any deliverable and their YouTube link", () => {
    render(<DemoArticle demo={published()} />);
    const chapters = (n: number) =>
      within(
        within(part(n)).getByRole("heading", { level: 3, name: "Chapters" })
          .parentElement!,
      ).getAllByRole("link");
    expect(chapters(1).map(text)).toEqual([
      "0:00 What Orizon is",
      "0:25 An operator registers and binds an agent Deliverable D1: Permissionless agent registrationD1",
      "1:15 External operators on the ecosystem page Deliverable D4: Ecosystem validationD4",
    ]);
    expect(chapters(2).map(text)).toEqual([
      "0:00 A buyer connects a wallet",
      "0:20 A buyer's plan excludes a sub-floor agent Deliverable D2: Reputation-gated routingD2",
      "1:20 A dispute is credited and the score falls Deliverable D3: Dispute window and partial-credit refundD3",
    ]);
    expect(chapters(2)[2].getAttribute("href")).toBe(
      "https://www.youtube.com/watch?v=fixtureBuy2&t=80s",
    );
    expect(chapters(2)[2].querySelector("time")!.getAttribute("dateTime")).toBe(
      "PT1M20S",
    );
  });

  it("seek their own part's player by reloading it at their start, each time they are chosen", () => {
    const { container } = render(<DemoArticle demo={published()} />);
    const chapter = screen.getByRole("link", { name: /^1:20 / });

    fireEvent.click(chapter);
    const first = container.querySelector("iframe")!;
    expect(part(2).contains(first)).toBe(true);
    expect(first.getAttribute("src")).toBe(`${BUYER_EMBED}&start=80`);
    expect(document.activeElement).toBe(first);
    expect(chapter.getAttribute("aria-current")).toBe("true");

    // Choosing it again goes back to its start: a fresh frame, not a no-op.
    fireEvent.click(chapter);
    const second = container.querySelector("iframe")!;
    expect(second).not.toBe(first);
    expect(second.getAttribute("src")).toBe(`${BUYER_EMBED}&start=80`);

    // A chapter of the first part plays the first part, leaving the second.
    fireEvent.click(screen.getByRole("link", { name: /^1:15 / }));
    const frames = container.querySelectorAll("iframe");
    expect(frames).toHaveLength(2);
    expect(part(1).contains(frames[0])).toBe(true);
    expect(frames[0].getAttribute("src")).toBe(`${EMBED}&start=75`);
    expect(frames[1].getAttribute("src")).toBe(`${BUYER_EMBED}&start=80`);
    expect(document.activeElement).toBe(frames[0]);

    fireEvent.click(within(part(2)).getByRole("link", { name: /^0:00 / }));
    expect(part(2).querySelector("iframe")!.getAttribute("src")).toBe(
      BUYER_EMBED,
    );
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
