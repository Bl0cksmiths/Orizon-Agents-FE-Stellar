"use client";
/**
 * The receipt panel's data (story 4.05): the task's settlement and disputes,
 * the server's clock, the connected wallet, and a tick that keeps the window
 * honest — folded into the one `DisputePanelView` the panel draws.
 *
 * Call it from the PANEL, not from the trace page. The tick is this hook's own
 * state, so it re-renders whichever component calls it once a second in the
 * window's final hour; called from the panel, that is the panel alone, and the
 * trace page with its streaming log never repaints for a countdown.
 *
 *   const { view, loading, error, refresh } = useDisputePanel(taskId, {
 *     workflowDone: done,
 *     demo: !taskId,
 *   });
 *
 * - `loading` is true only while nothing has been answered for this task yet;
 *   a refresh keeps the current view on screen rather than flashing a
 *   skeleton. `loading` and `error` are never both set, and neither is ever
 *   expressed as "not settled" — that view means the backend said so.
 * - `error` alongside a settled view means the last refresh failed and what is
 *   on screen may be stale.
 * - `refresh()` refetches and resolves once the answer is on screen. It never
 *   rejects: a failure lands in `error`. The page calls it after a submit and
 *   on `duplicate_dispute`, whose original dispute must be re-read because
 *   the error carries no body.
 * - While a dispute is unresolved the hook re-reads on its own (story 4.06,
 *   see `disputePollMs`), on the same terms as `refresh()`: the view stays up,
 *   and a failure lands in `error`.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ApiError } from "./api";
import {
  disputeView,
  getTaskDisputes,
  receiptAwaitsChain,
  serverClockOffsetMs,
} from "./disputes";
import type { DisputePanelView, TaskDisputes } from "./types";
import { toMessage } from "./use-async-action";
import { useWallet } from "./wallet";

const HOUR_MS = 3_600_000;
/** Cadence in the final hour, where the countdown shows seconds. */
export const FINAL_HOUR_TICK_MS = 1_000;
/** Cadence before that, where it shows minutes at best. */
export const COARSE_TICK_MS = 30_000;

/**
 * How long until the panel next needs the clock, or null for "never": there is
 * no timer at all while the panel is hidden, not settled, or closed, since
 * nothing on it can change with time.
 *
 * In the final hour the delay is capped by what is left, so the last tick
 * lands ON the close — every action disappears the moment the server stops
 * taking them, not up to a second later. Rounded up to a whole millisecond,
 * because a timer shorter than that may fire before the clock has moved.
 */
export function disputeTickMs(view: DisputePanelView): number | null {
  if (view.kind !== "settled" || !view.window.open) return null;
  const leftMs = view.window.remainingMs;
  if (leftMs >= HOUR_MS) return COARSE_TICK_MS;
  return Math.ceil(Math.min(FINAL_HOUR_TICK_MS, leftMs));
}

/** Re-read cadence while every unresolved dispute awaits the platform's
 * decision — adjudication takes hours, so a faster poll would only add load. */
export const ADJUDICATION_POLL_MS = 30_000;
/** Re-read cadence while any credit is decided or in flight — a transfer lands
 * in seconds, and the buyer is watching for it. */
export const CREDIT_POLL_MS = 5_000;

/** Cadence while the settlement a sealed run should have has not appeared. */
export const SETTLEMENT_POLL_MS = 3_000;
/**
 * How long a sealed run's settlement is waited for before the panel says
 * nothing was charged.
 *
 * Long enough for a row committed just after the seal, and for the backend's
 * own retry of a charge whose first attempt timed out; short enough that a
 * workflow that really charged nothing is not left reading "still running"
 * while the buyer waits for a receipt.
 */
export const SETTLEMENT_WAIT_MS = 30_000;

/** What the poll is decided on: the last answer, whether the run had sealed
 * when it was asked for, and how long a settlement has been waited for. */
