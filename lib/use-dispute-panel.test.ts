// @vitest-environment jsdom
/**
 * Unit tests for useDisputePanel (lib/use-dispute-panel.ts).
 *
 * The hook owns everything the receipt panel needs that is not a pure rule:
 * the fetch, the server clock measured on arrival, the connected wallet, the
 * tick, and (story 4.06) the poll that keeps an unresolved dispute live.
 * `getTaskDisputes` is replaced with deferred promises the tests settle by
 * hand, `useWallet` with a mutable address, `document.visibilityState` with
 * an override, and fake timers drive the tick and the poll — so each cadence,
 * the close, and every timer's and listener's cleanup are observable exactly,
 * down to the millisecond.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { act, cleanup, render, renderHook } from "@testing-library/react";
import { ApiError } from "./api";
import { getTaskDisputes } from "./disputes";
import type {
  Dispute,
  DisputePanelView,
  DisputeStatus,
  SettlementView,
  TaskDisputes,
} from "./types";
import {
  ADJUDICATION_POLL_MS,
  COARSE_TICK_MS,
  CREDIT_POLL_MS,
  FINAL_HOUR_TICK_MS,
  disputePollMs,
  disputeTickMs,
  useDisputePanel,
} from "./use-dispute-panel";

const { wallet } = vi.hoisted(() => ({
  wallet: { address: null as string | null },
}));

vi.mock("./wallet", () => ({
  useWallet: () => ({ address: wallet.address }),
}));

vi.mock("./disputes", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./disputes")>()),
  getTaskDisputes: vi.fn(),
}));

const fetchDisputes = vi.mocked(getTaskDisputes);

// @testing-library/react's act() requires this flag in a bare jsdom env.
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const S = 1_000;
const M = 60 * S;
const H = 60 * M;

/** The local clock when each test starts. */
const T0 = 1_790_000_000_000;
const PAYER = "GBPAYER".padEnd(56, "A");
const OTHER = "GBOTHER".padEnd(56, "B");
const JOB_A = "a".repeat(32);
const JOB_B = "b".repeat(32);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
  wallet.address = PAYER;
  fetchDisputes.mockReset();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
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

function settlement(closesAtMs: number, job = JOB_A): SettlementView {
  return {
    job_id_hex: job,
    payer: PAYER,
    settled_at: (T0 - M) / 1_000,
    window_closes_at: closesAtMs / 1_000,
    settled_usdc: 0.02,
    charge_tx: "tx_charge",
    proof_tx: null,
    steps: [0, 1].map((i) => ({
      step_index: i,
      agent_id: `agt_${i}`,
      agent_name: null,
      price_usdc: 0.01,
      delivered: true,
      creditable_usdc: 0.005,
      output_summary: null,
    })),
    policy: {
      credited_fraction: 0.5,
      funded_by: "platform",
      adjudicated_by: "platform",
    },
  };
}

/** A dispute of `step` on task_a, in `status`. */
function dsp(
  step: number,
  status: DisputeStatus,
  over: Partial<Dispute> = {},
): Dispute {
  return {
    id: `dsp_${step}`,
    job_id_hex: JOB_A,
    task_id: "task_a",
    step_index: step,
    agent_id: `agt_${step}`,
    payer: PAYER,
    reason: "empty summary",
    status,
    charged_usdc: 0.01,
    creditable_usdc: 0.005,
    opened_at: T0 / 1_000,
    resolved_at: null,
    refund_tx: null,
    rating_tx: null,
    ...over,
  };
}

/**
 * An answer whose window closes `closesInMs` after the server's `now`, with
 * the server's clock `skewMs` ahead of the local one at T0.
 */
function answer(
  closesInMs: number,
  over: Partial<TaskDisputes> & { skewMs?: number; job?: string } = {},
): TaskDisputes {
  const { skewMs = 0, job, ...rest } = over;
  const serverNowMs = T0 + skewMs;
  return {
    task_id: "task_a",
    window_closes_at: (serverNowMs + closesInMs) / 1_000,
    now: serverNowMs / 1_000,
    settlement: settlement(serverNowMs + closesInMs, job),
    disputes: [],
    ...rest,
  };
}

type Props = { taskId: string | null; workflowDone: boolean; demo: boolean };

const DEFAULTS: Props = { taskId: "task_a", workflowDone: true, demo: false };

function mount(props: Partial<Props> = {}) {
  let renders = 0;
  const hook = renderHook(
    (p: Props) => {
      renders += 1;
      return useDisputePanel(p.taskId, {
        workflowDone: p.workflowDone,
        demo: p.demo,
      });
    },
    { initialProps: { ...DEFAULTS, ...props } },
  );
  return { ...hook, renders: () => renders };
}

/** Settle a pending answer and let React commit what it causes. */
async function land<T>(d: { resolve: (v: T) => void }, value: T) {
  await act(async () => {
    d.resolve(value);
  });
}

/** Mount with an answer already landed. */
async function mountWith(res: TaskDisputes, props: Partial<Props> = {}) {
  const d = deferred<TaskDisputes>();
  fetchDisputes.mockReturnValueOnce(d.promise);
  const hook = mount(props);
  await land(d, res);
  return hook;
}

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

