// @vitest-environment jsdom
/**
 * Unit tests for useFetch (lib/use-fetch.ts).
 *
 * Covers the deps-change semantics: by default stale `data`/`error` are
 * cleared the moment deps change (no old record shown against new deps),
 * `keepPreviousData` opts back into the retain-while-loading behavior, and
 * `reload()` always keeps the current data. Also verifies unmount safety
 * (a late settlement never sets state — no act warnings) and that the
 * latest `fn` is used without callers memoizing it.
 *
 * The retry suites use fake timers to drive the backoff sleeps: a transient
 * failure must recover on its own, a permanent one must not be retried, and
 * neither may outlive the effect that scheduled it.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { isTransientFetchError, retryAfterHintMs, useFetch } from "./use-fetch";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("useFetch", () => {
  it("cancels the read it started when the component unmounts", async () => {
    let seen: AbortSignal | undefined;
    const { unmount } = renderHook(() =>
      useFetch((signal) => {
        seen = signal;
        return new Promise<string>(() => {});
      }, []),
    );
    expect(seen?.aborted).toBe(false);
    unmount();
    expect(seen?.aborted).toBe(true);
  });

  it("cancels the superseded read on reload and on a deps change", async () => {
    const signals: AbortSignal[] = [];
    const { result, rerender } = renderHook(
      ({ id }) =>
        useFetch(
          (signal) => {
            signals.push(signal);
            return new Promise<string>(() => {});
          },
          [id],
        ),
      { initialProps: { id: 1 } },
    );
    act(() => result.current.reload());
    expect(signals[0].aborted).toBe(true);
    rerender({ id: 2 });
    expect(signals[1].aborted).toBe(true);
    expect(signals[2].aborted).toBe(false);
  });

  it("never reports its own cancellation as an error", async () => {
    const { result, unmount } = renderHook(() =>
      useFetch(
        (signal) =>
          new Promise<string>((_resolve, reject) => {
            signal.addEventListener("abort", () =>
              reject(new DOMException("cancelled", "AbortError")),
            );
          }),
        [],
      ),
    );
    act(() => result.current.reload());
    await act(async () => {});
    expect(result.current.error).toBeNull();
    unmount();
  });

  it("resolves data on mount and clears loading", async () => {
    const { result } = renderHook(() => useFetch(async () => "hello", []));
    expect(result.current.loading).toBe(true);
    expect(result.current.data).toBeNull();

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toBe("hello");
    expect(result.current.error).toBeNull();
  });

  it("surfaces a rejection message and keeps data null", async () => {
    const { result } = renderHook(() =>
      useFetch(() => Promise.reject(new Error("nope")), []),
    );
    await waitFor(() => expect(result.current.error).toBe("nope"));
    expect(result.current.data).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it("stringifies a rejection that is not an Error", async () => {
    const { result } = renderHook(() =>
      useFetch(() => Promise.reject("kaboom"), []),
    );
    await waitFor(() => expect(result.current.error).toBe("kaboom"));
    expect(result.current.retrying).toBe(false);
  });

  it("clears stale data immediately when deps change (default)", async () => {
    const resolvers = new Map<number, (v: string) => void>();
    const fn = vi.fn(
      (dep: number) => new Promise<string>((res) => resolvers.set(dep, res)),
    );
    const { result, rerender } = renderHook(
      ({ dep }) => useFetch(() => fn(dep), [dep]),
      { initialProps: { dep: 1 } },
    );
    await act(async () => resolvers.get(1)!("record-1"));
    expect(result.current.data).toBe("record-1");

    // Deps change: the old record must not linger while the refetch runs.
    rerender({ dep: 2 });
    expect(result.current.data).toBeNull();
    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(true);

    await act(async () => resolvers.get(2)!("record-2"));
    expect(result.current.data).toBe("record-2");
    expect(result.current.loading).toBe(false);
  });

  it("clears a previous error when deps change", async () => {
    const fn = vi.fn(async (dep: number) => {
      if (dep === 1) throw new Error("boom");
      return "ok";
    });
    const { result, rerender } = renderHook(
      ({ dep }) => useFetch(() => fn(dep), [dep]),
      { initialProps: { dep: 1 } },
    );
    await waitFor(() => expect(result.current.error).toBe("boom"));

    rerender({ dep: 2 });
    expect(result.current.error).toBeNull();
    await waitFor(() => expect(result.current.data).toBe("ok"));
  });

  it("keeps the old data across a deps change with keepPreviousData", async () => {
    const resolvers = new Map<number, (v: string) => void>();
    const fn = vi.fn(
      (dep: number) => new Promise<string>((res) => resolvers.set(dep, res)),
    );
    const { result, rerender } = renderHook(
      ({ dep }) => useFetch(() => fn(dep), [dep], { keepPreviousData: true }),
      { initialProps: { dep: 1 } },
    );
    await act(async () => resolvers.get(1)!("record-1"));
    expect(result.current.data).toBe("record-1");

    rerender({ dep: 2 });
    expect(result.current.data).toBe("record-1"); // retained while loading
    expect(result.current.loading).toBe(true);

    await act(async () => resolvers.get(2)!("record-2"));
    expect(result.current.data).toBe("record-2");
  });

  it("keeps the current data while a reload() refetch is in flight", async () => {
    const defs: Array<{
      promise: Promise<string>;
      resolve: (v: string) => void;
    }> = [];
    const fn = vi.fn(() => {
      const d = deferred<string>();
      defs.push(d);
      return d.promise;
    });
    const { result } = renderHook(() => useFetch(fn, []));
    await act(async () => defs[0].resolve("first"));
    expect(result.current.data).toBe("first");

    act(() => result.current.reload());
    // reload is a nonce bump, not a deps change — data stays visible.
    expect(result.current.loading).toBe(true);
    expect(result.current.data).toBe("first");

    await act(async () => defs[1].resolve("second"));
    expect(result.current.data).toBe("second");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("always invokes the latest fn on reload without requiring memoization", async () => {
    const first = vi.fn(async () => "first");
    const second = vi.fn(async () => "second");
    const { result, rerender } = renderHook(({ fn }) => useFetch(fn, []), {
      initialProps: { fn: first },
    });
    await waitFor(() => expect(result.current.data).toBe("first"));

    // Swapping fn alone (deps unchanged) does not refetch…
    rerender({ fn: second });
    expect(second).not.toHaveBeenCalled();
    expect(result.current.data).toBe("first");

    // …but the next run uses the swapped-in fn, not a stale closure.
    act(() => result.current.reload());
    await waitFor(() => expect(result.current.data).toBe("second"));
    expect(first).toHaveBeenCalledTimes(1);
  });

  describe("revalidateOnFocus", () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    /** Mount with fake timers, resolve the initial fetch, return the fn mock. */
    async function mountRevalidating(opts?: {
      revalidateOnFocus?: boolean;
      staleAfterMs?: number;
    }) {
      vi.useFakeTimers();
      const fn = vi.fn(async () => "fresh");
      const view = renderHook(() =>
        useFetch(fn, [], { revalidateOnFocus: true, ...opts }),
      );
      await act(async () => {}); // flush the mount fetch (microtasks only)
      expect(view.result.current.data).toBe("fresh");
      expect(fn).toHaveBeenCalledTimes(1);
      return { fn, ...view };
    }

    it("reloads on visibilitychange when the last success is stale", async () => {
      const { fn, result } = await mountRevalidating();

      act(() => vi.advanceTimersByTime(60_001));
      await act(async () => {
        document.dispatchEvent(new Event("visibilitychange"));
      });
      expect(fn).toHaveBeenCalledTimes(2);
      // reload semantics — the current data never flashes away.
      expect(result.current.data).toBe("fresh");
    });

    it("reloads on window focus when stale, honoring a custom staleAfterMs", async () => {
      const { fn } = await mountRevalidating({ staleAfterMs: 5_000 });

      act(() => vi.advanceTimersByTime(5_001));
      await act(async () => {
        window.dispatchEvent(new Event("focus"));
      });
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it("does not reload while the last success is younger than staleAfterMs", async () => {
      const { fn } = await mountRevalidating();

      act(() => vi.advanceTimersByTime(59_000));
      await act(async () => {
        document.dispatchEvent(new Event("visibilitychange"));
        window.dispatchEvent(new Event("focus"));
      });
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it("does not reload when the tab is still hidden", async () => {
      const { fn } = await mountRevalidating();
      vi.spyOn(document, "hidden", "get").mockReturnValue(true);

      act(() => vi.advanceTimersByTime(120_000));
      await act(async () => {
        document.dispatchEvent(new Event("visibilitychange"));
      });
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it("stays inert by default (option off)", async () => {
      vi.useFakeTimers();
      const fn = vi.fn(async () => "fresh");
      renderHook(() => useFetch(fn, []));
      await act(async () => {});
      expect(fn).toHaveBeenCalledTimes(1);

      act(() => vi.advanceTimersByTime(600_000));
      await act(async () => {
        document.dispatchEvent(new Event("visibilitychange"));
        window.dispatchEvent(new Event("focus"));
      });
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it("revalidates after the very first fetch failed — there is no last success to age out", async () => {
      vi.useFakeTimers();
      // Non-transient so the automatic retry stays out of the way: the focus
      // event is the only thing that can re-arm this fetch.
      const fn = vi.fn(() => Promise.reject(new Error("GET /agents → 404")));
      const { result } = renderHook(() =>
        useFetch(fn, [], { revalidateOnFocus: true }),
      );
      await act(async () => {});
      expect(result.current.error).toBe("GET /agents → 404");

      act(() => vi.advanceTimersByTime(5_001));
      await act(async () => {
        document.dispatchEvent(new Event("visibilitychange"));
      });
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it("throttles focus retries of a failed fetch", async () => {
      vi.useFakeTimers();
      const fn = vi.fn(() => Promise.reject(new Error("GET /agents → 404")));
      renderHook(() => useFetch(fn, [], { revalidateOnFocus: true }));
      await act(async () => {});

      // Alt-tabbing straight back must not fire a second request.
      act(() => vi.advanceTimersByTime(4_999));
      await act(async () => {
        window.dispatchEvent(new Event("focus"));
        document.dispatchEvent(new Event("visibilitychange"));
      });
      expect(fn).toHaveBeenCalledTimes(1);

      act(() => vi.advanceTimersByTime(2));
      await act(async () => {
        window.dispatchEvent(new Event("focus"));
      });
      expect(fn).toHaveBeenCalledTimes(2);

      // …and the fresh attempt restarts the throttle window.
      await act(async () => {
        window.dispatchEvent(new Event("focus"));
      });
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it("does not stack a focus refetch on an in-flight request", async () => {
      vi.useFakeTimers();
      const pending = deferred<string>();
      const fn = vi.fn(() => pending.promise);
      renderHook(() => useFetch(fn, [], { revalidateOnFocus: true }));
      await act(async () => {});

      // A cold backend holds the request open for the full 60s deadline.
      act(() => vi.advanceTimersByTime(120_000));
      await act(async () => {
        window.dispatchEvent(new Event("focus"));
        document.dispatchEvent(new Event("visibilitychange"));
      });
      expect(fn).toHaveBeenCalledTimes(1);
    });
  });

  describe("lastSuccessAt", () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it("only advances on success and dates the data left on screen", async () => {
      vi.useFakeTimers();
      let failing = false;
      const fn = vi.fn(async () => {
        if (failing) throw new Error("nope");
        return "ok";
      });
      const { result } = renderHook(() => useFetch(fn, []));
      expect(result.current.lastSuccessAt).toBeNull();

      await act(async () => {});
      const first = result.current.lastSuccessAt;
      expect(first).toBe(Date.now());

      // A failed reload keeps the data — and the timestamp that dates it.
      failing = true;
      act(() => vi.advanceTimersByTime(30_000));
      await act(async () => {
        result.current.reload();
      });
      expect(result.current.error).toBe("nope");
      expect(result.current.data).toBe("ok");
      expect(result.current.lastSuccessAt).toBe(first);

      failing = false;
      act(() => vi.advanceTimersByTime(30_000));
      await act(async () => {
        result.current.reload();
      });
      expect(result.current.lastSuccessAt).toBe(Date.now());
      expect(result.current.lastSuccessAt).toBeGreaterThan(first!);
    });

    it("clears with the data when deps change", async () => {
      const fn = vi.fn(async (dep: number) => `record-${dep}`);
      const { result, rerender } = renderHook(
        ({ dep }) => useFetch(() => fn(dep), [dep]),
        { initialProps: { dep: 1 } },
      );
      await waitFor(() => expect(result.current.data).toBe("record-1"));
      expect(result.current.lastSuccessAt).not.toBeNull();

      rerender({ dep: 2 });
      expect(result.current.data).toBeNull();
      expect(result.current.lastSuccessAt).toBeNull();
      await waitFor(() => expect(result.current.lastSuccessAt).not.toBeNull());
    });
  });

  describe("automatic retry", () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    const TIMEOUT = () => new Error("GET /agents → timeout after 60s");

    it("retries a transient failure until it succeeds, with no user action", async () => {
      vi.useFakeTimers();
      const fn = vi
        .fn<() => Promise<string>>()
        .mockRejectedValueOnce(TIMEOUT())
        .mockResolvedValueOnce("agents");
      const { result } = renderHook(() => useFetch(fn, []));
      await act(async () => {});
      expect(fn).toHaveBeenCalledTimes(1);
      expect(result.current.error).toContain("timeout");
      expect(result.current.retrying).toBe(true);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(2_000);
      });
      expect(fn).toHaveBeenCalledTimes(2);
      expect(result.current.data).toBe("agents");
      expect(result.current.error).toBeNull();
      expect(result.current.retrying).toBe(false);
    });

    it("spaces retries 2s → 4s → 8s and stops once the budget is spent", async () => {
      vi.useFakeTimers();
      const fn = vi.fn(() => Promise.reject(new Error("GET /agents → 503")));
      const { result } = renderHook(() => useFetch(fn, []));
      await act(async () => {});
      expect(fn).toHaveBeenCalledTimes(1);

      for (const delay of [2_000, 4_000, 8_000]) {
        await act(async () => {
          await vi.advanceTimersByTimeAsync(delay - 1);
        });
        const before = fn.mock.calls.length;
        await act(async () => {
          await vi.advanceTimersByTimeAsync(1);
        });
        expect(fn).toHaveBeenCalledTimes(before + 1);
      }

      // Budget spent: the error stands and nothing else is scheduled.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(300_000);
      });
      expect(fn).toHaveBeenCalledTimes(4);
      expect(result.current.error).toBe("GET /agents → 503");
      expect(result.current.retrying).toBe(false);
      expect(result.current.loading).toBe(false);
    });

    it("does not retry a non-transient failure such as a 404", async () => {
      vi.useFakeTimers();
      const fn = vi.fn(() => Promise.reject(new Error("GET /agents → 404")));
      const { result } = renderHook(() => useFetch(fn, []));
      await act(async () => {});
      expect(result.current.retrying).toBe(false);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(300_000);
      });
      expect(fn).toHaveBeenCalledTimes(1);
      expect(result.current.error).toBe("GET /agents → 404");
    });

    it("resets the backoff budget on a manual reload()", async () => {
      vi.useFakeTimers();
      const fn = vi.fn(() => Promise.reject(TIMEOUT()));
      const { result } = renderHook(() => useFetch(fn, []));
      await act(async () => {});
      await act(async () => {
        await vi.advanceTimersByTimeAsync(60_000);
      });
      expect(fn).toHaveBeenCalledTimes(4); // exhausted

      await act(async () => {
        result.current.reload();
      });
      expect(fn).toHaveBeenCalledTimes(5);
      // A fresh budget: the first retry is one base delay away again.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2_000);
      });
      expect(fn).toHaveBeenCalledTimes(6);
    });

    it("cancels a pending retry on unmount", async () => {
      vi.useFakeTimers();
      const fn = vi.fn(() => Promise.reject(TIMEOUT()));
      const { unmount } = renderHook(() => useFetch(fn, []));
      await act(async () => {});
      unmount();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(300_000);
      });
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it("cancels a pending retry when deps change", async () => {
      vi.useFakeTimers();
      const fn = vi.fn(async (dep: number) => {
        if (dep === 1) throw TIMEOUT();
        return "ok";
      });
      const { result, rerender } = renderHook(
        ({ dep }) => useFetch(() => fn(dep), [dep]),
        { initialProps: { dep: 1 } },
      );
      await act(async () => {});
      expect(fn).toHaveBeenCalledTimes(1);

      await act(async () => {
        rerender({ dep: 2 });
      });
      expect(result.current.data).toBe("ok");
      expect(result.current.retrying).toBe(false);

      // The dep-1 retry must not fire against the new deps.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(300_000);
      });
      expect(fn).toHaveBeenCalledTimes(2);
      expect(fn).toHaveBeenLastCalledWith(2);
    });

    it("waits for a Retry-After hint longer than the computed backoff", async () => {
      vi.useFakeTimers();
      const throttled = Object.assign(new Error("GET /agents → 429"), {
        retryAfter: 45, // seconds, as the header carries it
      });
      const fn = vi.fn(() => Promise.reject(throttled));
      renderHook(() => useFetch(fn, []));
      await act(async () => {});

      await act(async () => {
        await vi.advanceTimersByTimeAsync(44_999);
      });
      expect(fn).toHaveBeenCalledTimes(1);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
      });
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it("honors maxRetries and retryBaseMs overrides", async () => {
      vi.useFakeTimers();
      const fn = vi.fn(() => Promise.reject(TIMEOUT()));
      const { result, unmount } = renderHook(() =>
        useFetch(fn, [], { maxRetries: 1, retryBaseMs: 100 }),
      );
      await act(async () => {});
      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });
      expect(fn).toHaveBeenCalledTimes(2);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(300_000);
      });
      expect(fn).toHaveBeenCalledTimes(2);
      expect(result.current.retrying).toBe(false);
      unmount();

      const never = vi.fn(() => Promise.reject(TIMEOUT()));
      renderHook(() => useFetch(never, [], { maxRetries: 0 }));
      await act(async () => {});
      await act(async () => {
        await vi.advanceTimersByTimeAsync(300_000);
      });
      expect(never).toHaveBeenCalledTimes(1);
    });
  });

  it("ignores settlements that land after unmount — no state updates, no warnings", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const late = deferred<string>();
    const resolved = renderHook(() => useFetch(() => late.promise, []));
    expect(resolved.result.current.loading).toBe(true);
    resolved.unmount();
    late.resolve("too late");

    const failing = deferred<string>();
    const rejected = renderHook(() => useFetch(() => failing.promise, []));
    rejected.unmount();
    failing.reject(new Error("too late to fail"));

    // Let both settlements flush outside act — the alive guard must swallow
    // them without touching state (would otherwise trigger act warnings).
    await new Promise((r) => setTimeout(r, 0));
    expect(errSpy).not.toHaveBeenCalled();
  });
});