export type DisputePollState = {
  res: TaskDisputes;
  doneAtRequest: boolean;
  /** Local ms since the panel first went looking for the settlement. */
  awaitedMs: number;
};

/**
 * How long until the receipt should be re-read, or null for "never" (story
 * 4.06). Between raising a dispute and its credit landing, nothing the buyer
 * does would fetch again, so without this the receipt would sit on the state
 * it was raised in while the dispute moved underneath it.
 *
 * Only an unresolved dispute can change on its own, so only one keeps a poll
 * alive: `CREDIT_POLL_MS` while any receipt is still waiting on the chain,
 * else `ADJUDICATION_POLL_MS` while any dispute is `open`. A task whose
 * receipts have all settled — or that has no dispute at all — is not polled.
 *
 * Judged on `receiptAwaitsChain`, not on the raw status: a `credited` record
 * with no transfer on it is one the receipt itself draws as pending, and
 * treating the status as final left exactly those receipts unable to resolve
 * without a reload.
 *
 * A SEALED run with no settlement is the one other case that must be asked
 * again, for `SETTLEMENT_WAIT_MS` at `SETTLEMENT_POLL_MS`. The settlement is
 * written after the trace seals, and `workflowDone` is that seal: a row
 * committed even 100 ms later answered this read `settlement: null`, and
 * nothing ever asked again — the fetch effect's deps do not change, no
 * cadence covered an unsettled answer, and the panel stated as fact that the
 * buyer's paid workflow had charged nothing, with no `error` to draw a retry
 * beside it. The twenty-four-hour window then expired in silence.
 *
 * An answer with no settlement KEY is a backend that predates receipts: the
 * panel hides, and there is nothing to wait for. Nor is anything asked while
 * the run is still going — the seal will fetch on its own.
 */
export function disputePollMs(state: DisputePollState | null): number | null {
  if (state === null) return null;
  const { res } = state;
  if (res.settlement === undefined) return null;
  if (res.settlement === null) {
    if (!state.doneAtRequest) return null;
    return state.awaitedMs < SETTLEMENT_WAIT_MS ? SETTLEMENT_POLL_MS : null;
  }
  let ms: number | null = null;
  for (const dispute of res.disputes) {
    if (receiptAwaitsChain(dispute)) return CREDIT_POLL_MS;
    if (dispute.status === "open") ms = ADJUDICATION_POLL_MS;
  }
  return ms;
}

/**
 * What a backend without this route answers with, restated as the old
 * backend it is: no `settlement` key, so the panel hides.
 *
 * A 404 on this read never means "no such task" — the route answers an
 * unknown task with an empty window. It means the route itself is missing (a
 * backend older than story 4.02), or task-read enforcement is on and this
 * session holds no token for a trace it was sent. Neither is something the
 * viewer can act on, and neither may banner an error across every trace.
 *
 * Only ever used for a FIRST read of a task. A route that answered once
 * exists, so a later 404 is a blip — a redeploy, a proxy — not a backend
 * that predates receipts, and standing in this stub for a receipt already on
 * screen would erase it: the view would go `hidden`, `error` would be null so
 * nothing explained it, and the poll would never re-arm, because a stub with
 * no settlement is not polled.
 */
function noReceiptRoute(taskId: string): TaskDisputes {
  return { task_id: taskId, window_closes_at: null, disputes: [] };
}

type Snapshot = {
  res: TaskDisputes;
  /** Server clock minus local clock, measured when `res` was asked for. */
  offsetMs: number;
  /** Whether the run had finished when this answer was asked for. */
  doneAtRequest: boolean;
  /**
   * The local clock when the panel FIRST went looking for a settlement the
   * seal says should exist, carried across the re-reads that look for it;
   * null when it is not waiting for one. The bound is on the whole wait, not
   * on each answer inside it.
   */
  awaitingSinceMs: number | null;
};

type FetchState = {
  /** The task everything below describes; a mismatch means "nothing yet". */
  taskId: string | null;
  snapshot: Snapshot | null;
  error: string | null;
};

