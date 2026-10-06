// @vitest-environment jsdom
/**
 * The last-resort error screen (app/global-error.tsx), shown when the root
 * layout itself failed: it brings its own <html> and styles, says the same
 * calm thing as the others, and reloads by itself on a chunk error.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ERROR_COPY } from "@/lib/error-recovery";
import type { RecoveryDeps } from "@/lib/use-error-recovery";

const deps = vi.hoisted(() => ({
  reload: vi.fn(),
  report: vi.fn(),
  store: new Map<string, string>(),
}));

vi.mock("@/lib/use-error-recovery", async (importOriginal) => {
  const real =
    await importOriginal<typeof import("@/lib/use-error-recovery")>();
  const store = deps.store;
  const testDeps: RecoveryDeps = {
    reload: deps.reload,
    report: deps.report,
    getStorage: () =>
      ({
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => void store.set(k, v),
      }) as unknown as Storage,
    now: () => 1_791_000_000_000,
    route: () => "/",
  };
  return {
    ...real,
    useErrorRecovery: (error: Error) => real.useErrorRecovery(error, testDeps),
  };
});

import GlobalError from "./global-error";

beforeEach(() => {
  deps.reload.mockReset();
  deps.report.mockReset();
  deps.store.clear();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// The component renders <html> and <body>, which React mounts under the test
// container as it would replace the root layout's in a browser. Only React's
// warning about that nesting is silenced.
const show = (error: Error) => {
  const log = console.error.bind(console);
  vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    if (!String(args[0]).includes("validateDOMNesting")) log(...args);
  });
  return render(<GlobalError error={error} reset={() => {}} />);
};

describe("the last-resort error screen", () => {
  it("brings its own document, in English", () => {
    const { container } = show(new Error("boom"));
    expect(container.querySelector("html")?.getAttribute("lang")).toBe("en");
    expect(container.querySelector("html > body main#main")).not.toBeNull();
  });

  it("says the page didn't load, in plain words, and focuses the heading", () => {
    show(new Error("boom"));
    const heading = screen.getByRole("heading", {
      level: 1,
      name: "This page didn't load",
    });
    expect(document.activeElement).toBe(heading);
    expect(screen.getByText(ERROR_COPY.message.render)).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/fault|subsystem/i);
  });

  it("offers Reload and a full page load home", () => {
    show(new Error("boom"));
    fireEvent.click(screen.getByRole("button", { name: "Reload" }));
    expect(deps.reload).toHaveBeenCalledTimes(1);
    expect(
      screen
        .getByRole("link", { name: "Go to the home page" })
        .getAttribute("href"),
    ).toBe("/");
  });

  it("marks its root for the deploy smoke check, on the screen and while reloading", () => {
    const { container, unmount } = show(new Error("boom"));
    expect(
      container.querySelectorAll('[data-error-boundary="global"]'),
    ).toHaveLength(1);
    unmount();
    const reloading = show(
      Object.assign(new Error("Loading chunk 2 failed."), {
        name: "ChunkLoadError",
      }),
    );
    expect(
      reloading.container.querySelectorAll('[data-error-boundary="global"]'),
    ).toHaveLength(1);
  });

  it("reloads by itself on a chunk error and shows no error screen", () => {
    show(
      Object.assign(new Error("Loading chunk 3 failed."), {
        name: "ChunkLoadError",
      }),
    );
    expect(deps.reload).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("status").textContent).toBe(ERROR_COPY.reloading);
    expect(screen.queryByRole("heading")).toBeNull();
  });

  it("names the document and keeps it out of search results, on the screen and while reloading", () => {
    // It replaces the whole document, <head> included: without its own
    // title a search engine names the page after the heading, and without
    // noindex it indexes the error as the page.
    for (const error of [
      new Error("boom"),
      Object.assign(new Error("Loading chunk 4 failed."), {
        name: "ChunkLoadError",
      }),
    ]) {
      const { container, unmount } = show(error);
      const head = container.querySelector("html > head");
      expect(head?.querySelector("title")?.textContent).toBe(
        ERROR_COPY.documentTitle,
      );
      expect(
        head?.querySelector('meta[name="robots"]')?.getAttribute("content"),
      ).toBe("noindex");
      unmount();
    }
  });
});
