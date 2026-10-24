// @vitest-environment jsdom
/**
 * Unit tests for useOutageRetry (lib/use-outage-retry.ts): one retry per
 * failure, spaced on a backoff that honours Retry-After, bounded, paused in a
 * hidden tab and gone on unmount.
 */

import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StoreOutage } from "./store-outage";
import {
  OUTAGE_MAX_RETRIES,
  OUTAGE_RETRY_BASE_MS,
  outageRetryMs,
  useOutageRetry,
} from "./use-outage-retry";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

/** A fresh outage, as each failed read classifies its own. */
const outage = (retryAfterMs: number | null = null): StoreOutage => ({
  kind: "store",
  retryAfterMs,
  requestId: null,
});

type Props = { outage: StoreOutage | null; enabled?: boolean };

function mount(initial: Props) {
  const retry = vi.fn();
  const hook = renderHook(
    (p: Props) => useOutageRetry(p.outage, retry, p.enabled),
    { initialProps: initial },
  );
  return { retry, ...hook };
}

const advance = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => state,
  });
  act(() => {
    document.dispatchEvent(new Event("visibilitychange"));
  });
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  Reflect.deleteProperty(document, "visibilityState");
});

describe("outageRetryMs", () => {
  it("doubles from the base to the fetch hook's ceiling", () => {
    const waits = Array.from({ length: OUTAGE_MAX_RETRIES }, (_, i) =>
      outageRetryMs(i, outage()),
    );
    expect(waits).toEqual([
      3_000, 6_000, 12_000, 24_000, 30_000, 30_000, 30_000, 30_000,
    ]);
  });

  it("never asks sooner than Retry-After, and never later than its cap", () => {
    expect(outageRetryMs(0, outage(5_000))).toBe(5_000);
    expect(outageRetryMs(3, outage(5_000))).toBe(24_000);
    expect(outageRetryMs(0, outage(600_000))).toBe(120_000);
  });
});

describe("useOutageRetry", () => {
  it("does nothing without an outage", async () => {
    const { retry, result } = mount({ outage: null });
    await advance(10 * 60_000);
    expect(retry).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    expect(result.current.gaveUp).toBe(false);
  });

  it("retries once per failure, after the backoff", async () => {
    const { retry, rerender, result } = mount({ outage: outage() });
    await advance(OUTAGE_RETRY_BASE_MS - 1);
    expect(retry).not.toHaveBeenCalled();
    await advance(1);
    expect(retry).toHaveBeenCalledTimes(1);
    expect(result.current.attempts).toBe(1);

    // Nothing more until that retry's own answer lands.
    await advance(5 * 60_000);
    expect(retry).toHaveBeenCalledTimes(1);

    rerender({ outage: outage() });
    await advance(2 * OUTAGE_RETRY_BASE_MS - 1);
    expect(retry).toHaveBeenCalledTimes(1);
    await advance(1);
    expect(retry).toHaveBeenCalledTimes(2);
  });

  it("waits out the backend's Retry-After", async () => {
    const { retry } = mount({ outage: outage(20_000) });
    await advance(19_999);
    expect(retry).not.toHaveBeenCalled();
    await advance(1);
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("stops after its budget and says so, until the reader asks again", async () => {
    const { retry, rerender, result } = mount({ outage: outage() });
    for (let i = 0; i < OUTAGE_MAX_RETRIES; i++) {
      await advance(outageRetryMs(i, outage()));
      rerender({ outage: outage() });
    }
    expect(retry).toHaveBeenCalledTimes(OUTAGE_MAX_RETRIES);
    expect(result.current.gaveUp).toBe(true);
    await advance(10 * 60_000);
    expect(retry).toHaveBeenCalledTimes(OUTAGE_MAX_RETRIES);
    expect(vi.getTimerCount()).toBe(0);

    // A reader's own retry starts a fresh budget, from its own failure.
    act(() => result.current.resetBudget());
    expect(result.current.gaveUp).toBe(false);
    rerender({ outage: outage() });
    await advance(OUTAGE_RETRY_BASE_MS);
    expect(retry).toHaveBeenCalledTimes(OUTAGE_MAX_RETRIES + 1);
  });

  it("restores the budget once the outage ends", async () => {
    const { retry, rerender, result } = mount({ outage: outage() });
    await advance(OUTAGE_RETRY_BASE_MS);
    rerender({ outage: outage() });
    await advance(2 * OUTAGE_RETRY_BASE_MS);
    expect(result.current.attempts).toBe(2);

    rerender({ outage: null });
    expect(result.current.attempts).toBe(0);
    rerender({ outage: outage() });
    await advance(OUTAGE_RETRY_BASE_MS);
    expect(retry).toHaveBeenCalledTimes(3);
  });

  it("pauses in a hidden tab, and asks at once on return if it fell due", async () => {
    const { retry } = mount({ outage: outage() });
    setVisibility("hidden");
    expect(vi.getTimerCount()).toBe(0);
    await advance(60_000);
    expect(retry).not.toHaveBeenCalled();

    setVisibility("visible");
    await advance(0);
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("on a return inside the wait, waits out only what is left", async () => {
    const { retry } = mount({ outage: outage() });
    await advance(1_000);
    setVisibility("hidden");
    await advance(500);
    setVisibility("visible");
    await advance(OUTAGE_RETRY_BASE_MS - 1_500 - 1);
    expect(retry).not.toHaveBeenCalled();
    await advance(1);
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("does not retry while disabled, and does once enabled", async () => {
    const { retry, rerender } = mount({ outage: outage(), enabled: false });
    await advance(60_000);
    expect(retry).not.toHaveBeenCalled();
    rerender({ outage: outage(), enabled: true });
    await advance(OUTAGE_RETRY_BASE_MS);
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("leaves nothing behind on unmount", async () => {
    const { retry, unmount } = mount({ outage: outage() });
    unmount();
    expect(vi.getTimerCount()).toBe(0);
    await advance(60_000);
    expect(retry).not.toHaveBeenCalled();
  });
});
