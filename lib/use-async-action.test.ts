// @vitest-environment jsdom
/**
 * Unit tests for the shared async-action hook.
 *
 * Locks in the contract the PDAX panels rely on: pending transitions
 * around `run`, error normalization (no "Error: " prefix leaking into
 * money-panel UIs), data retention across failures, and `reset`.
 */

import { afterEach, describe, it, expect, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { toMessage, useAsyncAction } from "./use-async-action";
import { ApiError } from "./api";
import { BOT_DETECTED_MESSAGE } from "./bot-check-message";

afterEach(() => {
  vi.restoreAllMocks();
});

// @testing-library/react's act() requires this flag in a bare jsdom env.
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

/** A promise with externally controlled settle, to observe mid-flight state. */
function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("toMessage", () => {
  it("uses .message for Error instances (no 'Error: ' prefix)", () => {
    expect(toMessage(new Error("POST /ramp → 502 — upstream down"))).toBe(
      "POST /ramp → 502 — upstream down",
    );
  });

  it("stringifies non-Error throwables", () => {
    expect(toMessage("plain string")).toBe("plain string");
    expect(toMessage(42)).toBe("42");
  });

  it("says a BotID refusal in plain words, not as the raw API line", () => {
    const err = new ApiError(
      "POST /orchestrator/decompose → 403 — whatever the server said",
      403,
      undefined,
      "bot_detected",
    );
    expect(toMessage(err)).toBe(BOT_DETECTED_MESSAGE);
  });
});

describe("useAsyncAction", () => {
  it("starts idle: no data, no error, not pending", () => {
    const { result } = renderHook(() => useAsyncAction(async () => "unused"));
    expect(result.current.data).toBeNull();
    expect(result.current.error).toBeNull();
    expect(result.current.pending).toBe(false);
  });

  it("tracks pending across a successful run and stores the result", async () => {
    const d = deferred<string>();
    const { result } = renderHook(() => useAsyncAction(() => d.promise));

    let returned: Promise<string | undefined>;
    act(() => {
      returned = result.current.run();
    });
    expect(result.current.pending).toBe(true);
    expect(result.current.error).toBeNull();

    await act(async () => {
      d.resolve("balances");
      await returned;
    });
    expect(result.current.pending).toBe(false);
    expect(result.current.data).toBe("balances");
    expect(result.current.error).toBeNull();
    await expect(returned!).resolves.toBe("balances");
  });

  it("passes run() arguments through to fn", async () => {
    const calls: Array<[string, number]> = [];
    const { result } = renderHook(() =>
      useAsyncAction(async (a: string, b: number) => {
        calls.push([a, b]);
        return `${a}:${b}`;
      }),
    );
    await act(async () => {
      await result.current.run("USDC", 10);
    });
    expect(calls).toEqual([["USDC", 10]]);
    expect(result.current.data).toBe("USDC:10");
  });

  it("normalizes a thrown Error to its message and resolves undefined", async () => {
    const { result } = renderHook(() =>
      useAsyncAction<[], string>(async () => {
        throw new Error("GET /balances → 503 — down");
      }),
    );
    let returned: string | undefined = "sentinel";
    await act(async () => {
      returned = await result.current.run();
    });
    expect(returned).toBeUndefined();
    expect(result.current.error).toBe("GET /balances → 503 — down");
    expect(result.current.error).not.toMatch(/^Error: /);
    expect(result.current.pending).toBe(false);
  });

  it("stringifies non-Error rejections", async () => {
    const { result } = renderHook(() =>
      useAsyncAction<[], never>(() => Promise.reject("nope")),
    );
    await act(async () => {
      await result.current.run();
    });
    expect(result.current.error).toBe("nope");
  });

  it("keeps prior data after a failed run and clears the error on the next run", async () => {
    let fail = false;
    const { result } = renderHook(() =>
      useAsyncAction(async () => {
        if (fail) throw new Error("boom");
        return "first";
      }),
    );

    await act(async () => {
      await result.current.run();
    });
    expect(result.current.data).toBe("first");

    fail = true;
    await act(async () => {
      await result.current.run();
    });
    expect(result.current.data).toBe("first"); // stale data retained
    expect(result.current.error).toBe("boom");

    // A new run clears the previous error immediately (while pending).
    fail = false;
    let mid: Promise<string | undefined>;
    act(() => {
      mid = result.current.run();
    });
    expect(result.current.error).toBeNull();
    await act(async () => {
      await mid;
    });
    expect(result.current.data).toBe("first");
  });

  it("reset() clears data and error", async () => {
    const { result } = renderHook(() => useAsyncAction(async () => "value"));
    await act(async () => {
      await result.current.run();
    });
    expect(result.current.data).toBe("value");

    act(() => {
      result.current.reset();
    });
    expect(result.current.data).toBeNull();
    expect(result.current.error).toBeNull();
    expect(result.current.pending).toBe(false);
  });

  it("lets the latest run win when runs settle out of order", async () => {
    const d1 = deferred<string>();
    const d2 = deferred<string>();
    const queue = [d1.promise, d2.promise];
    const { result } = renderHook(() => useAsyncAction(() => queue.shift()!));

    let p1: Promise<string | undefined>;
    let p2: Promise<string | undefined>;
    act(() => {
      p1 = result.current.run();
    });
    act(() => {
      p2 = result.current.run();
    });

    // The newer run settles first and commits its result.
    await act(async () => {
      d2.resolve("newer");
      await p2;
    });
    expect(result.current.data).toBe("newer");
    expect(result.current.pending).toBe(false);

    // The slower older run settles later — it must not clobber the state,
    // though its own promise still resolves to its own value.
    await act(async () => {
      d1.resolve("older");
      await p1;
    });
    expect(result.current.data).toBe("newer");
    expect(result.current.pending).toBe(false);
    await expect(p1!).resolves.toBe("older");
  });

  it("discards a stale run's rejection once a newer run has started", async () => {
    const d1 = deferred<string>();
    const d2 = deferred<string>();
    const queue = [d1.promise, d2.promise];
    const { result } = renderHook(() => useAsyncAction(() => queue.shift()!));

    let p1: Promise<string | undefined>;
    let p2: Promise<string | undefined>;
    act(() => {
      p1 = result.current.run();
    });
    act(() => {
      p2 = result.current.run();
    });

    await act(async () => {
      d2.resolve("newer");
      await p2;
    });
    await act(async () => {
      d1.reject(new Error("stale failure"));
      await p1;
    });
    expect(result.current.error).toBeNull();
    expect(result.current.data).toBe("newer");
  });

  it("ignores settles after unmount — no state updates, no act warnings", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const late = deferred<string>();
    const resolving = renderHook(() => useAsyncAction(() => late.promise));
    act(() => {
      void resolving.result.current.run();
    });
    resolving.unmount();
    late.resolve("too late");

    const failing = deferred<string>();
    const rejecting = renderHook(() => useAsyncAction(() => failing.promise));
    act(() => {
      void rejecting.result.current.run();
    });
    rejecting.unmount();
    failing.reject(new Error("too late to fail"));

    // Flush both settlements outside act — the guards must swallow them
    // without touching state (would otherwise trigger act warnings).
    await new Promise((r) => setTimeout(r, 0));
    expect(errSpy).not.toHaveBeenCalled();
  });

  it("calls the latest fn on each run (no stale closure)", async () => {
    let value = "old";
    const { result, rerender } = renderHook(() =>
      useAsyncAction(async () => value),
    );
    value = "new";
    rerender();
    await act(async () => {
      await result.current.run();
    });
    expect(result.current.data).toBe("new");
  });
});
