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
import {
  heldReadGrant,
  noteServerClockOffset,
  rememberReadGrant,
} from "./dispute-read-grant";
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
  DECISION_WAIT_MS,
  PENDING_FAST_WAIT_MS,
  PENDING_WAIT_MS,
  SETTLEMENT_POLL_MS,
  SETTLEMENT_WAIT_MS,
  disputePollMs,
  disputeTickMs,
  pendingKey,
  useDisputePanel,
} from "./use-dispute-panel";

// The wallet hands the hook a `signMessage` it must never call: a poll, a
// refresh, a dropped grant — nothing here may put a prompt in front of the
// buyer. Every test ends by checking it was not (see `afterEach`).
const { wallet } = vi.hoisted(() => ({
  wallet: {
    address: null as string | null,
    signMessage: vi.fn<(message: string) => Promise<string>>(),
  },
}));

vi.mock("./wallet", () => ({
  useWallet: () => ({
    address: wallet.address,
    signMessage: wallet.signMessage,
  }),
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
  wallet.signMessage.mockReset();
  wallet.signMessage.mockImplementation(async (m) => `sig(${m})`);
  fetchDisputes.mockReset();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  expect(wallet.signMessage).not.toHaveBeenCalled();
  // A read grant one test keeps must not ride on the next test's reads, and
  // nor may the server clock one test measured.
  window.sessionStorage.clear();
  noteServerClockOffset(0);
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

/** `advance`, a second at a time: every answer that lands re-arms the poll
 * before the next timer is due, as it does in a browser. One large advance
 * fires at most one poll, and would "prove" a stop that never happened. */
async function stepThrough(ms: number) {
  for (let t = 0; t < ms; t += S) await advance(S);
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
    reasonsWithheld: false,
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
  // A credited dispute carries the hash that proves its transfer: the status
  // alone was never what made a receipt final.
  const withStatuses = (...statuses: DisputeStatus[]) =>
    answer(H, {
      disputes: statuses.map((s, i) =>
        dsp(i, s, s === "credited" ? { refund_tx: `tx_${i}` } : {}),
      ),
    });

  /** The cadence for an answer, on a task whose run has sealed and whose
   * settlement — when it has one — arrived with the first read. */
  const pollFor = (
    res: TaskDisputes | null,
    over: Partial<{
      doneAtRequest: boolean;
      awaitedMs: number;
      pendingAwaitedMs: number;
    }> = {},
  ) =>
    disputePollMs(
      res === null ? null : { res, doneAtRequest: true, awaitedMs: 0, ...over },
    );

  it("keeps the two cadences where the story sets them", () => {
    expect(ADJUDICATION_POLL_MS).toBe(30 * S);
    expect(CREDIT_POLL_MS).toBe(5 * S);
  });

  it("polls nothing without an answer, or with no dispute on the task", () => {
    expect(pollFor(null)).toBeNull();
    expect(pollFor(withStatuses())).toBeNull();
  });

  it("polls nothing for a backend that predates the settlement field", () => {
    const { settlement: _omitted, ...legacy } = withStatuses("open");
    expect(pollFor(legacy)).toBeNull();
  });

  it("asks a sealed run for its missing settlement, and only until the wait is spent", () => {
    const unsettled = { ...withStatuses("crediting"), settlement: null };

    expect(pollFor(unsettled)).toBe(SETTLEMENT_POLL_MS);
    expect(pollFor(unsettled, { awaitedMs: SETTLEMENT_WAIT_MS - 1 })).toBe(
      SETTLEMENT_POLL_MS,
    );
    expect(pollFor(unsettled, { awaitedMs: SETTLEMENT_WAIT_MS })).toBeNull();
    // Still running: the seal's own refetch is what asks next.
    expect(pollFor(unsettled, { doneAtRequest: false })).toBeNull();
  });

  /** One case per status mix, labelled with the whole mix. */
  const mixes = (...cases: DisputeStatus[][]) =>
    cases.map((statuses) => ({ mix: statuses.join(" + "), statuses }));

  it.each(mixes(["credited"], ["rejected"], ["credited", "rejected"]))(
    "stops once every dispute is final: $mix",
    ({ statuses }) => {
      expect(pollFor(withStatuses(...statuses))).toBeNull();
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
      expect(pollFor(withStatuses(...statuses))).toBe(ADJUDICATION_POLL_MS);
    },
  );

  it("re-reads a credited dispute whose refund has not landed, within its wait", () => {
    // `credited` was treated as final, but a record with no transfer on it is
    // one the receipt itself calls pending — the copy is hedged, the badge
    // reads "Refund in progress", and nothing was ever going to re-read it.
    // Nor is anything sure to: the operator reconciles it by hand, so the
    // wait is bounded like every other.
    const res = answer(H, {
      disputes: [dsp(0, "credited", { refund_tx: null })],
    });
    expect(pollFor(res)).toBe(CREDIT_POLL_MS);
    expect(pollFor(res, { pendingAwaitedMs: PENDING_WAIT_MS })).toBeNull();
  });

  it("re-reads a credited dispute whose backend has withdrawn its word", () => {
    expect(
      pollFor(
        answer(H, {
          disputes: [
            dsp(0, "credited", { refund_tx: "tx_0", refund_confirmed: false }),
          ],
        }),
      ),
    ).toBe(CREDIT_POLL_MS);
  });

  it("re-reads while a rating the backend calls unconfirmed is in flight", () => {
    expect(
      pollFor(
        answer(H, {
          disputes: [
            dsp(0, "credited", {
              refund_tx: "tx_0",
              rating_tx: "tx_rating",
              rating_confirmed: false,
            }),
          ],
        }),
      ),
    ).toBe(CREDIT_POLL_MS);
  });

  it("stops for a rating an older backend cannot confirm either way", () => {
    // Absent is "this backend cannot say", and it never becomes a yes: a poll
    // waiting on it would run for the life of the tab.
    expect(
      pollFor(
        answer(H, {
          disputes: [
            dsp(0, "credited", { refund_tx: "tx_0", rating_tx: "tx_rating" }),
          ],
        }),
      ),
    ).toBeNull();
  });

  // D-069: the refund has landed and the backend says, by sending the field
  // as null, that it has no rating YET. One uphold writes the rating seconds
  // after the credit, so a poll in that gap must not read it as final.
  const ratingOwed = (over: Partial<Dispute> = {}) =>
    answer(H, {
      disputes: [
        dsp(0, "credited", {
          refund_tx: "tx_0",
          rating_tx: null,
          rating_confirmed: null,
          ...over,
        }),
      ],
    });

  it("re-reads a refund that landed before its rating: fast, then slow, then not at all", () => {
    expect(pollFor(ratingOwed())).toBe(CREDIT_POLL_MS);
    expect(
      pollFor(ratingOwed(), { pendingAwaitedMs: PENDING_FAST_WAIT_MS - 1 }),
    ).toBe(CREDIT_POLL_MS);
    expect(
      pollFor(ratingOwed(), { pendingAwaitedMs: PENDING_FAST_WAIT_MS }),
    ).toBe(ADJUDICATION_POLL_MS);
    expect(
      pollFor(ratingOwed(), { pendingAwaitedMs: PENDING_WAIT_MS - 1 }),
    ).toBe(ADJUDICATION_POLL_MS);
    expect(
      pollFor(ratingOwed(), { pendingAwaitedMs: PENDING_WAIT_MS }),
    ).toBeNull();
  });

  it("keeps the rating's bounds inside the backend's own worst case and an operator's re-run", () => {
    // About a minute is the backend's worst case for one rating (two 15 s
    // posts and a 30 s confirmation poll); fifteen minutes is an operator
    // upholding again. Far past either, a receipt must stop reading.
    expect(PENDING_FAST_WAIT_MS).toBe(90 * S);
    expect(PENDING_WAIT_MS).toBe(15 * M);
  });

  it("does not wait on a rating an older backend cannot report at all", () => {
    // ABSENT, not null: this backend never says, and it never becomes a yes.
    const { rating_confirmed: _absent, ...legacy } = dsp(0, "credited", {
      refund_tx: "tx_0",
    });
    expect(pollFor(answer(H, { disputes: [legacy] }))).toBeNull();
  });

  it("stops once the rating is recorded and confirmed", () => {
    expect(
      pollFor(ratingOwed({ rating_tx: "tx_rating", rating_confirmed: true })),
    ).toBeNull();
  });

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
      expect(pollFor(withStatuses(...statuses))).toBe(CREDIT_POLL_MS);
    },
  );

  // Every wait is bounded, as D-069 bounded the rating's: none of these is
  // sure to resolve, and each read every five seconds for the life of the
  // tab — 1,400 reads in two hours, in the probe that found it.
  it.each([
    ["credited with no transfer on record", dsp(0, "credited")],
    ["upheld, waiting on an operator", dsp(0, "upheld")],
    ["crediting", dsp(0, "crediting", { refund_tx: "tx_0" })],
    [
      "credited, the backend withdrawing its word",
      dsp(0, "credited", { refund_tx: "tx_0", refund_confirmed: false }),
    ],
    [
      "a rating in flight with its hash",
      dsp(0, "credited", {
        refund_tx: "tx_0",
        rating_tx: "tx_rating",
        rating_confirmed: false,
      }),
    ],
  ])("reads %s fast, then slow, then not at all", (_, dispute) => {
    const res = answer(H, { disputes: [dispute] });
    const at = (pendingAwaitedMs: number) => pollFor(res, { pendingAwaitedMs });
    expect(at(0)).toBe(CREDIT_POLL_MS);
    expect(at(PENDING_FAST_WAIT_MS - 1)).toBe(CREDIT_POLL_MS);
    expect(at(PENDING_FAST_WAIT_MS)).toBe(ADJUDICATION_POLL_MS);
    expect(at(PENDING_WAIT_MS - 1)).toBe(ADJUDICATION_POLL_MS);
    expect(at(PENDING_WAIT_MS)).toBeNull();
  });

  it("reads an open dispute every 30 s for half an hour, then not at all", () => {
    const res = withStatuses("open");
    expect(DECISION_WAIT_MS).toBe(30 * M);
    expect(pollFor(res, { pendingAwaitedMs: 0 })).toBe(ADJUDICATION_POLL_MS);
    expect(pollFor(res, { pendingAwaitedMs: DECISION_WAIT_MS - 1 })).toBe(
      ADJUDICATION_POLL_MS,
    );
    expect(pollFor(res, { pendingAwaitedMs: DECISION_WAIT_MS })).toBeNull();
  });

  it("keeps an open dispute read slowly once a credit beside it has run its wait out", () => {
    const res = withStatuses("open", "upheld");
    expect(pollFor(res, { pendingAwaitedMs: PENDING_WAIT_MS })).toBe(
      ADJUDICATION_POLL_MS,
    );
    expect(pollFor(res, { pendingAwaitedMs: DECISION_WAIT_MS })).toBeNull();
  });

  it("never reads on for another job's dispute, which the view never shows", () => {
    // A task that ran twice holds two jobs' disputes; the receipt is one.
    const other = { job_id_hex: JOB_B };
    expect(
      pollFor(answer(H, { disputes: [dsp(0, "credited", other)] })),
    ).toBeNull();
    expect(
      pollFor(answer(H, { disputes: [dsp(0, "open", other)] })),
    ).toBeNull();
    expect(
      pollFor(
        answer(H, {
          disputes: [
            dsp(0, "credited", {
              ...other,
              refund_tx: "tx_0",
              rating_confirmed: null,
            }),
          ],
        }),
      ),
    ).toBeNull();
  });
});

