// @vitest-environment jsdom
/**
 * The local error boundary (components/isolate.tsx): a part of the page that
 * throws is replaced by its fallback, the rest of the page stays, and the
 * failure is reported once under the part's name.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

const report = vi.hoisted(() => vi.fn());
vi.mock("@/lib/report-error", () => ({ reportClientError: report }));

import { Isolate } from "./isolate";

function Broken({ error }: { error: Error }): never {
  throw error;
}

afterEach(() => {
  cleanup();
  report.mockReset();
  vi.restoreAllMocks();
});

/** React logs every error a boundary catches; the tests read the DOM. */
const quietly = () => vi.spyOn(console, "error").mockImplementation(() => {});

describe("Isolate", () => {
  it("renders what it wraps while nothing fails", () => {
    render(
      <Isolate name="nav" fallback={<p>fallback</p>}>
        <p>the nav</p>
      </Isolate>,
    );
    expect(screen.getByText("the nav")).toBeTruthy();
    expect(screen.queryByText("fallback")).toBeNull();
    expect(report).not.toHaveBeenCalled();
  });

  it("puts the fallback in place of a part that throws, and keeps its siblings", () => {
    quietly();
    render(
      <main>
        <h1>The page</h1>
        <Isolate name="nav" fallback={<p>static nav</p>}>
          <Broken error={new Error("boom")} />
        </Isolate>
      </main>,
    );
    expect(screen.getByRole("heading", { name: "The page" })).toBeTruthy();
    expect(screen.getByText("static nav")).toBeTruthy();
  });

  it("draws nothing for a part with no fallback", () => {
    quietly();
    const { container } = render(
      <div>
        <Isolate name="copy-button">
          <Broken error={new Error("boom")} />
        </Isolate>
      </div>,
    );
    expect(container.innerHTML).toBe("<div></div>");
  });

  it("reports the failure once, by kind and part, as isolated", () => {
    quietly();
    const lost = Object.assign(new Error("Loading chunk 7 failed."), {
      name: "ChunkLoadError",
    });
    render(
      <Isolate name="analytics">
        <Broken error={lost} />
      </Isolate>,
    );
    expect(report).toHaveBeenCalledTimes(1);
    expect(report).toHaveBeenCalledWith(lost, {
      kind: "chunk",
      route: "/",
      recovery: "isolated",
      part: "analytics",
    });
  });

  it("stays on its fallback rather than reloading the page for a lost chunk", () => {
    quietly();
    const reload = vi.fn();
    vi.spyOn(window, "location", "get").mockReturnValue({
      ...window.location,
      pathname: "/",
      reload,
    });
    render(
      <Isolate name="analytics" fallback={<p>no analytics</p>}>
        <Broken
          error={Object.assign(new Error("x"), { name: "ChunkLoadError" })}
        />
      </Isolate>,
    );
    expect(screen.getByText("no analytics")).toBeTruthy();
    expect(reload).not.toHaveBeenCalled();
  });
});
