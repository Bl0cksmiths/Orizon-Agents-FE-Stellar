// @vitest-environment jsdom
/**
 * Unit tests for ArtifactViewer.
 *
 * The viewer draws two producers' artifacts. A first-party worker sends every
 * field (`CodeArtifact` in app/schemas.py). An external operator's artifact
 * is rebuilt from an allowlist (`_parse_artifact`,
 * app/agents/workers/external_contract.py): its files never carry a
 * `language`, and any of `title`, `files` and `preview_html` may be missing.
 * The first live one (tsk_7e1c369cebaf41b3, 2026-09-30) is the `external`
 * fixture below.
 *
 * Assertions are plain DOM checks — this repo does not install jest-dom.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import type { CodeArtifact } from "@/lib/types";

// The code viewer is a lazily loaded chunk in the app; here it is the real
// component, rendered synchronously, so the files panel shows code at once.
vi.mock("next/dynamic", async () => {
  const { CodeViewer } = await import("./code-viewer");
  return { default: () => CodeViewer };
});

const { ArtifactViewer, fileKind } = await import("./artifact-viewer");

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const REPORT = "<!doctype html><p>3000</p>";

const external: CodeArtifact = {
  title: "Add 250 and 750, then multiply the result by 3",
  files: [{ path: "report.html", content: REPORT }],
  preview_html: REPORT,
};

const firstParty: CodeArtifact = {
  title: "Calculator",
  summary: "a calculator",
  entry: "index.html",
  files: [{ path: "index.html", language: "html", content: "<html></html>" }],
  preview_html: "<html></html>",
};

const openFiles = () =>
  fireEvent.click(screen.getByRole("tab", { name: "files" }));

describe("fileKind", () => {
  it("names the declared language, or plain text when there is none", () => {
    expect(fileKind({ path: "a.css", language: "css", content: "" })).toBe(
      "css",
    );
    expect(fileKind({ path: "report.html", content: "" })).toBe("plain text");
    expect(fileKind({ path: "x", language: null, content: "" })).toBe(
      "plain text",
    );
  });
});

describe("ArtifactViewer", () => {
  it("shows an external agent's file with no language as labelled plain text", () => {
    const { container } = render(<ArtifactViewer artifact={external} />);
    openFiles();
    expect(screen.getByText("report.html · plain text")).toBeTruthy();
    const region = screen.getByRole("region", {
      name: "report.html, plain text",
    });
    expect(region.textContent).toContain("<p>3000</p>");
    expect(container.querySelectorAll(".token")).toHaveLength(0);
  });

  it("still labels and highlights a file that declares its language", () => {
    const { container } = render(<ArtifactViewer artifact={firstParty} />);
    openFiles();
    expect(screen.getByText("index.html · html")).toBeTruthy();
    expect(
      screen.getByRole("region", { name: "index.html, html" }),
    ).toBeTruthy();
    expect(container.querySelectorAll(".token").length).toBeGreaterThan(0);
  });

  it("downloads a file with no language as text/plain", () => {
    const blobs: Blob[] = [];
    URL.createObjectURL = vi.fn((b: Blob) => {
      blobs.push(b);
      return "blob:x";
    });
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    render(<ArtifactViewer artifact={external} />);
    fireEvent.click(screen.getByRole("button", { name: /download/ }));
    expect(blobs.map((b) => b.type)).toEqual(["text/plain"]);
  });

  it("falls back to 'artifact' for a missing title, as the trace line does", () => {
    const { title: _t, ...untitled } = external;
    const { container } = render(<ArtifactViewer artifact={untitled} />);
    expect(container.querySelector("iframe")?.getAttribute("title")).toBe(
      "artifact",
    );
  });

  it("opens on the files when the agent sent no preview", () => {
    const { preview_html: _p, ...noPreview } = external;
    const { container } = render(<ArtifactViewer artifact={noPreview} />);
    expect(
      screen.getByRole("tab", { name: "files" }).getAttribute("aria-selected"),
    ).toBe("true");
    expect(screen.getByText("report.html · plain text")).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "preview" }));
    expect(container.querySelector("iframe")).toBeNull();
    expect(screen.getByText(/This agent sent no preview/)).toBeTruthy();
  });

  it("offers no download when the agent sent no files", () => {
    const { files: _f, ...noFiles } = external;
    render(<ArtifactViewer artifact={noFiles} />);
    expect(screen.queryByRole("button", { name: /download/ })).toBeNull();
    expect(screen.getByText(/0 files/)).toBeTruthy();
    openFiles();
    expect(screen.getByText("This agent sent no files.")).toBeTruthy();
  });
});