describe("disputePollMs — an unconfirmed escrow v2 settlement", () => {
  const pollFor = (
    res: TaskDisputes,
    over: Partial<{ awaitedMs: number; pendingAwaitedMs: number }> = {},
  ) => disputePollMs({ res, doneAtRequest: true, awaitedMs: 0, ...over });

  // It may still land, and nothing the buyer does would fetch again when it
  // does. Fast, then slow, then not at all — with or without a record.
  it.each([
    ["with a record", answer(H, { settlement_state: "unconfirmed" })],
    [
      "with no record",
      answer(H, { settlement: null, settlement_state: "unconfirmed" }),
    ],
  ])("re-reads it on the chain-wait cadence, bounded, %s", (_name, res) => {
    expect(pollFor(res, { awaitedMs: SETTLEMENT_WAIT_MS })).toBe(
      CREDIT_POLL_MS,
    );
    expect(
      pollFor(res, {
        awaitedMs: SETTLEMENT_WAIT_MS,
        pendingAwaitedMs: PENDING_FAST_WAIT_MS,
      }),
    ).toBe(ADJUDICATION_POLL_MS);
    expect(
      pollFor(res, {
        awaitedMs: SETTLEMENT_WAIT_MS,
        pendingAwaitedMs: PENDING_WAIT_MS,
      }),
    ).toBeNull();
  });

  it("stops asking once a failed settlement's short wait is spent", () => {
    const failed = answer(H, { settlement: null, settlement_state: "failed" });
    expect(pollFor(failed, { awaitedMs: SETTLEMENT_WAIT_MS })).toBeNull();
  });

  it("counts an unconfirmed settlement as something still moving", () => {
    expect(pendingKey(answer(H, { settlement_state: "unconfirmed" }))).toBe(
      "settlement:unconfirmed",
    );
    expect(pendingKey(answer(H, { settlement_state: "settled" }))).toBe("");
  });
});

