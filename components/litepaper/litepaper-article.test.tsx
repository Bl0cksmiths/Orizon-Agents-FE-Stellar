// @vitest-environment jsdom
/**
 * Rendering tests for /litepaper, against the fixture book in
 * test/fixtures/litepaper/. What is asserted is what a reader depends on:
 * the cover facts as the source states them, a link per file whose name says
 * its type and size, the §6 link, every listed change, and the source note.
 *
 * Assertions are plain DOM checks — this repo does not install jest-dom.
 */

import path from "node:path";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { LITEPAPER_CHANGES } from "@/lib/litepaper/changes";
import { loadLitepaper } from "@/lib/litepaper/load";
import { LitepaperArticle } from "./litepaper-article";

const FIXTURE = path.resolve(__dirname, "../../test/fixtures/litepaper");
const paper = () => loadLitepaper({ LITEPAPER_DIR: FIXTURE });

const text = (el: Element | null) =>
  (el?.textContent ?? "").replace(/\s+/g, " ").trim();

afterEach(cleanup);

describe("litepaper article", () => {
  it("heads the page with the cover's title, version and date", () => {
    const { container } = render(<LitepaperArticle paper={paper()} />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
      "The Orizon Agents Protocol Litepaper (fixture)",
    );
    expect(text(container.querySelector("[data-version]"))).toBe("0.5");
    const time = container.querySelector("[data-date] time")!;
    expect(time.getAttribute("dateTime")).toBe("2026-09-27");
    expect(time.textContent).toBe("September 27, 2026");
  });

  it("links each file by name, type and size, at its clean URL and content type", () => {
    const p = paper();
    render(<LitepaperArticle paper={p} />);
    const expected = [
      ["PDF document", "PDF", "orizon-agents-litepaper.pdf", "application/pdf"],
      ["Web page", "HTML", "orizon-agents-litepaper.html", "text/html"],
      [
        "Word document",
        "DOCX",
        "orizon-agents-litepaper.docx",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ],
      ["Markdown text", "MD", "orizon-agents-litepaper.md", "text/markdown"],
    ];
    for (const [name, type, file, contentType] of expected) {
      const size = p.downloads.find((d) => d.type === type)!.size;
      const link = screen.getByRole("link", {
        name: `${name} (${type}, ${size})`,
      });
      expect(link.getAttribute("href")).toBe(`/litepaper/${file}`);
      expect(link.getAttribute("type")).toBe(contentType);
      expect(link.getAttribute("target")).toBeNull();
    }
    expect(p.downloads.map((d) => d.size)).toEqual([
      "591 bytes",
      expect.stringMatching(/^\d+ bytes$|^\d KB$/),
      "507 bytes",
      expect.stringMatching(/^\d+ bytes$/),
    ]);
  });

  it("links straight to §6 in the web page, saying how big it is", () => {
    const p = paper();
    render(<LitepaperArticle paper={p} />);
    const html = p.downloads.find((d) => d.format === "html")!;
    const link = screen.getByRole("link", {
      name: `Go straight to §6 · Operations and Governance, in the web page (HTML, ${html.size})`,
    });
    expect(link.getAttribute("href")).toBe(
      "/litepaper/orizon-agents-litepaper.html#operations-and-governance",
    );
  });

  it("lists every v0.5 change with its subsection and whether it is new or corrected", () => {
    render(<LitepaperArticle paper={paper()} />);
    const box = screen
      .getByRole("heading", { name: "What changed in v0.5" })
      .closest("section")!;
    const items = within(box).getAllByRole("listitem");
    expect(items).toHaveLength(LITEPAPER_CHANGES.length);
    LITEPAPER_CHANGES.forEach((c, i) => {
      const heading = within(items[i]).getByRole("heading", { level: 3 });
      expect(text(heading)).toBe(
        `${c.title} ${c.kind === "new" ? "New" : "Corrected"} · ${c.where}`,
      );
      expect(text(items[i])).toContain(c.text);
    });
    const titles = LITEPAPER_CHANGES.map((c) => c.title);
    for (const t of [
      "Open registration",
      "Reputation-gated routing and the cold start",
      "The dispute window and platform-funded credit",
      "Settler rotation, corrected",
      "Orchestrator routing, corrected",
      "Reputation floor, corrected",
    ]) {
      expect(titles).toContain(t);
    }
  });

  it("says the source and build live under litepaper/, linking GitHub safely", () => {
    render(<LitepaperArticle paper={paper()} />);
    const source = screen
      .getByRole("heading", { name: "Source" })
      .closest("section")!;
    expect(text(source)).toContain(
      "in the frontend repository, under litepaper/",
    );
    const link = within(source).getByRole("link", {
      name: "The litepaper folder on GitHub (opens GitHub)",
    });
    expect(link.getAttribute("href")).toBe(
      "https://github.com/Bl0cksmiths/Orizon-Agents-FE-Stellar/tree/main/litepaper",
    );
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
    expect(link.getAttribute("target")).toBe("_blank");
  });
});