function settledOf(view: DisputePanelView) {
  if (view.kind !== "settled")
    throw new Error(`expected settled, got ${view.kind}`);
  return view;
}

const stateKinds = (view: DisputePanelView) =>
  settledOf(view).steps.map(({ state }) => state.kind);

describe("disputeTickMs", () => {
  const open = (remainingMs: number): DisputePanelView => ({
    kind: "settled",
    viewer: "payer",
    window: { open: remainingMs > 0, closesAtMs: T0, remainingMs },
    jobIdHex: JOB_A,
    payer: PAYER,
    settledAtMs: T0,
    settledUsdc: 0.02,
    chargeTx: null,
    proofTx: null,
    policy: settlement(T0).policy,
    steps: [],
  });

  it("runs no timer when nothing on the panel can change with time", () => {
    expect(disputeTickMs({ kind: "hidden" })).toBeNull();
    expect(disputeTickMs({ kind: "not_settled", running: true })).toBeNull();
    expect(disputeTickMs(open(0))).toBeNull();
  });

  it("ticks every 30 s while an hour or more is left", () => {
    expect(disputeTickMs(open(23 * H))).toBe(COARSE_TICK_MS);
    expect(disputeTickMs(open(H))).toBe(COARSE_TICK_MS);
  });

  it("ticks every second in the final hour", () => {
    expect(disputeTickMs(open(H - 1))).toBe(FINAL_HOUR_TICK_MS);
    expect(disputeTickMs(open(10 * M))).toBe(FINAL_HOUR_TICK_MS);
  });

  it("lands the last tick on the close itself, never before the clock can move", () => {
    expect(disputeTickMs(open(400))).toBe(400);
    expect(disputeTickMs(open(0.3))).toBe(1);
  });
});

describe("disputePollMs", () => {
  const withStatuses = (...statuses: DisputeStatus[]) =>
    answer(H, { disputes: statuses.map((s, i) => dsp(i, s)) });

  it("keeps the two cadences where the story sets them", () => {
    expect(ADJUDICATION_POLL_MS).toBe(30 * S);
    expect(CREDIT_POLL_MS).toBe(5 * S);
  });

  it("polls nothing without an answer, or with no dispute on the task", () => {
    expect(disputePollMs(null)).toBeNull();
    expect(disputePollMs(withStatuses())).toBeNull();
  });

  it("polls nothing for a panel that draws no receipt, whatever is unresolved", () => {
    const { settlement: _omitted, ...legacy } = withStatuses("open");
    expect(disputePollMs(legacy)).toBeNull();
    expect(
      disputePollMs({ ...withStatuses("crediting"), settlement: null }),
    ).toBeNull();
  });

  /** One case per status mix, labelled with the whole mix. */
  const mixes = (...cases: DisputeStatus[][]) =>
    cases.map((statuses) => ({ mix: statuses.join(" + "), statuses }));

  it.each(mixes(["credited"], ["rejected"], ["credited", "rejected"]))(
    "stops once every dispute is final: $mix",
    ({ statuses }) => {
      expect(disputePollMs(withStatuses(...statuses))).toBeNull();
    },
  );

  it.each(
    mixes(
      ["open"],
      ["open", "open"],
      ["credited", "open"],
      ["open", "rejected"],
    ),
  )(
    "re-reads every 30 s while the only unresolved disputes are open: $mix",
    ({ statuses }) => {
      expect(disputePollMs(withStatuses(...statuses))).toBe(
        ADJUDICATION_POLL_MS,
      );
    },
  );

  it.each(
    mixes(
      ["upheld"],
      ["crediting"],
      ["open", "upheld"],
      ["crediting", "open"],
      ["credited", "rejected", "crediting"],
    ),
  )(
    "re-reads every 5 s while any credit is decided or in flight: $mix",
    ({ statuses }) => {
      expect(disputePollMs(withStatuses(...statuses))).toBe(CREDIT_POLL_MS);
    },
  );
});