const IDLE: FetchState = { taskId: null, snapshot: null, error: null };

export type UseDisputePanelResult = {
  view: DisputePanelView;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

export function useDisputePanel(
  taskId: string | null,
  opts: { workflowDone: boolean; demo: boolean },
): UseDisputePanelResult {
  const { workflowDone, demo } = opts;
  const { address } = useWallet();
  // Demo mode replays a canned trace: there is nothing to fetch, ever.
  const target = demo ? null : taskId;

  const [state, setState] = useState<FetchState>(IDLE);
  // The local clock as of the last tick or arrival; the server's is this plus
  // the snapshot's offset.
  const [clockMs, setClockMs] = useState(() => Date.now());

  // Read by callbacks that must not re-subscribe on every render. Synced in an
  // effect, not during render, and declared before the effects that read them.
  const targetRef = useRef(target);
  const doneRef = useRef(workflowDone);
  const stateRef = useRef(state);
  useEffect(() => {
    targetRef.current = target;
    doneRef.current = workflowDone;
    stateRef.current = state;
  });

  // The latest request wins: an older one settling later — for this task or
  // the one before it — is dropped, as is anything landing after unmount.
  const epochRef = useRef(0);
  // Whether the latest read is still on its way. A poll that falls due
  // meanwhile is skipped rather than sent: the answer coming is at least as
  // fresh as the one it would ask for, and a second read would supersede it —
  // turning a `refresh()` into one that resolves before its answer is shown.
  const inFlightRef = useRef(false);
  // When the last read was ASKED FOR — what a rate limiter counts, and what
  // the poll's cadence is measured from when a hidden tab comes back.
  const lastReadAtMs = useRef(0);
  // Whether the run sealed while the read now in flight was out. That read
  // was asked for before the seal, but its answer arrives after it, and the
  // seal is what makes an empty settlement worth waiting on rather than one
  // to declare — so the answer inherits it instead of the seal costing a
  // second request.
  const sealedInFlightRef = useRef(false);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const load = useCallback(
    async (id: string, doneAtRequest: boolean): Promise<void> => {
      const epoch = ++epochRef.current;
      lastReadAtMs.current = Date.now();
      sealedInFlightRef.current = false;
      // Whether this task already has an answer on screen, read before the
      // state below is touched: it decides what a 404 means (see
      // `noReceiptRoute`).
      const held = stateRef.current;
      const firstRead = held.taskId !== id || held.snapshot === null;
      inFlightRef.current = true;
      const isLatest = () =>
        mountedRef.current &&
        epochRef.current === epoch &&
        targetRef.current === id;
      // With nothing on screen, a new attempt is loading again rather than
      // failing again: the old error goes, so the two never show together.
      // With a view on screen, it stays — and so does any error that dates it.
      setState((s) =>
        s.taskId !== id
          ? { taskId: id, snapshot: null, error: null }
          : s.snapshot === null
            ? { ...s, error: null }
            : s,
      );
      // Taken before the request leaves: the offset is measured against it,
      // so a slow exchange can only ever understate the window.
      const sentAtMs = Date.now();
      let res: TaskDisputes;
      try {
        res = await getTaskDisputes(id);
      } catch (err) {
        if (!isLatest()) return;
        if (err instanceof ApiError && err.status === 404 && firstRead) {
          res = noReceiptRoute(id);
        } else {
          // Whatever is on screen stays: it is this task's (the epoch says no
          // other load has started since), and the error dates it.
          const error = toMessage(err);
          setState((s) => ({ ...s, error }));
          // While the panel is waiting for a settlement, time passed whether
          // or not the answer came: that wait is bounded on this clock, and a
          // backend failing every read must not hold it open for ever. The
          // clock is left alone otherwise, so a failed poll of a settled
          // receipt leaves the view it dates untouched, object and all.
          if ((stateRef.current.snapshot?.awaitingSinceMs ?? null) !== null) {
            setClockMs((prev) => Math.max(prev, Date.now()));
          }
          return;
        }
      } finally {
        // Only the latest read speaks for the flag: an older one settling
        // late must not clear it while a newer one is still out.
        if (epochRef.current === epoch) inFlightRef.current = false;
      }
      // Measured before anything else runs: the clock restarts here, and it
      // is only as good as the moment it is taken.
      const receivedAtMs = Date.now();
      if (!isLatest()) return;
      const sealed = doneAtRequest || sealedInFlightRef.current;
      setState((s) => {
        const held = s.taskId === id ? s.snapshot : null;
        // A sealed run whose settlement has not appeared: the wait starts at
        // the first such answer and is carried by every one after it, so a
        // run of re-reads cannot extend its own deadline.
        const awaiting = sealed && res.settlement === null;
        return {
          taskId: id,
          snapshot: {
            res,
            offsetMs: serverClockOffsetMs(res, sentAtMs),
            doneAtRequest: sealed,
            awaitingSinceMs: awaiting
              ? (held?.awaitingSinceMs ?? receivedAtMs)
              : null,
          },
          error: null,
        };
      });
      // The clock restarts at the arrival the offset was measured against,
      // so the first view of a fresh answer is judged on the right time even
      // if the request sat on a cold backend for a minute.
      setClockMs(receivedAtMs);
    },
    [],
  );

  // Fetches on every new task, and again when the run finishes — that is when
  // the settlement appears, and nothing else would ask for it.
  const lastTargetRef = useRef<string | null>(null);
  useEffect(() => {
    const retargeted = lastTargetRef.current !== target;
    lastTargetRef.current = target;
    if (target === null) return;
    // A settlement never un-happens, so once one is held for this task the
    // run finishing has nothing to add. Anything else — an unsettled answer,
    // a failure — is worth asking again.
    const held = stateRef.current;
    const settled = held.taskId === target && held.snapshot?.res.settlement;
    if (!retargeted && settled) return;
    // A read for this task is already out, and it is the slowest one there
    // is — the cold first visit that waits a minute. Its answer is at least
    // as fresh as anything asked for now, so the seal is recorded against it
    // rather than spent on a second request that supersedes the first.
    if (!retargeted && inFlightRef.current) {
      sealedInFlightRef.current = workflowDone;
      return;
    }
    void load(target, workflowDone);
  }, [target, workflowDone, load]);

  const refresh = useCallback(async (): Promise<void> => {
    const id = targetRef.current;
    if (id === null) return;
    await load(id, doneRef.current);
  }, [load]);

  const current = target !== null && state.taskId === target ? state : null;
  const snapshot = current?.snapshot ?? null;
  const loading = target !== null && snapshot === null && !current?.error;
  const error = current?.error ?? null;

  // How long a settlement the seal says should exist has been looked for, and
  // whether the panel is still looking. Both are 0/false unless it is waiting.
  const awaitingSinceMs = snapshot?.awaitingSinceMs ?? null;
  const awaitedMs =
    awaitingSinceMs === null ? 0 : Math.max(0, clockMs - awaitingSinceMs);
  const stillLooking =
    awaitingSinceMs !== null && awaitedMs < SETTLEMENT_WAIT_MS;

  const view = useMemo(
    () =>
      disputeView({
        res: snapshot?.res ?? null,
        viewerAddress: address,
        // An answer asked for while the run was still going cannot say that
        // nothing was charged — the settlement may be the next thing written.
        // Until the refetch the finish triggers lands, it still reads as
        // running, so "nothing was charged" never flashes up in between. Nor
        // may it be said while the panel is still asking for the settlement:
        // that sentence closes the buyer's only route to a refund, and it is
        // said once the wait is spent or not at all.
        workflowDone:
          workflowDone && (snapshot?.doneAtRequest ?? false) && !stillLooking,
        nowMs: clockMs + (snapshot?.offsetMs ?? 0),
        demo,
      }),
    [snapshot, address, workflowDone, stillLooking, clockMs, demo],
  );

  // `clockMs` is a dependency only to re-arm: each tick moves the clock, and
  // the clock moving schedules the next tick.
  //
  // Paused while the tab is hidden, for the poll's reason: in the final hour
  // this fires every second, and a backgrounded receipt woke the page all
  // night to repaint a countdown nobody could see. Coming back re-reads the
  // clock at once rather than a tick later, so the number is never stale on
  // the frame the buyer sees it.
  const tickMs = disputeTickMs(view);
  useEffect(() => {
    if (tickMs === null) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const hidden = () => document.visibilityState === "hidden";
    const tick = () => {
      timer = undefined;
      // Never behind the scheduled moment, even if the timer fires a hair
      // early: an unchanged clock would not re-render, and the countdown
      // would stall one tick short of the close.
      setClockMs((prev) => Math.max(Date.now(), prev + tickMs));
    };
    const arm = () => {
      if (!hidden() && timer === undefined) timer = setTimeout(tick, tickMs);
    };
    const onVisibilityChange = () => {
      if (hidden()) {
        clearTimeout(timer);
        timer = undefined;
        return;
      }
      // The clock as it really is, never a tick added: a glance away and
      // back is not a second gone, and six of them are not six.
      setClockMs((prev) => Math.max(Date.now(), prev));
      arm();
    };
    arm();
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [tickMs, clockMs]);

  // The live receipt (story 4.06): re-read on `disputePollMs`'s cadence while
  // a dispute is unresolved, so the buyer watches it move instead of sitting
  // on the state it was raised in.
  //
  // Separate from the tick on purpose. The window can close while a dispute
  // is still open, so neither timer may depend on the other; and a poll is an
  // ordinary `load`, so it re-measures the server's clock from its own fresh
  // answer — and only from that: a failed or superseded poll leaves the offset
  // and the view exactly as they were, and surfaces its error the way
  // `refresh()` does. It never shows `loading` either, because a poll only
  // runs with a view on screen, which `load` keeps.
  //
  // `state` is a dependency only to re-arm: each answer that lands — a
  // poll's, a refresh's, a failure — schedules the next poll a full interval
  // after it, so a refresh is never followed by a redundant read.
  //
  // Paused while the tab is hidden: nobody is watching, and a background tab
  // left on a receipt should not poll the backend for hours. Coming back is
  // the moment the view is most likely stale, so it re-reads as soon as the
  // cadence allows and resumes from that answer — but no sooner. The cadence
  // runs whether the tab was hidden or not, because a return that always read
  // at once made every alt-tab a request: six cycles in sixty milliseconds
  // were seven reads against a thirty-second cadence, which is how a perfectly
  // good receipt ends up under a rate-limited banner. A return inside the
  // interval arms what is left of it instead.
  const pollMs = disputePollMs(
    snapshot === null
      ? null
      : {
          res: snapshot.res,
          doneAtRequest: snapshot.doneAtRequest,
          awaitedMs,
        },
  );
  useEffect(() => {
    if (target === null || pollMs === null) return;
    const id = target;
    // Undefined while paused, and between a poll firing and its answer
    // landing — which re-runs this effect and arms the next one.
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = () => {
      timer = undefined;
      if (!inFlightRef.current) void load(id, doneRef.current);
    };
    const hidden = () => document.visibilityState === "hidden";
    /** What is left of the cadence since the last read, never negative. */
    const dueInMs = () =>
      Math.max(0, pollMs - (Date.now() - lastReadAtMs.current));
    const onVisibilityChange = () => {
      if (hidden()) {
        clearTimeout(timer);
        timer = undefined;
      } else if (timer === undefined) {
        const leftMs = dueInMs();
        if (leftMs === 0) poll();
        else timer = setTimeout(poll, leftMs);
      }
    };
    if (!hidden()) timer = setTimeout(poll, pollMs);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [target, pollMs, state, load]);

  return { view, loading, error, refresh };
}
