// @vitest-environment jsdom
/**
 * The console's error screen (app/app/error.tsx): it sits inside the console
 * shell, so it offers a Reload and the way back to the console overview, never
 * out of the console — and a deploy-skew chunk error reloads by itself.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ERROR_COPY } from "@/lib/error-recovery";
import type { RecoveryDeps } from "@/lib/use-error-recovery";

const deps = vi.hoisted(() => ({ reload: vi.fn(), report: vi.fn() }));

vi.mock("@/lib/use-error-recovery", async (importOriginal) => {
  const real =
    await importOriginal<typeof import("@/lib/use-error-recovery")>();
  const store = new Map<string, string>();
  const testDeps: RecoveryDeps = {
    reload: deps.reload,
    report: deps.report,
    getStorage: () =>
      ({
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => void store.set(k, v),
      }) as unknown as Storage,
    now: () => 1_791_000_000_000,
    route: () => "/app/agents",
  };
  return {
    ...real,
    useErrorRecovery: (error: Error) => real.useErrorRecovery(error, testDeps),
  };
});

import ConsoleError from "./error";

beforeEach(() => {
  deps.reload.mockReset();
  deps.report.mockReset();
});
afterEach(cleanup);

const show = (error: Error) =>
  render(<ConsoleError error={error} reset={() => {}} />);

describe("the console's error screen", () => {
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

  it("keeps the visitor in the console", () => {
    show(new Error("boom"));
    const back = screen.getByRole("link", { name: "Back to the overview" });
    expect(back.getAttribute("href")).toBe("/app");
    expect(screen.queryByRole("link", { name: /home/i })).toBeNull();
  });

  it("renders inside the console's own <main>, not a second one", () => {
    show(new Error("boom"));
    expect(document.querySelector("main")).toBeNull();
  });

  it("reloads by itself on a chunk error and shows no error screen", () => {
    show(
      Object.assign(new Error("Loading chunk 9 failed."), {
        name: "ChunkLoadError",
      }),
    );
    expect(deps.reload).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("status").textContent).toBe(ERROR_COPY.reloading);
    expect(screen.queryByRole("heading")).toBeNull();
  });
});