describe("pendingKey", () => {
  it("is empty when nothing on the receipt can move", () => {
    expect(pendingKey(answer(H))).toBe("");
    expect(
      pendingKey(
        answer(H, {
          disputes: [
            dsp(0, "credited", { refund_tx: "tx_0" }),
            dsp(1, "rejected"),
          ],
        }),
      ),
    ).toBe("");
    expect(pendingKey(answer(H, { settlement: null }))).toBe("");
  });

  it("changes whenever a moving dispute moves, and not otherwise", () => {
    const key = (d: Dispute) => pendingKey(answer(H, { disputes: [d] }));
    const open = key(dsp(0, "open"));
    expect(open).not.toBe("");
    expect(key(dsp(0, "open"))).toBe(open);
    // A reason unlocked, or a stamp moved, is not the receipt moving.
    expect(key(dsp(0, "open", { reason: "", updated_at: 1 }))).toBe(open);

    const upheld = key(dsp(0, "upheld"));
    const crediting = key(dsp(0, "crediting"));
    const withHash = key(dsp(0, "crediting", { refund_tx: "tx_0" }));
    expect(new Set([open, upheld, crediting, withHash]).size).toBe(4);
    const confirming = key(
      dsp(0, "credited", {
        refund_tx: "tx_0",
        rating_tx: "tx_r",
        rating_confirmed: false,
      }),
    );
    const rated = key(
      dsp(0, "credited", { refund_tx: "tx_0", refund_confirmed: false }),
    );
    expect(confirming).not.toBe(rated);
  });

  it("ignores another job's disputes and the order they arrive in", () => {
    const a = dsp(0, "open");
    const b = dsp(1, "upheld");
    const other = dsp(0, "crediting", { id: "dsp_x", job_id_hex: JOB_B });
    expect(pendingKey(answer(H, { disputes: [a, b, other] }))).toBe(
      pendingKey(answer(H, { disputes: [b, a] })),
    );
  });
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

    expect(fetchDisputes).toHaveBeenCalledWith("task_a", null);
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

  // B-4 (the `disputes.spec.ts:559` flake): the first 404 LANDS, then the
  // run seals, or the page refreshes. The route is as missing as it was.
  it("reads a second 404 after the no-route stub as the same missing route, when the run seals", async () => {
    fetchDisputes.mockRejectedValueOnce(
      new ApiError("GET /tasks/task_a/disputes → 404", 404),
    );
    const { result, rerender } = mount({ workflowDone: false });
    await act(async () => {});
    expect(result.current.error).toBeNull();

    fetchDisputes.mockRejectedValueOnce(
      new ApiError("GET /tasks/task_a/disputes → 404", 404),
    );
    rerender({ ...DEFAULTS, workflowDone: true });
    await act(async () => {});
    expect(fetchDisputes).toHaveBeenCalledTimes(2);
    expect(result.current).toMatchObject({
      view: { kind: "hidden" },
      loading: false,
      error: null,
    });
  });

  it("reads a 404 on a refresh after the no-route stub the same way", async () => {
    fetchDisputes.mockRejectedValueOnce(
      new ApiError("GET /tasks/task_a/disputes → 404", 404),
    );
    const { result } = mount();
    await act(async () => {});

    fetchDisputes.mockRejectedValueOnce(
      new ApiError("GET /tasks/task_a/disputes → 404", 404),
    );
    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.error).toBeNull();
    expect(result.current.view).toEqual({ kind: "hidden" });
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

describe("useDisputePanel — waiting for a settlement", () => {
  /** The seal has fired, and the settlement row is not there yet. */
  const unsettled = (over: Partial<TaskDisputes> = {}) => ({
    ...answer(2 * H),
    settlement: null,
    ...over,
  });

  /** How many re-reads the bounded wait is worth. */
  const TRIES = SETTLEMENT_WAIT_MS / SETTLEMENT_POLL_MS;

  it("keeps the wait short and bounded", () => {
    expect(SETTLEMENT_POLL_MS).toBe(3 * S);
    expect(SETTLEMENT_WAIT_MS).toBe(30 * S);
  });

  it("keeps asking for a settlement the seal says should exist", async () => {
    // `workflowDone` comes from the trace SSE seal. A settlement row committed
    // even 100 ms after that event answers this read with `settlement: null`,
    // and nothing else would ever ask again: the fetch effect's deps do not
    // change, and neither cadence covered an unsettled answer. The buyer was
    // told, as a fact, that their paid workflow charged nothing — with no
    // error, so not even the retry control was drawn.
    const { result } = await mountWith(unsettled());
    expect(result.current.view).toEqual({ kind: "not_settled", running: true });

    fetchDisputes.mockResolvedValue(answer(2 * H));
    await advance(SETTLEMENT_POLL_MS);

    expect(fetchDisputes).toHaveBeenCalledTimes(2);
    expect(result.current.view.kind).toBe("settled");
  });

  it("never says nothing was charged while it is still looking", async () => {
    // That one sentence closes the buyer's only route to a refund. It is not
    // said on a first answer, and not while a re-read might still disprove it.
    const { result } = await mountWith(unsettled());
    fetchDisputes.mockResolvedValue(unsettled());

    for (let i = 0; i < TRIES; i += 1) {
      expect(result.current.view).toEqual({
        kind: "not_settled",
        running: true,
      });
      await advance(SETTLEMENT_POLL_MS);
    }

    expect(result.current.view).toEqual({
      kind: "not_settled",
      running: false,
    });
  });

  it("gives up in the end rather than polling a settlement that is never coming", async () => {
    await mountWith(unsettled());
    fetchDisputes.mockResolvedValue(unsettled());

    for (let i = 0; i < TRIES; i += 1) await advance(SETTLEMENT_POLL_MS);
    expect(fetchDisputes).toHaveBeenCalledTimes(1 + TRIES);
    expect(vi.getTimerCount()).toBe(0);

    for (let i = 0; i < 20; i += 1) await advance(SETTLEMENT_POLL_MS);
    expect(fetchDisputes).toHaveBeenCalledTimes(1 + TRIES);
  });

  it("stops the moment the settlement lands, mid-wait", async () => {
    const { result } = await mountWith(unsettled());
    fetchDisputes.mockResolvedValue(unsettled());

    await advance(SETTLEMENT_POLL_MS);
    fetchDisputes.mockResolvedValue(answer(2 * H));
    await advance(SETTLEMENT_POLL_MS);

    expect(result.current.view.kind).toBe("settled");
    const spent = fetchDisputes.mock.calls.length;
    for (let i = 0; i < TRIES; i += 1) await advance(SETTLEMENT_POLL_MS);
    expect(fetchDisputes).toHaveBeenCalledTimes(spent);
  });

  it("does not let a failing backend hold the wait open for ever", async () => {
    // The snapshot is kept on error, so nothing about the answer changes and
    // the deadline has to be judged on the clock rather than on what landed.
    await mountWith(unsettled());
    fetchDisputes.mockRejectedValue(new Error("Failed to fetch"));

    for (let i = 0; i < TRIES + 5; i += 1) await advance(SETTLEMENT_POLL_MS);
    expect(fetchDisputes.mock.calls.length).toBeLessThanOrEqual(1 + TRIES);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("asks nothing extra while the run is still going", async () => {
    // Not finished: the seal itself will fetch, so a poll would only double
    // every read of a live run.
    await mountWith(unsettled(), { workflowDone: false });

    for (let i = 0; i < TRIES; i += 1) await advance(SETTLEMENT_POLL_MS);
    expect(fetchDisputes).toHaveBeenCalledTimes(1);
  });

  it("asks nothing of a backend that predates the settlement field", async () => {
    const { settlement: _omitted, ...legacy } = unsettled();
    const { result } = await mountWith(legacy);

    for (let i = 0; i < TRIES; i += 1) await advance(SETTLEMENT_POLL_MS);
    expect(result.current.view).toEqual({ kind: "hidden" });
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
    expect(fetchDisputes).toHaveBeenLastCalledWith("task_b", null);

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

  it("says nothing was charged only once the post-finish answers stop changing", async () => {
    const { result, rerender } = await mountWith(
      answer(H, { settlement: null }),
      { workflowDone: false },
    );

    fetchDisputes.mockResolvedValue(answer(H, { settlement: null }));
    rerender({ ...DEFAULTS, workflowDone: true });
    await act(async () => {});
    // The settlement is written AFTER the seal that flipped this flag, so the
    // first answer past it proves nothing.
    expect(result.current.view).toEqual({ kind: "not_settled", running: true });

    for (let i = 0; i < SETTLEMENT_WAIT_MS / SETTLEMENT_POLL_MS; i += 1) {
      await advance(SETTLEMENT_POLL_MS);
    }
    expect(result.current.view).toEqual({
      kind: "not_settled",
      running: false,
    });
  });

  it("does not double the read when the run finishes mid-fetch", async () => {
    // The finish lands while the FIRST read is still out — and that is the
    // slowest read there is, the cold one a first visit waits a minute for.
    // A second request doubles it for nothing: the answer already coming is
    // at least as fresh as the one it would ask for.
    const first = deferred<TaskDisputes>();
    fetchDisputes.mockReturnValueOnce(first.promise);
    const { result, rerender } = mount({ workflowDone: false });
    expect(fetchDisputes).toHaveBeenCalledTimes(1);

    rerender({ ...DEFAULTS, workflowDone: true });
    expect(fetchDisputes).toHaveBeenCalledTimes(1);

    // The seal is not lost with the request: the answer arrives after it, so
    // an empty settlement is one worth waiting on rather than one to declare.
    fetchDisputes.mockResolvedValue(answer(H, { settlement: null }));
    await land(first, answer(H, { settlement: null }));
    expect(result.current.view).toEqual({ kind: "not_settled", running: true });

    await advance(SETTLEMENT_POLL_MS);
    expect(fetchDisputes).toHaveBeenCalledTimes(2);
  });

  it("spends a seal recorded against a read that then FAILS on a read of its own", async () => {
    // The seal was not spent on a request of its own because a read was out;
    // that read failed, so nothing else would ever ask for the settlement.
    const first = deferred<TaskDisputes>();
    fetchDisputes.mockReturnValueOnce(first.promise);
    const { result, rerender } = mount({ workflowDone: false });
    rerender({ ...DEFAULTS, workflowDone: true });
    expect(fetchDisputes).toHaveBeenCalledTimes(1);

    const again = nextRead();
    await act(async () => {
      first.reject(new ApiError("GET /tasks/task_a/disputes → 503", 503));
    });
    expect(fetchDisputes).toHaveBeenCalledTimes(2);
    // Nothing is on screen, so the new attempt is loading, not failing.
    expect(result.current).toMatchObject({ loading: true, error: null });

    await land(again, answer(23 * H));
    expect(result.current.view.kind).toBe("settled");
    expect(result.current.error).toBeNull();
  });

  it("spends that seal once: a second failure is an error to retry by hand", async () => {
    const first = deferred<TaskDisputes>();
    fetchDisputes.mockReturnValueOnce(first.promise);
    const { result, rerender } = mount({ workflowDone: false });
    rerender({ ...DEFAULTS, workflowDone: true });

    fetchDisputes.mockRejectedValueOnce(
      new ApiError("GET /tasks/task_a/disputes → 503", 503),
    );
    await act(async () => {
      first.reject(new ApiError("GET /tasks/task_a/disputes → 503", 503));
    });
    await act(async () => {});
    expect(fetchDisputes).toHaveBeenCalledTimes(2);
    expect(result.current.error).toBe("GET /tasks/task_a/disputes → 503");

    await advance(10 * M);
    expect(fetchDisputes).toHaveBeenCalledTimes(2);
  });

  it("reads again when the run finishes after an answer has landed", async () => {
    // The ordinary case, and the one the skip above must not swallow.
    const { rerender } = await mountWith(answer(H, { settlement: null }), {
      workflowDone: false,
    });

    nextRead();
    rerender({ ...DEFAULTS, workflowDone: true });
    expect(fetchDisputes).toHaveBeenCalledTimes(2);
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

// ── the payer's read grant (D-067) ─────────────────────────────

describe("useDisputePanel — the payer's read grant", () => {
  const GRANT = { grant: "grant-token", expires_at: T0 / 1_000 + H / 1_000 };

  it("presents a held grant on the first read and on every poll, never asking for another", async () => {
    rememberReadGrant("task_a", PAYER, GRANT);
    await mountWith(answer(-H, { disputes: [dsp(1, "open")] }));
    expect(fetchDisputes).toHaveBeenLastCalledWith("task_a", "grant-token");

    fetchDisputes.mockResolvedValue(answer(-H, { disputes: [dsp(1, "open")] }));
    await advance(ADJUDICATION_POLL_MS);
    await advance(ADJUDICATION_POLL_MS);
    expect(fetchDisputes).toHaveBeenCalledTimes(3);
    for (const call of fetchDisputes.mock.calls) {
      expect(call).toEqual(["task_a", "grant-token"]);
    }
  });

  it("keeps a grant signed for on a laptop an hour fast, judged on the server's measured clock", async () => {
    // The receipt measured the server an hour behind this laptop; the grant
    // the payer then signed for expires an hour after the SERVER's now.
    const { result } = await mountWith(
      answer(-H, { skewMs: -H, disputes: [dsp(1, "open")] }),
    );
    rememberReadGrant("task_a", PAYER, {
      grant: "grant-token",
      expires_at: (T0 - H + H) / 1_000,
    });

    fetchDisputes.mockResolvedValueOnce(
      answer(-H, { skewMs: -H, disputes: [dsp(1, "open")] }),
    );
    await act(async () => {
      await result.current.refresh();
    });
    expect(fetchDisputes).toHaveBeenLastCalledWith("task_a", "grant-token");
    expect(heldReadGrant("task_a", PAYER)).toBe("grant-token");
  });

  it("presents nothing for a wallet other than the one that signed", async () => {
    rememberReadGrant("task_a", PAYER, GRANT);
    wallet.address = OTHER;
    await mountWith(answer(-H, { disputes: [dsp(1, "open")] }));
    expect(fetchDisputes).toHaveBeenLastCalledWith("task_a", null);
  });

  it("drops a grant the server no longer honours, once, and reads on without it", async () => {
    rememberReadGrant("task_a", PAYER, GRANT);
    const withheld = answer(-H, {
      disputes: [dsp(1, "open", { reason: "", reason_withheld: true })],
    });
    const { result } = await mountWith(withheld);
    expect(fetchDisputes).toHaveBeenLastCalledWith("task_a", "grant-token");
    expect(heldReadGrant("task_a", PAYER)).toBeNull();
    // The payer is offered the signature again — by the receipt, on a click.
    expect(settledOf(result.current.view).reasonsWithheld).toBe(true);

    fetchDisputes.mockResolvedValue(withheld);
    await advance(ADJUDICATION_POLL_MS);
    expect(fetchDisputes).toHaveBeenCalledTimes(2);
    expect(fetchDisputes).toHaveBeenLastCalledWith("task_a", null);
  });

  it("reads again with the grant once the payer's wallet restores, and only once", async () => {
    // The wallet restores after the first read. Without a re-read, a payer
    // who had signed and then reloaded a settled receipt — which nothing
    // polls — was offered the signature again for a grant they held.
    rememberReadGrant("task_a", PAYER, GRANT);
    wallet.address = null;
    const { result, rerender } = await mountWith(
      answer(-H, {
        disputes: [dsp(1, "rejected", { reason: "", reason_withheld: true })],
      }),
    );
    expect(fetchDisputes).toHaveBeenLastCalledWith("task_a", null);

    const withGrant = nextRead();
    wallet.address = PAYER;
    rerender(DEFAULTS);
    expect(fetchDisputes).toHaveBeenCalledTimes(2);
    expect(fetchDisputes).toHaveBeenLastCalledWith("task_a", "grant-token");
    await land(
      withGrant,
      answer(-H, {
        disputes: [dsp(1, "rejected", { reason_withheld: false })],
      }),
    );
    expect(settledOf(result.current.view).reasonsWithheld).toBe(false);
    expect(receiptOf(result.current.view).reason).toBe("empty summary");

    await advance(H);
    expect(fetchDisputes).toHaveBeenCalledTimes(2);
  });

  it("keeps a grant the server honoured", async () => {
    rememberReadGrant("task_a", PAYER, GRANT);
    const { result } = await mountWith(
      answer(-H, {
        disputes: [dsp(1, "open", { reason_withheld: false })],
      }),
    );
    expect(heldReadGrant("task_a", PAYER)).toBe("grant-token");
    expect(settledOf(result.current.view).reasonsWithheld).toBe(false);
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
    expect(fetchDisputes).toHaveBeenLastCalledWith("task_a", null);

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
    [
      "only settled receipts",
      // Credited WITH the transfer that proves it: nothing here is waiting on
      // the chain, which is what makes a receipt final.
      [dsp(0, "credited", { refund_tx: "tx_0" }), dsp(1, "rejected")],
    ],
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
    // Equal, not identical: a failed read still moves the clock the bounded
    // waits run on, so the view is recomputed — to the same receipt.
    expect(result.current.view).toEqual(onScreen);

    const poll = nextRead();
    await advance(ADJUDICATION_POLL_MS);
    expect(fetchDisputes).toHaveBeenCalledTimes(3);
    await land(poll, closedWith(dsp(1, "upheld")));
    expect(result.current.error).toBeNull();
    expect(receiptOf(result.current.view).status).toBe("upheld");
  });

  it("goes on reading a credited receipt whose refund has not landed, until it does", async () => {
    // The only unresolved states the hook never polled: the copy says the
    // transfer is pending and nothing was ever going to ask again, so the
    // receipt could not resolve without a reload. (Bounded: see "reads a
    // receipt left on credited with no transfer on record…" below.)
    const { result } = await mountWith(
      closedWith(dsp(1, "credited", { refund_tx: null })),
    );
    expect(receiptOf(result.current.view).refund.state).toBe("pending");

    fetchDisputes.mockResolvedValue(
      closedWith(dsp(1, "credited", { refund_tx: null })),
    );
    for (let i = 0; i < 3; i += 1) await advance(CREDIT_POLL_MS);
    expect(fetchDisputes).toHaveBeenCalledTimes(4);

    const landed = nextRead();
    await advance(CREDIT_POLL_MS);
    await land(landed, closedWith(dsp(1, "credited", { refund_tx: "tx_r" })));
    expect(receiptOf(result.current.view).refund.state).toBe("confirmed");

    // Nothing is waiting on the chain now, so nothing reads again.
    const spent = fetchDisputes.mock.calls.length;
    for (let i = 0; i < 3; i += 1) await advance(CREDIT_POLL_MS);
    expect(fetchDisputes).toHaveBeenCalledTimes(spent);
  });

  // D-069, through the hook: the gap between the credit and the rating.
  const creditedOwingRating = () =>
    dsp(1, "credited", {
      refund_tx: "tx_r",
      rating_tx: null,
      rating_confirmed: null,
    });

  it("keeps reading a refund that landed before its rating until the rating appears, then stops", async () => {
    const { result } = await mountWith(closedWith(creditedOwingRating()));
    expect(receiptOf(result.current.view)).toMatchObject({
      refund: { state: "confirmed" },
      rating: { state: "none" },
      ratingStalled: false,
    });

    fetchDisputes.mockResolvedValue(closedWith(creditedOwingRating()));
    for (let i = 0; i < 3; i += 1) await advance(CREDIT_POLL_MS);
    expect(fetchDisputes).toHaveBeenCalledTimes(4);

    const rated = nextRead();
    await advance(CREDIT_POLL_MS);
    await land(
      rated,
      closedWith(
        dsp(1, "credited", {
          refund_tx: "tx_r",
          rating_tx: "tx_rating",
          rating_confirmed: true,
        }),
      ),
    );
    expect(receiptOf(result.current.view).rating).toEqual({
      txHash: "tx_rating",
      state: "confirmed",
    });

    const spent = fetchDisputes.mock.calls.length;
    await advance(H);
    expect(fetchDisputes).toHaveBeenCalledTimes(spent);
  });

  /** Moves the clock a second at a time, so every answer that lands re-arms
   * the poll before the next timer is due — as it does in a browser. */
  async function walk(ms: number) {
    for (let t = 0; t < ms; t += S) await advance(S);
  }

  it("backs off, then stops reading for a rating that never lands, and says it stopped", async () => {
    const { result } = await mountWith(closedWith(creditedOwingRating()));
    fetchDisputes.mockResolvedValue(closedWith(creditedOwingRating()));

    // The fast wait: every 5 s.
    await walk(PENDING_FAST_WAIT_MS);
    const fast = fetchDisputes.mock.calls.length;
    expect(fast).toBe(1 + PENDING_FAST_WAIT_MS / CREDIT_POLL_MS);

    // Then every 30 s: a minute holds two reads, not twelve.
    await walk(M);
    expect(fetchDisputes.mock.calls.length - fast).toBe(2);
    expect(receiptOf(result.current.view).ratingStalled).toBe(false);

    // Past the whole wait nothing more is read, and the receipt says so.
    await walk(PENDING_WAIT_MS);
    const spent = fetchDisputes.mock.calls.length;
    expect(vi.getTimerCount()).toBe(0);
    expect(receiptOf(result.current.view).ratingStalled).toBe(true);
    await advance(H);
    expect(fetchDisputes).toHaveBeenCalledTimes(spent);
  });

  it("does not let a failing backend hold the rating's wait open for ever", async () => {
    const { result } = await mountWith(closedWith(creditedOwingRating()));
    fetchDisputes.mockRejectedValue(new Error("Failed to fetch"));

    await walk(PENDING_WAIT_MS + M);
    const spent = fetchDisputes.mock.calls.length;
    expect(receiptOf(result.current.view).ratingStalled).toBe(true);
    await advance(H);
    expect(fetchDisputes).toHaveBeenCalledTimes(spent);
  });

  it("never reads again for a credited receipt from a backend that cannot report its rating", async () => {
    const { rating_confirmed: _absent, ...legacy } = creditedOwingRating();
    await mountWith(closedWith(legacy));
    expect(vi.getTimerCount()).toBe(0);
    await advance(H);
    expect(fetchDisputes).toHaveBeenCalledTimes(1);
  });

  // The bound, through the hook. Walked one second at a time: a single large
  // advance fires at most one poll, because the next one is armed by an
  // effect after the act flush — it would "prove" a stop that never happened.
  it.each([
    ["credited with no transfer on record", () => dsp(1, "credited")],
    ["upheld, waiting on an operator", () => dsp(1, "upheld")],
    ["a transfer in flight", () => dsp(1, "crediting", { refund_tx: "tx_r" })],
  ])(
    "reads a receipt left on %s fast, then slow, then stops and says so",
    async (_, pending) => {
      const { result } = await mountWith(closedWith(pending()));
      fetchDisputes.mockResolvedValue(closedWith(pending()));

      await walk(PENDING_FAST_WAIT_MS);
      const fast = fetchDisputes.mock.calls.length;
      expect(fast).toBe(1 + PENDING_FAST_WAIT_MS / CREDIT_POLL_MS);

      await walk(M);
      expect(fetchDisputes.mock.calls.length - fast).toBe(2);
      expect(receiptOf(result.current.view).stoppedChecking).toBe(false);

      await walk(PENDING_WAIT_MS);
      const spent = fetchDisputes.mock.calls.length;
      expect(spent).toBeLessThan(60);
      expect(vi.getTimerCount()).toBe(0);
      expect(receiptOf(result.current.view).stoppedChecking).toBe(true);
      await walk(10 * M);
      expect(fetchDisputes).toHaveBeenCalledTimes(spent);
    },
  );

  it("reads an open dispute for half an hour, then stops and says so", async () => {
    const { result } = await mountWith(closedWith(dsp(1, "open")));
    fetchDisputes.mockResolvedValue(closedWith(dsp(1, "open")));

    await walk(DECISION_WAIT_MS - ADJUDICATION_POLL_MS);
    expect(receiptOf(result.current.view).stoppedChecking).toBe(false);
    await walk(2 * ADJUDICATION_POLL_MS);
    const spent = fetchDisputes.mock.calls.length;
    expect(spent).toBe(1 + DECISION_WAIT_MS / ADJUDICATION_POLL_MS);
    expect(receiptOf(result.current.view).stoppedChecking).toBe(true);
    await walk(10 * M);
    expect(fetchDisputes).toHaveBeenCalledTimes(spent);
  });

  it("restarts the wait each time the record moves", async () => {
    const { result } = await mountWith(closedWith(dsp(1, "upheld")));
    fetchDisputes.mockResolvedValue(closedWith(dsp(1, "upheld")));
    await walk(PENDING_WAIT_MS - M);

    // Fourteen minutes in, the transfer is sent: progress, and fast again.
    fetchDisputes.mockResolvedValue(
      closedWith(dsp(1, "crediting", { refund_tx: "tx_r" })),
    );
    // At most one slow interval until a read sees it.
    await walk(ADJUDICATION_POLL_MS);
    expect(receiptOf(result.current.view).status).toBe("crediting");
    const before = fetchDisputes.mock.calls.length;
    await walk(ADJUDICATION_POLL_MS);
    expect(fetchDisputes.mock.calls.length - before).toBe(
      ADJUDICATION_POLL_MS / CREDIT_POLL_MS,
    );

    // And its own wait runs from that change, not from the uphold.
    await walk(PENDING_WAIT_MS - M);
    expect(receiptOf(result.current.view).stoppedChecking).toBe(false);
    await walk(2 * M);
    expect(receiptOf(result.current.view).stoppedChecking).toBe(true);
  });

  it("never polls for another job's dispute, which the receipt does not show", async () => {
    await mountWith(
      closedWith(
        dsp(1, "crediting", { refund_tx: "tx_r", job_id_hex: JOB_B }),
        dsp(0, "open", { id: "dsp_b0", job_id_hex: JOB_B }),
      ),
    );
    expect(vi.getTimerCount()).toBe(0);
    await walk(M);
    expect(fetchDisputes).toHaveBeenCalledTimes(1);
  });

  it("keeps a live receipt when one re-read 404s, and goes on polling", async () => {
    // One Render redeploy blip mid-poll used to replace the held answer with
    // a settlement-less stub: the section rendered null, `error` was null so
    // nothing explained it, and the poll never re-armed — the whole receipt
    // gone, silently, while the buyer watched a credit land.
    const { result } = await mountWith(closedWith(dsp(1, "crediting")));
    const onScreen = result.current.view;

    fetchDisputes.mockRejectedValueOnce(
      new ApiError("GET /tasks/task_a/disputes → 404", 404),
    );
    await advance(CREDIT_POLL_MS);

    // Equal, not identical: a failed read still moves the clock the bounded
    // waits run on, so the view is recomputed — to the same receipt.
    expect(result.current.view).toEqual(onScreen);
    expect(result.current.error).toBe("GET /tasks/task_a/disputes → 404");

    const poll = nextRead();
    await advance(CREDIT_POLL_MS);
    expect(fetchDisputes).toHaveBeenCalledTimes(3);
    await land(poll, closedWith(dsp(1, "credited", { refund_tx: "tx_r" })));
    expect(result.current.error).toBeNull();
    expect(receiptOf(result.current.view).status).toBe("credited");
  });

  // A settlement never un-happens: a re-read without one is a lost RECORD —
  // an in-memory store that restarted, or an older backend behind the same
  // proxy — and must not become "nothing was charged".
  const LOST =
    "GET /tasks/task_a/disputes answered with no settlement on record — showing the receipt last read";

  it.each([
    ["settlement: null (a store that lost its records)", { settlement: null }],
    ["no settlement key (an older backend)", { settlement: undefined }],
  ])(
    "keeps a receipt with a dispute in flight when a poll answers %s, and goes on polling",
    async (_, over) => {
      const { result } = await mountWith(closedWith(dsp(1, "open")));
      const onScreen = result.current.view;

      const lost = { ...closedWith(), ...over };
      if (over.settlement === undefined) delete lost.settlement;
      fetchDisputes.mockResolvedValue(lost);
      await advance(ADJUDICATION_POLL_MS);
      expect(fetchDisputes).toHaveBeenCalledTimes(2);
      expect(result.current.view).toEqual(onScreen);
      expect(result.current.error).toBe(LOST);

      // Long past the settlement wait: still the receipt, never "nothing
      // was charged", and still reading at the receipt's cadence.
      for (let i = 0; i < 4; i += 1) await advance(ADJUDICATION_POLL_MS);
      expect(fetchDisputes).toHaveBeenCalledTimes(6);
      expect(result.current.view).toEqual(onScreen);
      expect(receiptOf(result.current.view).status).toBe("open");

      fetchDisputes.mockResolvedValue(
        closedWith(dsp(1, "credited", { refund_tx: "tx_r" })),
      );
      await advance(ADJUDICATION_POLL_MS);
      expect(result.current.error).toBeNull();
      expect(receiptOf(result.current.view).status).toBe("credited");
    },
  );

  it("keeps a settled receipt when a refresh answers without its settlement", async () => {
    const { result } = await mountWith(answer(H));
    const onScreen = result.current.view;

    fetchDisputes.mockResolvedValueOnce(answer(H, { settlement: null }));
    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.view).toEqual(onScreen);
    expect(result.current.error).toBe(LOST);
    // Nothing on this receipt changes on its own, so nothing polls it; the
    // error's retry is the way back.
    expect(vi.getTimerCount()).toBe(1);
  });

  it("does not loop on a grant the settlement-less answer dropped", async () => {
    rememberReadGrant("task_a", PAYER, {
      grant: "grant-token",
      expires_at: T0 / 1_000 + H / 1_000,
    });
    // Honoured on the first read; the answer that lost the settlement is
    // also the one that no longer honours the grant.
    const { result } = await mountWith(closedWith(dsp(1, "open")));
    expect(heldReadGrant("task_a", PAYER)).toBe("grant-token");

    fetchDisputes.mockResolvedValue({
      ...closedWith(dsp(1, "open", { reason: "", reason_withheld: true })),
      settlement: null,
    });
    await advance(ADJUDICATION_POLL_MS);
    await act(async () => {});
    expect(result.current.error).toBe(LOST);
    expect(heldReadGrant("task_a", PAYER)).toBeNull();
    expect(fetchDisputes).toHaveBeenCalledTimes(2);
  });

  it("keeps the receipt when the refresh after a submit 404s", async () => {
    // The buyer opens a dispute and the panel vanishes with no message: they
    // cannot tell whether it was recorded.
    const { result } = await mountWith(closedWith(dsp(1, "open")));
    const onScreen = result.current.view;

    fetchDisputes.mockRejectedValueOnce(
      new ApiError("GET /tasks/task_a/disputes → 404", 404),
    );
    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.view).toBe(onScreen);
    expect(result.current.error).toBe("GET /tasks/task_a/disputes → 404");
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

  it("reads a stopped receipt at once when the buyer comes back, and waits again", async () => {
    const { result } = await mountWith(closedWith(dsp(1, "upheld")));
    fetchDisputes.mockResolvedValue(closedWith(dsp(1, "upheld")));
    await stepThrough(PENDING_WAIT_MS + M);
    expect(receiptOf(result.current.view).stoppedChecking).toBe(true);
    const spent = fetchDisputes.mock.calls.length;

    setVisibility("hidden");
    await advance(H);
    setVisibility("visible");
    await act(async () => {});
    expect(fetchDisputes).toHaveBeenCalledTimes(spent + 1);
    expect(receiptOf(result.current.view).stoppedChecking).toBe(false);

    // And the fast cadence again, from the answer that return fetched.
    await stepThrough(CREDIT_POLL_MS);
    expect(fetchDisputes).toHaveBeenCalledTimes(spent + 2);
  });

  it("resumes the wait for a sealed run's settlement on return, on its own cadence", async () => {
    const { result } = await mountWith(answer(H, { settlement: null }));
    expect(result.current.view).toEqual({ kind: "not_settled", running: true });

    setVisibility("hidden");
    await advance(10 * S);
    expect(fetchDisputes).toHaveBeenCalledTimes(1);

    // Overdue by the time it is back: read at once, and the receipt with it.
    fetchDisputes.mockResolvedValueOnce(answer(H));
    setVisibility("visible");
    await act(async () => {});
    expect(fetchDisputes).toHaveBeenCalledTimes(2);
    expect(result.current.view.kind).toBe("settled");
  });

  it("stops the countdown in a hidden tab and catches it up on return", async () => {
    // The poll paused here and the tick did not: a backgrounded receipt woke
    // the page once a second, all night, to repaint a countdown nobody could
    // see.
    const { result } = await mountWith(answer(10 * M));
    const left = () => settledOf(result.current.view).window.remainingMs;
    expect(left()).toBe(10 * M);

    setVisibility("hidden");
    expect(vi.getTimerCount()).toBe(0);
    await advance(2 * M);
    expect(left()).toBe(10 * M);

    // Back, and right at once rather than a tick later.
    setVisibility("visible");
    expect(left()).toBe(8 * M);
    expect(vi.getTimerCount()).toBe(1);
    await advance(FINAL_HOUR_TICK_MS);
    expect(left()).toBe(8 * M - S);
  });

  it("arms no countdown for an answer that lands in a hidden tab", async () => {
    // A poll's answer re-renders, and a re-render re-arms: the countdown has
    // to refuse at the arming too, not only when the tab is hidden.
    const live = (leftMs: number, skewMs = 0) =>
      answer(leftMs, { skewMs, disputes: [dsp(1, "open")] });
    await mountWith(live(10 * M));
    const poll = nextRead();
    await advance(ADJUDICATION_POLL_MS);

    setVisibility("hidden");
    // Two seconds of a hidden tab, so the answer lands on a clock that has
    // moved: an answer that changed nothing would not re-arm anything, and
    // would prove nothing either.
    await advance(2 * S);
    await land(poll, live(10 * M - 32 * S, 32 * S));

    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not skip the countdown forward on a glance away", async () => {
    const { result } = await mountWith(answer(10 * M));
    const left = () => settledOf(result.current.view).window.remainingMs;

    for (let i = 0; i < 6; i += 1) {
      setVisibility("hidden");
      setVisibility("visible");
    }

    expect(left()).toBe(10 * M);
  });

  it("does not re-read on every return to the tab", async () => {
    await mountWith(closedWith(dsp(1, "open")));

    // Six hide/show cycles in 60 ms. Unthrottled that is seven reads against
    // a documented thirty-second cadence: enough to trip the rate limiter on
    // a free-tier backend and banner "receipt unavailable" over a receipt
    // that was perfectly good.
    for (let i = 0; i < 6; i += 1) {
      setVisibility("hidden");
      await advance(5);
      setVisibility("visible");
      await advance(5);
    }

    expect(fetchDisputes).toHaveBeenCalledTimes(1);
  });

  it("waits out the rest of the cadence on return, not a whole new interval", async () => {
    await mountWith(closedWith(dsp(1, "open")));
    await advance(20 * S);

    setVisibility("hidden");
    await advance(5 * S);
    setVisibility("visible");
    expect(fetchDisputes).toHaveBeenCalledTimes(1);

    // Twenty-five seconds of the thirty are spent, so five are left — not
    // thirty, which would punish the buyer for having looked away.
    nextRead();
    await advance(5 * S - 1);
    expect(fetchDisputes).toHaveBeenCalledTimes(1);
    await advance(1);
    expect(fetchDisputes).toHaveBeenCalledTimes(2);
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

describe("useDisputePanel — the contract the dialog reads", () => {
  it("exposes the measured server clock offset, and 0 before any answer", async () => {
    const d = nextRead();
    const { result } = mount();
    expect(result.current.offsetMs).toBe(0);

    await land(d, answer(H, { skewMs: 90 * S }));
    expect(result.current.offsetMs).toBe(90 * S);
  });

  it("folds an adopted dispute into the view at once, without a read", async () => {
    const { result } = await mountWith(answer(H));
    expect(stateKinds(result.current.view)).toEqual([
      "disputable",
      "disputable",
    ]);

    act(() => result.current.adopt(dsp(1, "open")));
    expect(stateKinds(result.current.view)).toEqual(["disputable", "disputed"]);
    expect(fetchDisputes).toHaveBeenCalledTimes(1);
  });

  it("keeps an adopted dispute through a re-read that fails (D-057)", async () => {
    const { result } = await mountWith(answer(H));
    act(() => result.current.adopt(dsp(1, "open")));

    fetchDisputes.mockRejectedValueOnce(
      new ApiError("GET /tasks/task_a/disputes → 503", 503),
    );
    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.error).toBe("GET /tasks/task_a/disputes → 503");
    expect(stateKinds(result.current.view)).toEqual(["disputable", "disputed"]);
  });

  it("keeps an adopted dispute through an answer asked for before it existed", async () => {
    const { result } = await mountWith(answer(H));
    const older = nextRead();
    let pending: Promise<void> = Promise.resolve();
    act(() => {
      pending = result.current.refresh();
    });

    act(() => result.current.adopt(dsp(1, "open")));
    await land(older, answer(H));
    await act(async () => {
      await pending;
    });
    expect(stateKinds(result.current.view)).toEqual(["disputable", "disputed"]);
  });

  it("lets a read that lists the dispute speak for it from then on", async () => {
    const { result } = await mountWith(answer(H));
    act(() => result.current.adopt(dsp(1, "open")));

    fetchDisputes.mockResolvedValueOnce(
      answer(H, { disputes: [dsp(1, "upheld")] }),
    );
    await act(async () => {
      await result.current.refresh();
    });
    expect(receiptOf(result.current.view).status).toBe("upheld");

    // Listed once, it is no longer held: the record is the read's to state.
    fetchDisputes.mockResolvedValueOnce(answer(H));
    await act(async () => {
      await result.current.refresh();
    });
    expect(stateKinds(result.current.view)).toEqual([
      "disputable",
      "disputable",
    ]);
  });

  it("holds a dispute adopted before the first answer until that answer lands", async () => {
    const first = nextRead();
    const { result } = mount();

    act(() => result.current.adopt(dsp(1, "open")));
    expect(result.current.loading).toBe(true);
    await land(first, answer(H));
    expect(stateKinds(result.current.view)).toEqual(["disputable", "disputed"]);
  });

  it("ignores a dispute of another task", async () => {
    const { result } = await mountWith(answer(H));

    act(() => result.current.adopt(dsp(1, "open", { task_id: "task_b" })));
    expect(stateKinds(result.current.view)).toEqual([
      "disputable",
      "disputable",
    ]);
  });

  it("adopts nothing in demo mode", async () => {
    const { result } = mount({ demo: true });

    act(() => result.current.adopt(dsp(1, "open")));
    expect(result.current.view).toEqual({ kind: "hidden" });
    expect(fetchDisputes).not.toHaveBeenCalled();
  });
});

describe("useDisputePanel — what it must never do, and whose answer wins", () => {
  const E503 = () => new ApiError("GET /tasks/task_a/disputes → 503", 503);
  const crediting = () =>
    closedWith(dsp(1, "crediting", { refund_tx: "tx_r" }));

  it("polls, presents a grant, and drops it when dishonoured, without once asking the wallet to sign", async () => {
    rememberReadGrant("task_a", PAYER, {
      grant: "grant-token",
      expires_at: (T0 + H) / 1_000,
    });
    const withheld = () =>
      closedWith(
        dsp(1, "crediting", {
          refund_tx: "tx_r",
          reason: "",
          reason_withheld: true,
        }),
      );
    await mountWith(withheld());
    fetchDisputes.mockResolvedValue(withheld());

    for (let i = 0; i < 5; i += 1) await advance(CREDIT_POLL_MS);
    expect(fetchDisputes).toHaveBeenCalledTimes(6);
    expect(fetchDisputes.mock.calls[0]).toEqual(["task_a", "grant-token"]);
    expect(heldReadGrant("task_a", PAYER)).toBeNull();
    // Named here as well as after every test: this is the test about it.
    expect(wallet.signMessage).not.toHaveBeenCalled();
  });

  it("lets the newer of two reads of one task win when they land out of order", async () => {
    const { result } = await mountWith(closedWith(dsp(1, "open")));
    const older = nextRead();
    const newer = nextRead();
    let first: Promise<void> = Promise.resolve();
    let second: Promise<void> = Promise.resolve();
    act(() => {
      first = result.current.refresh();
    });
    act(() => {
      second = result.current.refresh();
    });

    await land(newer, closedWith(dsp(1, "credited", { refund_tx: "tx_r" })));
    await land(older, closedWith(dsp(1, "open")));
    await act(async () => {
      await first;
      await second;
    });
    expect(receiptOf(result.current.view).status).toBe("credited");
  });

  it("keeps the error that dates the view on screen while the next read is out", async () => {
    const { result } = await mountWith(closedWith(dsp(1, "open")));
    fetchDisputes.mockRejectedValueOnce(E503());
    await advance(ADJUDICATION_POLL_MS);
    expect(result.current.error).toBe("GET /tasks/task_a/disputes → 503");

    nextRead();
    act(() => {
      void result.current.refresh();
    });
    expect(result.current.error).toBe("GET /tasks/task_a/disputes → 503");
    expect(result.current.view.kind).toBe("settled");
  });

  it("does not let an older read landing late clear the flag the newer one holds", async () => {
    const { result } = await mountWith(crediting());
    const older = nextRead();
    const newer = nextRead();
    act(() => {
      void result.current.refresh();
    });
    act(() => {
      void result.current.refresh();
    });
    expect(fetchDisputes).toHaveBeenCalledTimes(3);

    await land(older, crediting());
    // The newer read is still out: a poll falling due now must be skipped.
    fetchDisputes.mockResolvedValue(crediting());
    await advance(CREDIT_POLL_MS);
    expect(fetchDisputes).toHaveBeenCalledTimes(3);

    await land(newer, crediting());
    await advance(CREDIT_POLL_MS);
    expect(fetchDisputes).toHaveBeenCalledTimes(4);
  });

  it("does not carry a seal recorded against one task's read into the next task's answer", async () => {
    const first = deferred<TaskDisputes>();
    fetchDisputes.mockReturnValueOnce(first.promise);
    const { result, rerender } = mount({ workflowDone: false });
    // The seal lands while task A's read is out, and is recorded against it.
    rerender({ ...DEFAULTS, workflowDone: true });

    const b = nextRead();
    rerender({ taskId: "task_b", workflowDone: false, demo: false });
    await land(b, { ...answer(H, { settlement: null }), task_id: "task_b" });
    expect(result.current.view).toEqual({ kind: "not_settled", running: true });

    // Task B is still running, so nothing asks for its settlement yet.
    fetchDisputes.mockResolvedValue({
      ...answer(H, { settlement: null }),
      task_id: "task_b",
    });
    for (let i = 0; i < 3; i += 1) await advance(SETTLEMENT_POLL_MS);
    expect(fetchDisputes).toHaveBeenCalledTimes(2);
  });

  it("drops an answer that lands while the page has no task, and loads afresh when it returns", async () => {
    const first = deferred<TaskDisputes>();
    fetchDisputes.mockReturnValueOnce(first.promise);
    const { result, rerender } = mount();
    rerender({ ...DEFAULTS, demo: true });
    await land(first, answer(H, { disputes: [dsp(1, "open")] }));
    expect(result.current.view).toEqual({ kind: "hidden" });

    const again = nextRead();
    rerender(DEFAULTS);
    expect(result.current.loading).toBe(true);
    expect(result.current.view).toEqual({ kind: "hidden" });

    await land(again, answer(H));
    expect(stateKinds(result.current.view)).toEqual([
      "disputable",
      "disputable",
    ]);
  });

  it("shows only the task it was asked for when the task changes mid-read", async () => {
    const a = nextRead();
    const { result, rerender } = mount();
    const b = nextRead();
    rerender({ ...DEFAULTS, taskId: "task_b" });

    await land(a, answer(H, { disputes: [dsp(1, "open")] }));
    expect(result.current.loading).toBe(true);

    await land(b, {
      ...answer(H, { job: JOB_B }),
      task_id: "task_b",
    });
    expect(settledOf(result.current.view).jobIdHex).toBe(JOB_B);
  });
});
