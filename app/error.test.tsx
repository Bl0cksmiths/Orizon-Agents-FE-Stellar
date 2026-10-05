// @vitest-environment jsdom
/**
 * The site's error screen (app/error.tsx): calm words, a Reload button, a way
 * home, focus on the heading — and no screen at all for a deploy-skew chunk
 * error, which reloads the page by itself.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AUTO_RELOAD_KEY, ERROR_COPY } from "@/lib/error-recovery";
import type { RecoveryDeps } from "@/lib/use-error-recovery";

const deps = vi.hoisted(() => ({
  reload: vi.fn(),
  report: vi.fn(),
  store: new Map<string, string>(),
}));

vi.mock("@/lib/use-error-recovery", async (importOriginal) => {
  const real =
    await importOriginal<typeof import("@/lib/use-error-recovery")>();
  const testDeps: RecoveryDeps = {
    reload: deps.reload,
    report: deps.report,
    getStorage: () =>
      ({
        getItem: (k: string) => deps.store.get(k) ?? null,
        setItem: (k: string, v: string) => void deps.store.set(k, v),
      }) as unknown as Storage,
    now: () => 1_791_000_000_000,
    route: () => "/evidence",
  };
  return {
    ...real,
    useErrorRecovery: (error: Error) => real.useErrorRecovery(error, testDeps),
  };
});

import ErrorScreen from "./error";

const chunkError = () =>
  Object.assign(new Error("Loading chunk 1 failed."), {
    name: "ChunkLoadError",
  });

beforeEach(() => {
  deps.reload.mockReset();
  deps.report.mockReset();
  deps.store.clear();
});
afterEach(cleanup);

const show = (error: Error) =>
  render(<ErrorScreen error={error} reset={() => {}} />);

describe("the site's error screen", () => {
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

  it("reloads the page from its Reload button", () => {
    show(new Error("boom"));
    fireEvent.click(screen.getByRole("button", { name: "Reload" }));
    expect(deps.reload).toHaveBeenCalledTimes(1);
  });

  it("links home with a full page load", () => {
    show(new Error("boom"));
    const home = screen.getByRole("link", { name: "Go to the home page" });
    expect(home.getAttribute("href")).toBe("/");
  });

  it("keeps the skip link's target", () => {
    show(new Error("boom"));
    expect(document.querySelector("main#main")).not.toBeNull();
  });

  it("explains a network failure as one", () => {
    show(new TypeError("Failed to fetch"));
    expect(screen.getByText(ERROR_COPY.message.network)).toBeTruthy();
  });

  it("reloads by itself on a chunk error and shows no error screen", () => {
    show(chunkError());
    expect(deps.reload).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("status").textContent).toBe(ERROR_COPY.reloading);
    expect(screen.queryByRole("heading")).toBeNull();
    expect(screen.queryByRole("button", { name: "Reload" })).toBeNull();
  });

  it("shows the screen when the automatic reload did not fix it", () => {
    deps.store.set(AUTO_RELOAD_KEY, String(1_791_000_000_000 - 3_000));
    show(chunkError());
    expect(deps.reload).not.toHaveBeenCalled();
    expect(
      screen.getByRole("heading", { name: "This page didn't load" }),
    ).toBeTruthy();
    expect(screen.getByText(ERROR_COPY.message.chunk)).toBeTruthy();
  });

  it("reports the error with its kind and route", () => {
    const error = new Error("boom");
    show(error);
    expect(deps.report).toHaveBeenCalledWith(error, {
      kind: "render",
      route: "/evidence",
      recovery: "shown",
    });
  });
});
