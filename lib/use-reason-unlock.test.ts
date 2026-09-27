// @vitest-environment jsdom
/**
 * Unit tests for useReasonUnlock (lib/use-reason-unlock.ts, D-067).
 *
 * The hook is the only place a wallet is asked to sign for a read grant, so
 * the tests pin that it asks exactly once per press and never on its own,
 * re-reads the receipt with the grant, and reports each outcome as its own
 * status: a declined prompt as `declined`, a missing route as `unavailable`.
 * The grant exchange itself is lib/dispute-read-grant's and is replaced here.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { ApiError } from "./api";
import { obtainReadGrant } from "./dispute-read-grant";
import { useReasonUnlock } from "./use-reason-unlock";

const { wallet } = vi.hoisted(() => ({
  wallet: {
    address: null as string | null,
    signMessage: (_m: string) => Promise.resolve("sig"),
  },
}));

vi.mock("./wallet", () => ({ useWallet: () => wallet }));

vi.mock("./dispute-read-grant", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./dispute-read-grant")>()),
  obtainReadGrant: vi.fn(),
}));

const obtain = vi.mocked(obtainReadGrant);

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const PAYER = "GBPAYER".padEnd(56, "A");

beforeEach(() => {
  wallet.address = PAYER;
  obtain.mockReset();
});

afterEach(cleanup);

function mount(taskId: string | null = "task_a") {
  const refresh = vi.fn(() => Promise.resolve());
  const hook = renderHook((id: string | null) => useReasonUnlock(id, refresh), {
    initialProps: taskId,
  });
  return { ...hook, refresh };
}

describe("useReasonUnlock", () => {
  it("asks for nothing until it is pressed", () => {
    const { result } = mount();
    expect(result.current).toMatchObject({
      status: "idle",
      unavailable: false,
    });
    expect(obtain).not.toHaveBeenCalled();
  });

  it("signs once for this task and wallet, then re-reads the receipt", async () => {
    obtain.mockResolvedValueOnce(undefined);
    const { result, refresh } = mount();

    await act(() => result.current.unlock());

    expect(obtain).toHaveBeenCalledTimes(1);
    expect(obtain).toHaveBeenCalledWith({
      taskId: "task_a",
      payer: PAYER,
      signMessage: wallet.signMessage,
    });
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe("idle");
  });

  it("says it is signing while the wallet is open, and takes no second press", async () => {
    let finish: () => void = () => undefined;
    obtain.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const { result } = mount();

    let first: Promise<void> = Promise.resolve();
    act(() => {
      first = result.current.unlock();
    });
    expect(result.current.status).toBe("signing");
    await act(() => result.current.unlock());
    expect(obtain).toHaveBeenCalledTimes(1);

    await act(async () => {
      finish();
      await first;
    });
    expect(result.current.status).toBe("idle");
  });

  it("reads a declined prompt as the payer's choice", async () => {
    obtain.mockRejectedValueOnce(new Error("User declined access"));
    const { result, refresh } = mount();

    await act(() => result.current.unlock());

    expect(result.current).toMatchObject({
      status: "declined",
      unavailable: false,
    });
    expect(refresh).not.toHaveBeenCalled();
  });

  it("turns itself off when the backend has no such route", async () => {
    obtain.mockRejectedValueOnce(new ApiError("POST → 404", 404));
    const { result } = mount();

    await act(() => result.current.unlock());

    expect(result.current).toMatchObject({ status: "idle", unavailable: true });
  });

  it("starts afresh on another task", async () => {
    obtain.mockRejectedValueOnce(new ApiError("POST → 404", 404));
    const { result, rerender } = mount();
    await act(() => result.current.unlock());
    expect(result.current.unavailable).toBe(true);

    rerender("task_b");
    expect(result.current).toMatchObject({
      status: "idle",
      unavailable: false,
    });
  });

  it("asks nothing without a wallet or a task", async () => {
    wallet.address = null;
    const { result } = mount();
    await act(() => result.current.unlock());
    const none = mount(null);
    await act(() => none.result.current.unlock());
    expect(obtain).not.toHaveBeenCalled();
  });
});
