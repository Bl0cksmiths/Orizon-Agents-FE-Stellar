// @vitest-environment jsdom
/**
 * The boundary's recovery: a chunk error reloads the page once by itself and
 * never shows the error screen; anything else, or a chunk error the reload
 * did not fix, shows the screen. Each error is reported exactly once.
 */
import { StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { AUTO_RELOAD_KEY } from "./error-recovery";
import {
  RELOAD_FALLBACK_MS,
  useErrorRecovery,
  type RecoveryDeps,
} from "./use-error-recovery";

const T = 1_791_000_000_000;
const chunkError = () =>
  Object.assign(new Error("Loading chunk 6137 failed."), {
    name: "ChunkLoadError",
  });

function setup(overrides: Partial<RecoveryDeps> = {}) {
  const store = new Map<string, string>();
  const storage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
  } as unknown as Storage;
  const deps: RecoveryDeps = {
    reload: vi.fn(),
    report: vi.fn(),
    getStorage: () => storage,
    now: () => T,
    route: () => "/app/agents",
    ...overrides,
  };
  return { deps, store };
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("useErrorRecovery", () => {
  it("reloads once on a chunk error, reports it as an automatic reload, and never shows the screen", () => {
    const { deps, store } = setup();
    const { result } = renderHook(() => useErrorRecovery(chunkError(), deps));
    expect(result.current.phase).toBe("reloading");
    expect(deps.reload).toHaveBeenCalledTimes(1);
    expect(store.get(AUTO_RELOAD_KEY)).toBe(String(T));
    expect(deps.report).toHaveBeenCalledTimes(1);
    expect(deps.report).toHaveBeenCalledWith(expect.any(Error), {
      kind: "chunk",
      route: "/app/agents",
      recovery: "auto-reload",
    });
  });

  it("shows the screen, without reloading, when the last automatic reload was moments ago", () => {
    const { deps, store } = setup();
    store.set(AUTO_RELOAD_KEY, String(T - 5_000));
    const { result } = renderHook(() => useErrorRecovery(chunkError(), deps));
    expect(result.current.phase).toBe("failed");
    expect(result.current.kind).toBe("chunk");
    expect(deps.reload).not.toHaveBeenCalled();
    expect(deps.report).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ kind: "chunk", recovery: "shown" }),
    );
  });

  it("shows the screen when storage is blocked, rather than risk a reload loop", () => {
    const { deps } = setup({
      getStorage: () => {
        throw new DOMException("insecure", "SecurityError");
      },
    });
    const { result } = renderHook(() => useErrorRecovery(chunkError(), deps));
    expect(result.current.phase).toBe("failed");
    expect(deps.reload).not.toHaveBeenCalled();
  });

  it("shows the screen if the page is still here long after the reload began", () => {
    vi.useFakeTimers();
    const { deps } = setup();
    const { result } = renderHook(() => useErrorRecovery(chunkError(), deps));
    expect(result.current.phase).toBe("reloading");
    act(() => vi.advanceTimersByTime(RELOAD_FALLBACK_MS));
    expect(result.current.phase).toBe("failed");
    expect(deps.reload).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["render", new TypeError("Cannot read properties of null (reading 'map')")],
    ["network", new TypeError("Failed to fetch")],
  ])(
    "shows the screen at once for a %s error, without reloading",
    (kind, error) => {
      const { deps } = setup();
      const { result } = renderHook(() => useErrorRecovery(error, deps));
      expect(result.current.phase).toBe("failed");
      expect(result.current.kind).toBe(kind);
      expect(deps.reload).not.toHaveBeenCalled();
      expect(deps.report).toHaveBeenCalledWith(error, {
        kind,
        route: "/app/agents",
        recovery: "shown",
      });
    },
  );

  it("handles one error once, even when React runs its effects twice (strict mode)", () => {
    const { deps } = setup();
    const error = chunkError();
    const { rerender } = renderHook(() => useErrorRecovery(error, deps), {
      wrapper: StrictMode,
    });
    rerender();
    expect(deps.reload).toHaveBeenCalledTimes(1);
    expect(deps.report).toHaveBeenCalledTimes(1);
  });

  it("handles a new error caught by the same boundary afresh", () => {
    const { deps } = setup();
    const first = new Error("first");
    const second = new Error("second");
    const { rerender } = renderHook(({ e }) => useErrorRecovery(e, deps), {
      initialProps: { e: first },
    });
    rerender({ e: second });
    expect(deps.report).toHaveBeenCalledTimes(2);
    expect(deps.report).toHaveBeenLastCalledWith(
      second,
      expect.objectContaining({ recovery: "shown" }),
    );
  });

  it("offers the visitor a hard reload", () => {
    const { deps } = setup();
    const { result } = renderHook(() =>
      useErrorRecovery(new Error("boom"), deps),
    );
    result.current.reload();
    expect(deps.reload).toHaveBeenCalledTimes(1);
  });
});