describe("isTransientFetchError", () => {
  it.each([
    ["client deadline", new Error("GET /agents → timeout after 60s")],
    ["server error", new Error("GET /agents → 500")],
    ["bad gateway", new Error("POST /x → 502 — upstream")],
    ["gateway timeout", new Error("GET /agents → 504")],
    ["request timeout", new Error("GET /agents → 408")],
    ["rate limited", new Error("GET /agents → 429")],
    ["chrome network drop", new TypeError("Failed to fetch")],
    ["firefox network drop", new Error("NetworkError when fetching")],
    ["safari network drop", new Error("Load failed")],
  ])("retries a %s", (_label, err) => {
    expect(isTransientFetchError(err)).toBe(true);
  });

  it.each([
    ["missing resource", new Error("GET /agents → 404")],
    ["bad request", new Error("POST /x → 400 — nope")],
    ["unauthorized", new Error("GET /trace/1 → 401")],
    ["failed response guard", new Error("malformed response from /tasks")],
    ["a bug in fn", new Error("x is not a function")],
    ["a thrown string", "kaboom"],
  ])("does not retry a %s", (_label, err) => {
    expect(isTransientFetchError(err)).toBe(false);
  });
});

describe("retryAfterHintMs", () => {
  it("reads a millisecond hint", () => {
    expect(
      retryAfterHintMs(Object.assign(new Error("x"), { retryAfterMs: 1_500 })),
    ).toBe(1_500);
  });

  it("converts a seconds hint, as the HTTP header carries it", () => {
    expect(
      retryAfterHintMs(Object.assign(new Error("x"), { retryAfter: 60 })),
    ).toBe(60_000);
  });

  it.each([
    ["no hint", new Error("x")],
    ["a non-numeric hint", Object.assign(new Error("x"), { retryAfter: "60" })],
    ["a non-positive hint", Object.assign(new Error("x"), { retryAfterMs: 0 })],
    ["a NaN hint", Object.assign(new Error("x"), { retryAfterMs: NaN })],
    ["a non-object rejection", "kaboom"],
    ["null", null],
  ])("returns null for %s", (_label, err) => {
    expect(retryAfterHintMs(err)).toBeNull();
  });
});
