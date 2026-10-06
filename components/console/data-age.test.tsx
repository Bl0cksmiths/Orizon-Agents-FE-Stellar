// @vitest-environment jsdom
/**
 * The as-of marker (components/console/data-age.tsx): silent for fresh
 * figures, explicit for old ones, and keeping count as they age.
 */
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DataAge, OLD_DATA_AFTER_MS } from "./data-age";

const NOW = new Date("2026-10-06T12:00:00Z").getTime();

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("DataAge", () => {
  it("says nothing about fresh figures, or figures it cannot date", () => {
    const fresh = render(<DataAge at={NOW - 5_000} what="metrics" />);
    expect(fresh.container.innerHTML).toBe("");
    cleanup();
    const unknown = render(<DataAge at={null} what="metrics" />);
    expect(unknown.container.innerHTML).toBe("");
  });

  it("dates figures older than the threshold, in words a reader hears", () => {
    const { container } = render(
      <DataAge at={NOW - 5 * 60_000} what="network metrics" />,
    );
    const text = container.textContent ?? "";
    expect(text).toContain("5m ago");
    expect(text).toContain("Showing network metrics as read at");
  });

  it("starts dating figures that age past the threshold on screen", () => {
    const { container } = render(
      <DataAge at={NOW - OLD_DATA_AFTER_MS + 10_000} what="metrics" />,
    );
    expect(container.innerHTML).toBe("");
    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(container.textContent).toContain("ago");
  });
});
