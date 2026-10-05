// @vitest-environment jsdom
/**
 * One panel's polled read (lib/use-polled-read.ts): its own data, error and
 * retry; the waiting state a cold start gets instead of an error; the stop
 * on a terminal failure; and the date on what it shows.
 */
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePolledRead } from "./use-polled-read";

const WAKING = new Error(
  "GET /metrics/overview → 503 — the backend is waking up — this usually takes under a minute",
);

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const tick = (ms = 0) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });

describe("usePolledRead", () => {
  it("waits, then holds what landed, dated", async () => {
    vi.setSystemTime(10_000);
    const read = vi.fn(async () => ({ n: 1 }));
    const { result } = renderHook(() => usePolledRead(read, 5_000));
    expect(result.current.waiting).toBe(true);
    await tick();
    expect(result.current.data).toEqual({ n: 1 });
    expect(result.current.waiting).toBe(false);
    expect(result.current.dataAt).toBe(10_000);
  });

  it("keeps waiting, not failing, while the backend is waking", async () => {
    const read = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(WAKING)
      .mockResolvedValue("awake");
    const { result } = renderHook(() => usePolledRead(read, 5_000));
    await tick();
    expect(result.current.error).toContain("waking");
    expect(result.current.waiting).toBe(true);
    expect(result.current.terminal).toBe(false);
    await tick(10_000);
    expect(result.current.data).toBe("awake");
    expect(result.current.error).toBeNull();
  });

  it("calls any other failure a failure, and keeps polling a transient one", async () => {
    const read = vi
      .fn<() => Promise<string>>()
      .mockRejectedValue(new Error("GET /tasks → 502"));
    const { result } = renderHook(() => usePolledRead(read, 5_000));
    await tick();
    expect(result.current.waiting).toBe(false);
    expect(result.current.error).toBe("GET /tasks → 502");
    expect(result.current.terminal).toBe(false);
    await tick(10_000);
    expect(read.mock.calls.length).toBeGreaterThan(1);
  });

  it("stops polling a terminal failure; the retry is the way back", async () => {
    const read = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error("GET /tasks → 404"))
      .mockResolvedValue("back");
    const { result } = renderHook(() => usePolledRead(read, 5_000));
    await tick();
    expect(result.current.terminal).toBe(true);
    await tick(60_000);
    expect(read).toHaveBeenCalledTimes(1);

    act(() => result.current.retry());
    expect(result.current.retrying).toBe(true);
    await tick();
    expect(result.current.data).toBe("back");
    expect(result.current.terminal).toBe(false);
    expect(result.current.retrying).toBe(false);
  });

  it("keeps the last data through a failed refresh", async () => {
    const read = vi
      .fn<() => Promise<string>>()
      .mockResolvedValueOnce("first")
      .mockRejectedValue(new Error("GET /tasks → 503"));
    const { result } = renderHook(() => usePolledRead(read, 5_000));
    await tick();
    await tick(5_000);
    expect(result.current.data).toBe("first");
    expect(result.current.error).toBe("GET /tasks → 503");
  });

  it("drops a result that lands after unmount", async () => {
    let resolve!: (v: string) => void;
    const read = vi.fn(
      () =>
        new Promise<string>((r) => {
          resolve = r;
        }),
    );
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const { unmount } = renderHook(() => usePolledRead(read, 5_000));
    await tick();
    unmount();
    await act(async () => resolve("late"));
    expect(errors).not.toHaveBeenCalled();
  });
});
