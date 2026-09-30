// @vitest-environment jsdom
/**
 * Unit tests for CodeViewer.
 *
 * An external operator's artifact files arrive with no `language` — the
 * backend drops it (`_parse_files`, app/agents/workers/external_contract.py).
 * The viewer used to call `language.toLowerCase()` unconditionally; now a file
 * with no language renders as plain text: the same lines, no token colouring
 * that would claim a grammar nobody declared.
 *
 * Assertions are plain DOM checks — this repo does not install jest-dom.
 */

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { CodeViewer } from "./code-viewer";

afterEach(cleanup);

const HTML = '<!doctype html>\n<p class="total">3000</p>\n';

describe("CodeViewer", () => {
  it.each([
    ["absent", undefined],
    ["null", null],
    ["empty", ""],
  ])("renders a file whose language is %s as plain text", (_, language) => {
    const { container } = render(
      <CodeViewer
        language={language}
        code={HTML}
        label="report.html, plain text"
      />,
    );
    const code = container.querySelector("pre code");
    expect(code?.textContent).toContain('<p class="total">3000</p>');
    // No grammar ran: the highlighter emits no token spans at all.
    expect(container.querySelectorAll(".token")).toHaveLength(0);
  });

  it("highlights a file that declares its language", () => {
    const { container } = render(
      <CodeViewer language="HTML" code={HTML} label="index.html, html" />,
    );
    expect(container.querySelectorAll(".token").length).toBeGreaterThan(0);
  });

  it("names its scrollable region after the file and makes it reachable", () => {
    render(<CodeViewer code={HTML} label="report.html, plain text" />);
    const region = screen.getByRole("region", {
      name: "report.html, plain text",
    });
    expect(region.getAttribute("tabindex")).toBe("0");
  });
});
