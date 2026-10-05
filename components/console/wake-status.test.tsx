// @vitest-environment jsdom
/**
 * The waking line (components/console/wake-status.tsx): its phases on the
 * clock, its progress, what it announces and how often, and that it leaves
 * no trace once the read is done.
 */
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  TYPICAL_WAKE_MS,
  WAKE_HINT_AFTER_MS,
  WakeStatus,
  wakePhase,
  wakeProgress,
} from "./wake-status";

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("wakePhase", () => {
  it("is loading, then waking, then slow", () => {
    expect(wakePhase(0)).toBe("loading");
    expect(wakePhase(WAKE_HINT_AFTER_MS - 1)).toBe("loading");
    expect(wakePhase(WAKE_HINT_AFTER_MS)).toBe("waking");
    expect(wakePhase(TYPICAL_WAKE_MS - 1)).toBe("waking");
    expect(wakePhase(TYPICAL_WAKE_MS)).toBe("slow");
  });
});

describe("wakeProgress", () => {
  it("runs over a typical wake and never claims to be done", () => {
    expect(wakeProgress(0)).toBe(0);
    expect(wakeProgress(TYPICAL_WAKE_MS / 2)).toBe(50);
    expect(wakeProgress(TYPICAL_WAKE_MS)).toBe(95);
    expect(wakeProgress(TYPICAL_WAKE_MS * 10)).toBe(95);
    expect(wakeProgress(-5)).toBe(0);
  });
});

describe("WakeStatus", () => {
  const status = () => screen.getByRole("status");
  const bar = () => screen.getByRole("progressbar", { hidden: true });

  it("says it is loading, with the bar held invisible", () => {
    render(<WakeStatus active what="agents" />);
    expect(status().textContent).toBe("Loading agents…");
    expect(bar().getAttribute("aria-hidden")).toBe("true");
    expect(bar().className).toContain("invisible");
  });

  it("says the network is waking once a read is slower than a warm one", () => {
    render(<WakeStatus active what="agents" />);
    act(() => {
      vi.advanceTimersByTime(WAKE_HINT_AFTER_MS);
    });
    expect(status().textContent).toBe(
      "Waking the network… usually under a minute",
    );
    expect(bar().hasAttribute("aria-hidden")).toBe(false);
    expect(bar().className).not.toContain("invisible");

    act(() => {
      vi.advanceTimersByTime(30_000 - WAKE_HINT_AFTER_MS);
    });
    expect(bar().getAttribute("aria-valuenow")).toBe("50");
    expect(bar().getAttribute("aria-valuetext")).toBe(
      "30 seconds in, of about a minute",
    );
    expect(screen.getByText("· 30s").getAttribute("aria-hidden")).toBe("true");
  });

  it("announces a phase once, not every second", () => {
    render(<WakeStatus active what="agents" />);
    act(() => {
      vi.advanceTimersByTime(WAKE_HINT_AFTER_MS);
    });
    const announced = status().textContent;
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(status().textContent).toBe(announced);
  });

  it("owns up to a wake that runs long", () => {
    render(<WakeStatus active what="agents" />);
    act(() => {
      vi.advanceTimersByTime(TYPICAL_WAKE_MS + 1_000);
    });
    expect(status().textContent).toMatch(/taking longer than usual/);
    expect(bar().getAttribute("aria-valuenow")).toBe("95");
  });

  it("renders nothing once the read is done, and starts over on the next", () => {
    const { rerender, container } = render(<WakeStatus active what="agents" />);
    act(() => {
      vi.advanceTimersByTime(20_000);
    });
    rerender(<WakeStatus active={false} what="agents" />);
    expect(container.innerHTML).toBe("");
    rerender(<WakeStatus active what="agents" />);
    expect(status().textContent).toBe("Loading agents…");
  });

  it("keeps one height across phases, so the skeleton never shifts", () => {
    const { container } = render(<WakeStatus active what="agents" />);
    const box = () => container.firstElementChild as HTMLElement;
    const before = box().className;
    act(() => {
      vi.advanceTimersByTime(WAKE_HINT_AFTER_MS);
    });
    expect(box().className).toBe(before);
    expect(before).toContain("h-9");
  });
});