describe("useDisputePanel — what it fetches", () => {
  it("fetches nothing and stays hidden in demo mode", () => {
    const { result } = mount({ demo: true });

    expect(result.current).toMatchObject({
      view: { kind: "hidden" },
      loading: false,
      error: null,
    });
    expect(fetchDisputes).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("fetches nothing and stays hidden without a task", () => {
    const { result } = mount({ taskId: null });

    expect(result.current).toMatchObject({
      view: { kind: "hidden" },
      loading: false,
      error: null,
    });
    expect(fetchDisputes).not.toHaveBeenCalled();
  });

  it("is loading until the answer lands, then draws it", async () => {
    const d = deferred<TaskDisputes>();
    fetchDisputes.mockReturnValueOnce(d.promise);
    const { result } = mount();

    expect(fetchDisputes).toHaveBeenCalledWith("task_a");
    expect(result.current).toMatchObject({
      view: { kind: "hidden" },
      loading: true,
      error: null,
    });

    await land(d, answer(23 * H));
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(settledOf(result.current.view)).toMatchObject({
      viewer: "payer",
      jobIdHex: JOB_A,
    });
  });

  it("reports a failure as an error — never as loading, never as not settled", async () => {
    const d = deferred<TaskDisputes>();
    fetchDisputes.mockReturnValueOnce(d.promise);
    const { result } = mount();

    await act(async () => {
      d.reject(new Error("GET /tasks/task_a/disputes → 500 — boom"));
    });
    expect(result.current).toMatchObject({
      view: { kind: "hidden" },
      loading: false,
      error: "GET /tasks/task_a/disputes → 500 — boom",
    });
  });

  it("hides the panel without an error when the backend has no such route", async () => {
    const d = deferred<TaskDisputes>();
    fetchDisputes.mockReturnValueOnce(d.promise);
    const { result } = mount();

    await act(async () => {
      d.reject(new ApiError("GET /tasks/task_a/disputes → 404", 404));
    });
    expect(result.current).toMatchObject({
      view: { kind: "hidden" },
      loading: false,
      error: null,
    });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("hides the panel for a backend that predates the settlement field", async () => {
    const { settlement: _omitted, now: _alsoOmitted, ...legacy } = answer(H);
    const { result } = await mountWith(legacy);

    expect(result.current.view).toEqual({ kind: "hidden" });
    expect(result.current.error).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("says not settled while the run is going, with no timer", async () => {
    const { result } = await mountWith(answer(H, { settlement: null }), {
      workflowDone: false,
    });

    expect(result.current.view).toEqual({ kind: "not_settled", running: true });
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("useDisputePanel — who is looking", () => {
  it("follows the connected wallet: anonymous, someone else, the payer", async () => {
    wallet.address = null;
    const { result, rerender } = await mountWith(answer(23 * H));
    expect(settledOf(result.current.view).viewer).toBe("anonymous");
    expect(stateKinds(result.current.view)).toEqual(["view_only", "view_only"]);

    wallet.address = OTHER;
    rerender(DEFAULTS);
    expect(settledOf(result.current.view).viewer).toBe("other");
    expect(stateKinds(result.current.view)).toEqual(["view_only", "view_only"]);

    wallet.address = PAYER;
    rerender(DEFAULTS);
    expect(settledOf(result.current.view).viewer).toBe("payer");
    expect(stateKinds(result.current.view)).toEqual([
      "disputable",
      "disputable",
    ]);
    expect(fetchDisputes).toHaveBeenCalledTimes(1);
  });
});

describe("useDisputePanel — the server's clock", () => {
  it("judges the window on the server's clock when it runs ahead", async () => {
    // Server says 10 minutes later than this laptop does; the window closes
    // 20 minutes after the server's now.
    const { result } = await mountWith(answer(20 * M, { skewMs: 10 * M }));

    expect(settledOf(result.current.view).window).toMatchObject({
      open: true,
      remainingMs: 20 * M,
    });
  });

  it("closes the window on the server's word even if this clock says there is time", async () => {
    // The server's clock is past the close; this laptop is an hour behind.
    const { result } = await mountWith(answer(-S, { skewMs: H }));

    expect(settledOf(result.current.view).window).toMatchObject({
      open: false,
      remainingMs: 0,
    });
    expect(stateKinds(result.current.view)).toEqual([
      "window_closed",
      "window_closed",
    ]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("never offers a dispute the server has already stopped taking, however slow the read", async () => {
    // Both clocks agree. The window closes 30 s from now, the server stamps
    // its `now` as the request reaches it, and the answer takes 45 s to come
    // back — so by the time it is on screen the server has been refusing
    // disputes for 15 s. An offset measured against the ARRIVAL puts the
    // panel's clock back at the stamp and offers the button anyway; the buyer
    // signs and is told `dispute_window_closed`.
    const d = deferred<TaskDisputes>();
    fetchDisputes.mockReturnValueOnce(d.promise);
    const { result } = mount();

    await advance(45 * S);
    await land(d, {
      ...answer(0),
      now: T0 / 1_000,
      settlement: settlement(T0 + 30 * S),
    });

    expect(settledOf(result.current.view).window.open).toBe(false);
    expect(stateKinds(result.current.view)).toEqual([
      "window_closed",
      "window_closed",
    ]);
  });

  it("charges the whole round trip to the window, never to the buyer", async () => {
    // The other extreme: a cold backend that took 45 s to wake and stamped
    // its `now` on the way out. The exchange could have been spent on either
    // leg and the client cannot tell, so the panel assumes the latest server
    // clock the answer allows — understating the window by at most the round
    // trip, which no buyer loses a dispute to, rather than overstating it.
    const d = deferred<TaskDisputes>();
    fetchDisputes.mockReturnValueOnce(d.promise);
    const { result } = mount();

    await advance(45 * S);
    const leavesAtMs = T0 + 45 * S;
    await land(d, {
      ...answer(0),
      now: leavesAtMs / 1_000,
      settlement: settlement(leavesAtMs + 2 * H),
    });
    expect(settledOf(result.current.view).window.remainingMs).toBe(
      2 * H - 45 * S,
    );
  });
});

describe("useDisputePanel — the tick", () => {
  it("ticks every 30 s while more than an hour is left, and not in between", async () => {
    const { result, renders } = await mountWith(answer(3 * H));
    const at = (): number => settledOf(result.current.view).window.remainingMs;
    expect(at()).toBe(3 * H);

    const before = renders();
    await advance(COARSE_TICK_MS - 1);
    expect(at()).toBe(3 * H);
    expect(renders()).toBe(before);

    await advance(1);
    expect(at()).toBe(3 * H - COARSE_TICK_MS);
    expect(vi.getTimerCount()).toBe(1);
  });

  it("ticks every second in the final hour", async () => {
    const { result } = await mountWith(answer(10 * M));
    const at = (): number => settledOf(result.current.view).window.remainingMs;

    await advance(FINAL_HOUR_TICK_MS - 1);
    expect(at()).toBe(10 * M);
    await advance(1);
    expect(at()).toBe(10 * M - S);
    await advance(FINAL_HOUR_TICK_MS);
    expect(at()).toBe(10 * M - 2 * S);
  });

  it("drops to the one-second tick once the final hour starts", async () => {
    const { result } = await mountWith(answer(H + 10 * S));
    const at = (): number => settledOf(result.current.view).window.remainingMs;

    await advance(COARSE_TICK_MS);
    expect(at()).toBe(H - 20 * S);
    await advance(FINAL_HOUR_TICK_MS);
    expect(at()).toBe(H - 21 * S);
  });

  it("removes every action on the tick that reaches the close, then stops", async () => {
    const { result } = await mountWith(answer(2 * S + 500));

    await advance(2 * S);
    expect(settledOf(result.current.view).window).toMatchObject({
      open: true,
      remainingMs: 500,
    });
    expect(stateKinds(result.current.view)).toEqual([
      "disputable",
      "disputable",
    ]);

    await advance(500);
    expect(settledOf(result.current.view).window).toMatchObject({
      open: false,
      remainingMs: 0,
    });
    expect(stateKinds(result.current.view)).toEqual([
      "window_closed",
      "window_closed",
    ]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("clears the timer on unmount", async () => {
    const { unmount } = await mountWith(answer(10 * M));
    expect(vi.getTimerCount()).toBe(1);

    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("re-renders only the component that calls it, never its parent", async () => {
    const d = deferred<TaskDisputes>();
    fetchDisputes.mockReturnValueOnce(d.promise);
    const counts = { page: 0, panel: 0 };
    function Panel() {
      counts.panel += 1;
      useDisputePanel("task_a", { workflowDone: true, demo: false });
      return null;
    }
    function Page() {
      counts.page += 1;
      return createElement(Panel);
    }
    render(createElement(Page));
    await land(d, answer(10 * M));

    const panelBefore = counts.panel;
    // One act per tick: React flushes an act's updates when it exits, so a
    // single long advance would only ever see the first tick re-arm.
    for (let i = 0; i < 5; i += 1) await advance(FINAL_HOUR_TICK_MS);
    expect(counts.panel).toBe(panelBefore + 5);
    expect(counts.page).toBe(1);
  });
});

describe("useDisputePanel — task changes", () => {
  it("ignores the old task's answer when it lands after the switch", async () => {
    const a = deferred<TaskDisputes>();
    const b = deferred<TaskDisputes>();
    fetchDisputes.mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise);
    const { result, rerender } = mount();

    rerender({ ...DEFAULTS, taskId: "task_b" });
    expect(fetchDisputes).toHaveBeenLastCalledWith("task_b");

    await land(a, answer(10 * M, { job: JOB_A }));
    expect(result.current.loading).toBe(true);
    expect(result.current.view).toEqual({ kind: "hidden" });

    await land(b, answer(10 * M, { job: JOB_B, task_id: "task_b" }));
    expect(settledOf(result.current.view).jobIdHex).toBe(JOB_B);
  });

  it("ignores the old task's failure when it lands after the switch", async () => {
    const a = deferred<TaskDisputes>();
    const b = deferred<TaskDisputes>();
    fetchDisputes.mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise);
    const { result, rerender } = mount();

    rerender({ ...DEFAULTS, taskId: "task_b" });
    await act(async () => {
      a.reject(new Error("GET /tasks/task_a/disputes → 500"));
    });
    expect(result.current).toMatchObject({ loading: true, error: null });

    await land(b, answer(10 * M, { job: JOB_B, task_id: "task_b" }));
    expect(result.current.error).toBeNull();
    expect(settledOf(result.current.view).jobIdHex).toBe(JOB_B);
  });

  it("drops the old task's view and timer the moment the task changes", async () => {
    const { result, rerender } = await mountWith(answer(10 * M));
    expect(vi.getTimerCount()).toBe(1);

    fetchDisputes.mockReturnValueOnce(deferred<TaskDisputes>().promise);
    rerender({ ...DEFAULTS, taskId: "task_b" });
    expect(result.current).toMatchObject({
      view: { kind: "hidden" },
      loading: true,
    });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("drops an answer that lands after unmount", async () => {
    const d = deferred<TaskDisputes>();
    fetchDisputes.mockReturnValueOnce(d.promise);
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const { unmount } = mount();

    unmount();
    await act(async () => {
      d.resolve(answer(10 * M));
    });
    expect(errors).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    errors.mockRestore();
  });
});

describe("useDisputePanel — refresh", () => {
  it("refetches, keeps the view on screen meanwhile, and resolves once the answer is in", async () => {
    const { result } = await mountWith(answer(10 * M));
    const next = deferred<TaskDisputes>();
    fetchDisputes.mockReturnValueOnce(next.promise);

    let done = false;
    let pending!: Promise<void>;
    act(() => {
      pending = result.current.refresh().then(() => {
        done = true;
      });
    });
    expect(fetchDisputes).toHaveBeenCalledTimes(2);
    expect(result.current.loading).toBe(false);
    expect(stateKinds(result.current.view)).toEqual([
      "disputable",
      "disputable",
    ]);
    expect(done).toBe(false);

    const withDispute = answer(10 * M, {
      disputes: [
        {
          id: "dsp_1",
          job_id_hex: JOB_A,
          task_id: "task_a",
          step_index: 1,
          agent_id: "agt_1",
          payer: PAYER,
          reason: "empty summary",
          status: "open",
          charged_usdc: 0.01,
          creditable_usdc: 0.005,
          opened_at: T0 / 1_000,
          resolved_at: null,
          refund_tx: null,
          rating_tx: null,
        },
      ],
    });
    await land(next, withDispute);
    await act(() => pending);
    expect(done).toBe(true);
    expect(stateKinds(result.current.view)).toEqual(["disputable", "disputed"]);
  });

  it("keeps the view when a refresh fails, says so, and clears it on the next success", async () => {
    const { result } = await mountWith(answer(10 * M));
    fetchDisputes.mockRejectedValueOnce(new Error("Failed to fetch"));

    await act(() => result.current.refresh());
    expect(result.current.error).toBe("Failed to fetch");
    expect(result.current.loading).toBe(false);
    expect(settledOf(result.current.view).jobIdHex).toBe(JOB_A);

    fetchDisputes.mockResolvedValueOnce(answer(10 * M));
    await act(() => result.current.refresh());
    expect(result.current.error).toBeNull();
  });

  it("retries a failed first read as loading again — never loading and error at once", async () => {
    fetchDisputes.mockRejectedValueOnce(new Error("timeout after 60s"));
    const { result } = mount();
    await act(async () => {});
    expect(result.current).toMatchObject({
      loading: false,
      error: "timeout after 60s",
    });

    const retry = deferred<TaskDisputes>();
    fetchDisputes.mockReturnValueOnce(retry.promise);
    act(() => {
      void result.current.refresh();
    });
    expect(result.current).toMatchObject({ loading: true, error: null });

    await land(retry, answer(10 * M));
    expect(result.current.loading).toBe(false);
    expect(result.current.view.kind).toBe("settled");
  });

  it("is a no-op without a task", async () => {
    const { result } = mount({ taskId: null });

    await act(() => result.current.refresh());
    expect(fetchDisputes).not.toHaveBeenCalled();
  });
});

describe("useDisputePanel — the run finishing", () => {
  it("refetches when the run finishes, and never flashes 'nothing charged' in between", async () => {
    const { result, rerender } = await mountWith(
      answer(H, { settlement: null }),
      { workflowDone: false },
    );
    expect(result.current.view).toEqual({ kind: "not_settled", running: true });

    const after = deferred<TaskDisputes>();
    fetchDisputes.mockReturnValueOnce(after.promise);
    rerender({ ...DEFAULTS, workflowDone: true });
    expect(fetchDisputes).toHaveBeenCalledTimes(2);
    // The answer on screen was asked for mid-run: it cannot say nothing was
    // charged, so it still reads as running until the refetch lands.
    expect(result.current.view).toEqual({ kind: "not_settled", running: true });

    await land(after, answer(23 * H));
    expect(result.current.view.kind).toBe("settled");
  });

  it("says nothing was charged once a post-finish answer still has no settlement", async () => {
    const { result, rerender } = await mountWith(
      answer(H, { settlement: null }),
      { workflowDone: false },
    );

    fetchDisputes.mockResolvedValueOnce(answer(H, { settlement: null }));
    rerender({ ...DEFAULTS, workflowDone: true });
    await act(async () => {});
    expect(result.current.view).toEqual({
      kind: "not_settled",
      running: false,
    });
  });

  it("does not refetch on the finish once a settlement is already held", async () => {
    const { result, rerender } = await mountWith(answer(23 * H), {
      workflowDone: false,
    });

    rerender({ ...DEFAULTS, workflowDone: true });
    expect(fetchDisputes).toHaveBeenCalledTimes(1);
    expect(result.current.view.kind).toBe("settled");
  });

  it("reads a task again when the page comes back to it", async () => {
    const { rerender } = await mountWith(answer(23 * H));

    rerender({ ...DEFAULTS, taskId: null });
    fetchDisputes.mockResolvedValueOnce(answer(23 * H));
    rerender(DEFAULTS);
    await act(async () => {});
    expect(fetchDisputes).toHaveBeenCalledTimes(2);
  });
});

// ── live updates (story 4.06) ───────────────────────────────────

/** An answer carrying `disputes`, its window long closed — so no countdown
 * runs, and every timer left is the poll's. */
const closedWith = (...disputes: Dispute[]) => answer(-H, { disputes });

/** Queue the next read as a promise the test settles by hand. */
function nextRead() {
  const d = deferred<TaskDisputes>();
  fetchDisputes.mockReturnValueOnce(d.promise);
  return d;
}

/** The receipt on step `i` of a settled view. */
function receiptOf(view: DisputePanelView, i = 1) {
  const state = settledOf(view).steps[i]?.state;
  if (state?.kind !== "disputed")
    throw new Error(`expected step ${i} disputed, got ${state?.kind}`);
  return state.receipt;
}

describe("useDisputePanel — live updates", () => {
  it("re-reads every 30 s while the only unresolved dispute is open", async () => {
    await mountWith(closedWith(dsp(1, "open")));
    expect(vi.getTimerCount()).toBe(1);

    const poll = nextRead();
    await advance(ADJUDICATION_POLL_MS - 1);
    expect(fetchDisputes).toHaveBeenCalledTimes(1);
    await advance(1);
    expect(fetchDisputes).toHaveBeenCalledTimes(2);
    expect(fetchDisputes).toHaveBeenLastCalledWith("task_a");

    await land(poll, closedWith(dsp(1, "open")));
    nextRead();
    await advance(ADJUDICATION_POLL_MS);
    expect(fetchDisputes).toHaveBeenCalledTimes(3);
  });

  it("re-reads every 5 s while any credit is in flight, whatever else is open", async () => {
    await mountWith(closedWith(dsp(0, "open"), dsp(1, "crediting")));

    nextRead();
    await advance(CREDIT_POLL_MS - 1);
    expect(fetchDisputes).toHaveBeenCalledTimes(1);
    await advance(1);
    expect(fetchDisputes).toHaveBeenCalledTimes(2);
  });

  it("follows a dispute live from open to credited, then stops", async () => {
    const { result } = await mountWith(closedWith(dsp(1, "open")));
    expect(receiptOf(result.current.view).status).toBe("open");

    // Upheld after a 30 s wait: the credit is decided, not yet sent.
    let poll = nextRead();
    await advance(ADJUDICATION_POLL_MS);
    await land(poll, closedWith(dsp(1, "upheld", { resolved_at: T0 / 1_000 })));
    expect(receiptOf(result.current.view)).toMatchObject({
      status: "upheld",
      refund: { txHash: null, state: "pending" },
    });

    // In flight, on the 5 s cadence now.
    poll = nextRead();
    await advance(CREDIT_POLL_MS - 1);
    expect(fetchDisputes).toHaveBeenCalledTimes(2);
    await advance(1);
    expect(fetchDisputes).toHaveBeenCalledTimes(3);
    await land(
      poll,
      closedWith(dsp(1, "crediting", { refund_tx: "tx_refund" })),
    );
    expect(receiptOf(result.current.view).refund).toEqual({
      txHash: "tx_refund",
      state: "pending",
    });

    // Landed: final, and nothing left to poll for.
    poll = nextRead();
    await advance(CREDIT_POLL_MS);
    await land(
      poll,
      closedWith(
        dsp(1, "credited", { refund_tx: "tx_refund", credited_usdc: 0.004 }),
      ),
    );
    expect(receiptOf(result.current.view)).toMatchObject({
      status: "credited",
      refund: { txHash: "tx_refund", state: "confirmed" },
      amount: { usdc: 0.004, final: true },
    });
    expect(vi.getTimerCount()).toBe(0);
    await advance(H);
    expect(fetchDisputes).toHaveBeenCalledTimes(4);
  });

  it.each([
    ["no dispute", []],
    ["only final disputes", [dsp(0, "credited"), dsp(1, "rejected")]],
  ])("never polls a task with %s", async (_, disputes) => {
    await mountWith(closedWith(...disputes));

    expect(vi.getTimerCount()).toBe(0);
    await advance(H);
    expect(fetchDisputes).toHaveBeenCalledTimes(1);
  });

  it("never flashes loading or clears the view while a poll is out", async () => {
    const { result } = await mountWith(closedWith(dsp(1, "open")));
    const onScreen = result.current.view;

    const poll = nextRead();
    await advance(ADJUDICATION_POLL_MS);
    expect(fetchDisputes).toHaveBeenCalledTimes(2);
    expect(result.current).toMatchObject({ loading: false, error: null });
    expect(result.current.view).toBe(onScreen);

    await land(poll, closedWith(dsp(1, "upheld")));
    expect(result.current.loading).toBe(false);
    expect(receiptOf(result.current.view).status).toBe("upheld");
  });

  it("keeps the view when a poll fails, says so, and keeps polling until one lands", async () => {
    const { result } = await mountWith(closedWith(dsp(1, "open")));
    const onScreen = result.current.view;

    fetchDisputes.mockRejectedValueOnce(new Error("Failed to fetch"));
    await advance(ADJUDICATION_POLL_MS);
    expect(result.current).toMatchObject({
      loading: false,
      error: "Failed to fetch",
    });
    expect(result.current.view).toBe(onScreen);

    const poll = nextRead();
    await advance(ADJUDICATION_POLL_MS);
    expect(fetchDisputes).toHaveBeenCalledTimes(3);
    await land(poll, closedWith(dsp(1, "upheld")));
    expect(result.current.error).toBeNull();
    expect(receiptOf(result.current.view).status).toBe("upheld");
  });

  it("skips a poll that falls due while a refresh is out, and re-arms from the refresh's answer", async () => {
    const { result } = await mountWith(closedWith(dsp(1, "open")));
    await advance(ADJUDICATION_POLL_MS - S);

    const refreshed = nextRead();
    let done = false;
    let pending!: Promise<void>;
    act(() => {
      pending = result.current.refresh().then(() => {
        done = true;
      });
    });
    expect(fetchDisputes).toHaveBeenCalledTimes(2);

    // The poll falls due with the refresh still out: no second read.
    await advance(S);
    expect(fetchDisputes).toHaveBeenCalledTimes(2);

    await land(refreshed, closedWith(dsp(1, "upheld")));
    await act(() => pending);
    expect(done).toBe(true);
    expect(receiptOf(result.current.view).status).toBe("upheld");

    // The next poll counts from the refresh's answer, on its new cadence.
    nextRead();
    await advance(CREDIT_POLL_MS - 1);
    expect(fetchDisputes).toHaveBeenCalledTimes(2);
    await advance(1);
    expect(fetchDisputes).toHaveBeenCalledTimes(3);
  });
});

describe("useDisputePanel — the poll and the countdown", () => {
  const remaining = (view: DisputePanelView) =>
    settledOf(view).window.remainingMs;

  it("re-measures the server's clock from a poll's own answer", async () => {
    const { result } = await mountWith(
      answer(2 * H, { disputes: [dsp(1, "open")] }),
    );

    // The coarse tick and the poll fall due together.
    const poll = nextRead();
    await advance(ADJUDICATION_POLL_MS);
    expect(remaining(result.current.view)).toBe(2 * H - 30 * S);

    // The poll's answer finds the server 5 s ahead of this laptop, and the
    // window is judged on that from now on.
    await land(
      poll,
      answer(2 * H - 35 * S, { skewMs: 35 * S, disputes: [dsp(1, "open")] }),
    );
    expect(remaining(result.current.view)).toBe(2 * H - 35 * S);
  });

  it("keeps the offset it had when a poll fails", async () => {
    // The server runs 10 minutes ahead.
    const { result } = await mountWith(
      answer(2 * H, { skewMs: 10 * M, disputes: [dsp(1, "open")] }),
    );

    fetchDisputes.mockRejectedValueOnce(new Error("Failed to fetch"));
    await advance(ADJUDICATION_POLL_MS);
    expect(result.current.error).toBe("Failed to fetch");
    // Only the tick moved: still on the server's clock, 10 minutes ahead.
    expect(remaining(result.current.view)).toBe(2 * H - 30 * S);
  });

  it("leaves the countdown ticking every second while a poll is out and after it lands", async () => {
    const { result } = await mountWith(
      answer(10 * M, { disputes: [dsp(1, "open")] }),
    );

    const poll = nextRead();
    for (let i = 0; i < 30; i += 1) await advance(FINAL_HOUR_TICK_MS);
    expect(fetchDisputes).toHaveBeenCalledTimes(2);
    expect(remaining(result.current.view)).toBe(10 * M - 30 * S);

    // The tick does not wait on the poll.
    await advance(FINAL_HOUR_TICK_MS);
    expect(remaining(result.current.view)).toBe(10 * M - 31 * S);

    // The poll spent a second in flight, and the window is charged for it:
    // the offset is measured from the request, so the countdown steps to
    // where the server's clock could already be rather than where its answer
    // says it was.
    await land(
      poll,
      answer(10 * M - 31 * S, { skewMs: 31 * S, disputes: [dsp(1, "open")] }),
    );
    expect(remaining(result.current.view)).toBe(10 * M - 32 * S);
    await advance(FINAL_HOUR_TICK_MS);
    expect(remaining(result.current.view)).toBe(10 * M - 33 * S);
    // One countdown, one poll — never a second of either.
    expect(vi.getTimerCount()).toBe(2);
  });

  it("keeps polling once the window closes: a dispute outlives it", async () => {
    const { result } = await mountWith(
      answer(2 * S, { disputes: [dsp(1, "open")] }),
    );

    await advance(S);
    await advance(S);
    expect(settledOf(result.current.view).window.open).toBe(false);
    expect(vi.getTimerCount()).toBe(1);

    nextRead();
    await advance(ADJUDICATION_POLL_MS - 2 * S);
    expect(fetchDisputes).toHaveBeenCalledTimes(2);
  });
});

describe("useDisputePanel — the poll and a hidden tab", () => {
  /** Show or hide the tab the way a browser does: the state, then the event. */
  function setVisibility(state: DocumentVisibilityState) {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => state,
    });
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
  }

  afterEach(() => {
    // Drops the override, back to jsdom's own (visible) getter.
    Reflect.deleteProperty(document, "visibilityState");
  });

  it("pauses while the tab is hidden, and re-reads the moment it is back", async () => {
    await mountWith(closedWith(dsp(1, "open")));

    setVisibility("hidden");
    expect(vi.getTimerCount()).toBe(0);
    await advance(H);
    expect(fetchDisputes).toHaveBeenCalledTimes(1);

    const poll = nextRead();
    setVisibility("visible");
    expect(fetchDisputes).toHaveBeenCalledTimes(2);

    // And the cadence resumes from that answer.
    await land(poll, closedWith(dsp(1, "open")));
    nextRead();
    await advance(ADJUDICATION_POLL_MS - 1);
    expect(fetchDisputes).toHaveBeenCalledTimes(2);
    await advance(1);
    expect(fetchDisputes).toHaveBeenCalledTimes(3);
  });

  it("does not re-read early when the tab was never hidden", async () => {
    await mountWith(closedWith(dsp(1, "open")));
    await advance(10 * S);

    setVisibility("visible");
    expect(fetchDisputes).toHaveBeenCalledTimes(1);
    nextRead();
    await advance(ADJUDICATION_POLL_MS - 10 * S);
    expect(fetchDisputes).toHaveBeenCalledTimes(2);
  });

  it("arms nothing for an answer that lands in a hidden tab, until the tab is back", async () => {
    await mountWith(closedWith(dsp(1, "open")));
    const poll = nextRead();
    await advance(ADJUDICATION_POLL_MS);

    setVisibility("hidden");
    await land(poll, closedWith(dsp(1, "crediting")));
    expect(vi.getTimerCount()).toBe(0);
    await advance(H);
    expect(fetchDisputes).toHaveBeenCalledTimes(2);

    nextRead();
    setVisibility("visible");
    expect(fetchDisputes).toHaveBeenCalledTimes(3);
  });

  it("sends no second read when the tab comes back while one is still out", async () => {
    await mountWith(closedWith(dsp(1, "open")));
    const poll = nextRead();
    await advance(ADJUDICATION_POLL_MS);

    setVisibility("hidden");
    setVisibility("visible");
    expect(fetchDisputes).toHaveBeenCalledTimes(2);

    await land(poll, closedWith(dsp(1, "open")));
    nextRead();
    await advance(ADJUDICATION_POLL_MS);
    expect(fetchDisputes).toHaveBeenCalledTimes(3);
  });

  it("never starts polling while the tab is hidden", async () => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "hidden",
    });
    await mountWith(closedWith(dsp(1, "upheld")));

    expect(vi.getTimerCount()).toBe(0);
    await advance(H);
    expect(fetchDisputes).toHaveBeenCalledTimes(1);
  });
});

describe("useDisputePanel — the poll across task changes and unmount", () => {
  const spies: { mockRestore: () => void }[] = [];

  /** Live `visibilitychange` listeners on the document, added minus removed. */
  function trackVisibilityListeners() {
    const add = vi.spyOn(document, "addEventListener");
    const remove = vi.spyOn(document, "removeEventListener");
    spies.push(add, remove);
    const count = (spy: typeof add | typeof remove) =>
      spy.mock.calls.filter(([type]) => type === "visibilitychange").length;
    return () => count(add) - count(remove);
  }

  afterEach(() => {
    for (const spy of spies.splice(0)) spy.mockRestore();
  });

  it("drops the old task's poll and listener on a switch, ignores its late answer, and polls the new one", async () => {
    const live = trackVisibilityListeners();
    const { result, rerender } = await mountWith(closedWith(dsp(1, "open")));
    expect(live()).toBe(1);

    // task_a's poll is out when the page moves to task_b.
    const stale = nextRead();
    await advance(ADJUDICATION_POLL_MS);
    const b = nextRead();
    rerender({ ...DEFAULTS, taskId: "task_b" });
    expect(vi.getTimerCount()).toBe(0);
    expect(live()).toBe(0);

    await land(stale, closedWith(dsp(1, "crediting")));
    expect(result.current).toMatchObject({
      view: { kind: "hidden" },
      loading: true,
    });

    await land(
      b,
      answer(-H, {
        job: JOB_B,
        task_id: "task_b",
        disputes: [dsp(0, "open", { task_id: "task_b", job_id_hex: JOB_B })],
      }),
    );
    expect(settledOf(result.current.view).jobIdHex).toBe(JOB_B);
    expect(live()).toBe(1);

    nextRead();
    await advance(ADJUDICATION_POLL_MS);
    expect(fetchDisputes.mock.calls.map(([id]) => id)).toEqual([
      "task_a",
      "task_a",
      "task_b",
      "task_b",
    ]);
    // Re-armed on every answer, and still exactly one listener.
    expect(live()).toBe(1);
  });

  it("clears an armed poll and its listener on unmount", async () => {
    const live = trackVisibilityListeners();
    const { unmount } = await mountWith(closedWith(dsp(1, "open")));
    expect(vi.getTimerCount()).toBe(1);

    unmount();
    expect(vi.getTimerCount()).toBe(0);
    expect(live()).toBe(0);
    await advance(H);
    expect(fetchDisputes).toHaveBeenCalledTimes(1);
  });

  it("drops a poll that lands after unmount", async () => {
    const live = trackVisibilityListeners();
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    spies.push(errors);
    const { unmount } = await mountWith(closedWith(dsp(1, "open")));
    const poll = nextRead();
    await advance(ADJUDICATION_POLL_MS);

    unmount();
    expect(live()).toBe(0);
    await land(poll, closedWith(dsp(1, "crediting")));
    expect(vi.getTimerCount()).toBe(0);
    expect(errors).not.toHaveBeenCalled();
  });
});
