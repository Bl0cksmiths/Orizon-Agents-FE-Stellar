// @vitest-environment jsdom
/**
 * Rendering tests for the guide page, against the fixture guide that uses
 * every construct of the dialect.
 *
 * What is asserted is what a reader depends on: the header says which API
 * the guide was checked against, every block is captioned, badged, linkable
 * and copyable, callouts say their kind in words, tables scroll inside a
 * named region, and nothing from raw HTML reaches the page.
 *
 * Assertions are plain DOM checks — this repo does not install jest-dom.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { parseGuide } from "@/lib/guide/parse";
import type { LoadedGuide } from "@/lib/guide/load";
import { GuideArticle } from "./guide-article";

const FIXTURE = path.resolve(
  __dirname,
  "../../test/fixtures/guides/list-your-agent.md",
);
const SOURCE = readFileSync(FIXTURE, "utf8");

function guide(source = SOURCE): LoadedGuide {
  return { ...parseGuide(source, "fixture.md"), slug: "list-your-agent" };
}

const text = (el: Element) => (el.textContent ?? "").replace(/\s+/g, " ");

afterEach(cleanup);

describe("guide header", () => {
  it("names the version, the backend commit, the date and the network", () => {
    render(<GuideArticle guide={guide()} />);
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "List your agent on Orizon",
      }),
    ).toBeTruthy();
    const commit = screen.getByRole("link", { name: "Backend commit 1e3c60d" });
    expect(commit.getAttribute("href")).toBe(
      "https://github.com/Bl0cksmiths/Orizon-Agents-BE-Stellar/commit/1e3c60d4b2a9f7e8c6d5b4a3f2e1d0c9b8a7f6e5",
    );
    const header = commit.closest("header")!;
    expect(text(header)).toContain("Version0.9.0");
    expect(text(header)).toContain("Verified against backend1e3c60d");
    expect(text(header)).toContain("UpdatedSeptember 29, 2026");
    expect(text(header)).toContain("Networktestnet");
    expect(header.querySelector("time")?.getAttribute("dateTime")).toBe(
      "2026-09-29",
    );
  });

  it("says a draft is a draft, and says nothing once validated", () => {
    render(<GuideArticle guide={guide()} />);
    const notice = document.querySelector('[data-guide-status="draft"]')!;
    expect(notice.getAttribute("role")).toBe("note");
    expect(text(notice)).toContain("Draft — not yet validated by a newcomer.");
    cleanup();

    render(
      <GuideArticle
        guide={guide(SOURCE.replace("status: draft", "status: validated"))}
      />,
    );
    expect(document.querySelector("[data-guide-status]")).toBeNull();
    expect(document.body.textContent).not.toContain("not yet validated");
  });

  it("explains every verify badge in words on the page", () => {
    render(<GuideArticle guide={guide()} />);
    const legend = screen.getByRole("region", {
      name: "Reading the code blocks",
    });
    for (const label of ["Runs live", "Runs offline", "Needs your key"]) {
      expect(text(legend)).toContain(label);
    }
  });
});

describe("contents and headings", () => {
  it("lists ## and ### headings, nesting each ### under its ##", () => {
    render(<GuideArticle guide={guide()} />);
    const nav = screen.getByRole("navigation", { name: "On this page" });
    const hrefs = within(nav)
      .getAllByRole("link")
      .map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual([
      "#before-you-start",
      "#register-your-agent",
      "#check-the-network",
      "#sign-the-registration",
      "#verify-a-dispatch",
      "#trust-boundaries",
      "#error-codes",
      "#error-codes-1",
    ]);
    const register = within(nav)
      .getByRole("link", { name: "Register your agent" })
      .closest("li")!;
    expect(
      within(register)
        .getAllByRole("link")
        .map((a) => a.textContent),
    ).toEqual([
      "Register your agent",
      "Check the network",
      "Sign the registration",
    ]);
  });

  it("gives each heading its slug id and an anchor link", () => {
    render(<GuideArticle guide={guide()} />);
    const heading = screen.getByRole("heading", {
      level: 2,
      name: "Trust boundaries",
    });
    expect(heading.id).toBe("trust-boundaries");
    // Beside the heading, so it is not read as part of the heading's name.
    const anchor = within(heading.parentElement!).getByRole("link", {
      name: "Link to the section Trust boundaries",
    });
    expect(anchor.getAttribute("href")).toBe("#trust-boundaries");
  });

  it("keeps the heading order: one h1, then h2 and h3", () => {
    render(<GuideArticle guide={guide()} />);
    const levels = screen
      .getAllByRole("heading")
      .map((h) => Number(h.tagName.slice(1)));
    expect(levels[0]).toBe(1);
    expect(levels.filter((l) => l === 1)).toHaveLength(1);
    for (let i = 1; i < levels.length; i++) {
      expect(levels[i] - levels[i - 1]).toBeLessThanOrEqual(1);
    }
  });
});

describe("code blocks", () => {
  it("captions, badges, links and names the copy button of each sample", () => {
    render(<GuideArticle guide={guide()} />);
    const figure = document.getElementById("read-network")!;
    expect(figure.tagName).toBe("FIGURE");
    const caption = figure.querySelector("figcaption")!;
    expect(text(caption)).toContain("bash");
    expect(text(caption)).toContain("Read the network");
    expect(text(caption)).toContain("Runs live");
    expect(
      within(caption).getByRole("button", { name: "Copy Read the network" }),
    ).toBeTruthy();
    expect(
      within(caption)
        .getByRole("link", { name: "Link to Read the network" })
        .getAttribute("href"),
    ).toBe("#read-network");
    expect(document.getElementById("read-network-code")?.textContent).toBe(
      'curl -s "$ORIZON_API/api/stellar/network" | python3 -m json.tool',
    );
  });

  it.each([
    ["set-env", "Needs your key"],
    ["sign-registration", "Runs offline"],
    ["read-network", "Runs live"],
  ])("badges %s as %s", (id, label) => {
    render(<GuideArticle guide={guide()} />);
    const badge = document.getElementById(id)!.querySelector("[data-verify]")!;
    expect(badge.textContent).toBe(label);
  });

  it("draws a response written right after its sample inside that sample", () => {
    render(<GuideArticle guide={guide()} />);
    const response = document.getElementById("read-network-response")!;
    expect(response.closest("figure")?.id).toBe("read-network");
    expect(text(response)).toContain("Expected response");
    expect(text(response)).toContain("The network answer");
    expect(
      within(response).getByRole("button", {
        name: "Copy expected response: The network answer",
      }),
    ).toBeTruthy();
    // A response is not run, so it carries no verify badge.
    expect(response.querySelector("[data-verify]")).toBeNull();
  });

  it("points a response separated by prose back at its sample", () => {
    render(<GuideArticle guide={guide()} />);
    const response = document.getElementById("sign-registration-response")!;
    expect(response.tagName).toBe("FIGURE");
    expect(text(response)).toContain("Expected response");
    expect(
      within(response)
        .getByRole("link", { name: "Sign the registration payload" })
        .getAttribute("href"),
    ).toBe("#sign-registration");
  });

  it("lets the code scroll inside a focusable frame", () => {
    render(<GuideArticle guide={guide()} />);
    const pre = document.getElementById(
      "sign-registration-code",
    )!.parentElement!;
    expect(pre.tagName).toBe("PRE");
    expect(pre.getAttribute("tabindex")).toBe("0");
    expect(pre.className).toContain("overflow-x-auto");
  });
});

describe("callouts, quotes, tables and lists", () => {
  it("renders each callout as a note with its kind in words and an icon", () => {
    render(<GuideArticle guide={guide()} />);
    const notes = Array.from(document.querySelectorAll("aside[data-callout]"));
    expect(notes.map((n) => n.getAttribute("data-callout"))).toEqual([
      "note",
      "warning",
      "limitation",
    ]);
    for (const note of notes) {
      expect(note.getAttribute("role")).toBe("note");
      expect(note.querySelector("svg")?.getAttribute("aria-hidden")).toBe(
        "true",
      );
    }
    expect(text(notes[1])).toBe(
      "WarningNever paste your secret key into a web page. The samples read it from your environment.",
    );
  });

  it("keeps a plain quotation as a quotation", () => {
    render(<GuideArticle guide={guide()} />);
    const quotes = document.querySelectorAll("blockquote");
    expect(quotes).toHaveLength(1);
    expect(text(quotes[0]).trim()).toBe(
      "A plain quotation stays a quotation, not a callout.",
    );
  });

  it("scrolls each table inside a focusable region named for its section", () => {
    render(<GuideArticle guide={guide()} />);
    for (const name of ["Trust boundaries table", "Error codes table"]) {
      const region = screen.getByRole("region", { name });
      expect(region.getAttribute("tabindex")).toBe("0");
      expect(region.className).toContain("overflow-x-auto");
      expect(within(region).getByRole("table")).toBeTruthy();
    }
    const codes = screen.getByRole("region", { name: "Error codes table" });
    expect(
      within(codes)
        .getAllByRole("columnheader")
        .map((th) => th.textContent),
    ).toEqual(["Code", "Meaning", "What to do"]);
    expect(text(codes)).toContain("rate_limited");
  });

  it("says each task-list item's state in words, with no form controls", () => {
    render(<GuideArticle guide={guide()} />);
    expect(document.querySelectorAll("input")).toHaveLength(0);
    const items = Array.from(
      document.querySelectorAll("ul.contains-task-list > li, ul li"),
    )
      .map(text)
      .filter((t) => /^(Done|To do): /.test(t.replace(/^[☑☐]/, "")));
    expect(items.map((t) => t.replace(/^[☑☐]/, ""))).toEqual([
      "Done: A Stellar testnet account",
      "To do: An HTTPS endpoint for your agent",
      "To do: About twenty minutes",
    ]);
  });
});

describe("links and raw HTML", () => {
  it("marks external links noreferrer and autolinks bare URLs", () => {
    render(<GuideArticle guide={guide()} />);
    const site = screen.getByRole("link", { name: "https://orizons.xyz" });
    expect(site.getAttribute("href")).toBe("https://orizons.xyz");
    expect(site.getAttribute("rel")).toBe("noreferrer");
  });

  it("renders nothing from raw HTML and unlinks an unsafe target", () => {
    render(<GuideArticle guide={guide()} />);
    const article = document.querySelector("article")!;
    expect(article.querySelector("script")).toBeNull();
    expect(article.querySelector("b")).toBeNull();
    expect(article.querySelector("[onclick]")).toBeNull();
    expect(article.innerHTML).not.toContain("__guideInjected");
    expect(text(article)).toContain("Raw HTML like this is stripped");
    expect(screen.queryByRole("link", { name: "bad link" })).toBeNull();
    expect(screen.getByText("bad link").tagName).toBe("SPAN");
  });
});
