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
 *   on `duplicate_dispute`.
 * - `adopt(dispute)` folds a dispute the server itself returned — the one a
 *   submit resolved to, or the original a `duplicate_dispute` refusal
 *   carries — into the view at once, without a read. It holds until a read
 *   lists that dispute: an answer that was already on its way, or a re-read
 *   that fails, can no longer show its step as disputable again.
 * - `offsetMs` is the server's clock minus this browser's, as last measured,
 *   for `raiseDispute`: the window and the nonce are judged on the server's
 *   clock. 0 until an answer carrying the server's clock has landed.
 * - While a dispute is unresolved the hook re-reads on its own (story 4.06,
 *   see `disputePollMs`), on the same terms as `refresh()`: the view stays up,
 *   and a failure lands in `error`.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ApiError } from "./api";
import {
  forgetReadGrant,
  heldReadGrant,
  noteServerClockOffset,
} from "./dispute-read-grant";
import {
  disputeView,
  getTaskDisputes,
  ratingStillComing,
  receiptAwaitsChain,
  receiptStillMoving,
  serverClockOffsetMs,
} from "./disputes";
import type { Dispute, DisputePanelView, TaskDisputes } from "./types";
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

/**
 * How long a receipt waiting on a transfer or a rating is read for at
 * `CREDIT_POLL_MS`, from the first answer that showed it waiting so — the
 * clock restarts whenever the record moves (see `pendingKey`).
 *
 * Both are written by the uphold, one straight after the other, and each is
 * a Soroban submit whose worst case on the backend is two 15 s posts and a
 * 30 s confirmation poll: about a minute before it is recorded or given up
 * on (D-069). Ninety seconds covers that with room for the read that noticed.
 */
export const PENDING_FAST_WAIT_MS = 90_000;
/**
 * How long, in all, a receipt waiting on a transfer or a rating is read for
 * before the panel stops and says so. Past the minute above, nothing is in
 * flight any more: a refund `upheld` but not sent, or `credited` with no
 * transfer to show, waits on an operator, and so does a rating that failed
 * without a hash. Fifteen minutes at `ADJUDICATION_POLL_MS` covers one acting
 * on the script's own "uphold again" line, for about thirty reads. Beyond
 * that the wait is open-ended — a record the operator must reconcile by hand
 * can sit for days — and a receipt left open must not read it for ever: the
 * probe that found this counted 1,400 reads in two hours.
 */
export const PENDING_WAIT_MS = 15 * 60_000;
/**
 * How long an `open` dispute is read for, at `ADJUDICATION_POLL_MS`, before
 * the panel stops and says so. Adjudication is a person and takes hours; a
 * tab left open on the receipt overnight read it every thirty seconds, some
 * thousand reads for one decision. Half an hour follows a buyer who stays to
 * watch; after that the receipt says it stopped checking and how to look.
 */
export const DECISION_WAIT_MS = 30 * 60_000;

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
  /**
   * Local ms since the receipt was last seen to move while something on it
   * was still moving (`pendingKey`); 0 when nothing is.
   */
  pendingAwaitedMs?: number;
};

/**
 * This job's disputes. The read answers with every dispute the TASK has, and
 * a task that ran twice holds another job's too: the view already draws only
 * this job's, and the poll must not read on for a dispute it never shows.
 */
function jobDisputes(res: TaskDisputes): Dispute[] {
  const settlement = res.settlement;
  if (!settlement) return [];
  return res.disputes.filter((d) => d.job_id_hex === settlement.job_id_hex);
}

/**
 * Everything on this receipt that can still change on its own, as one string
 * two answers can be compared by — "" when nothing can.
 *
 * The bounded waits are measured from the last time this CHANGED, not from
 * the first sight of a pending state: a dispute that goes open → upheld →
 * crediting → credited is progress at every step, and each step earns the
 * fast cadence again. It is a record that stays put that runs its wait out.
 */
export function pendingKey(res: TaskDisputes): string {
  const keys = jobDisputes(res)
    .filter(receiptStillMoving)
    .map((d) =>
      [
        d.id,
        d.status,
        d.refund_tx,
        d.refund_confirmed,
        d.rating_tx,
        d.rating_confirmed,
      ].join("|"),
    );
  // An unconfirmed escrow v2 settlement may still land, and nothing the
  // buyer does would fetch again when it does. It waits on the chain like a
  // refund does, record or no record, and is bounded the same way.
  if (res.settlement_state === "unconfirmed")
    keys.push("settlement:unconfirmed");
  // A seal the backend is still confirming: the run went final before it
  // (for up to ~2 minutes), and its outcome lands on this receipt.
  if (res.seal === "pending") keys.push("seal:pending");
  return keys.sort().join(",");
}

/**
 * How long until the receipt should be re-read, or null for "never" (story
 * 4.06). Between raising a dispute and its credit landing, nothing the buyer
 * does would fetch again, so without this the receipt would sit on the state
 * it was raised in while the dispute moved underneath it.
 *
 * Only a dispute of THIS job that can still change on its own
 * (`receiptStillMoving`) keeps a poll alive, and every wait is bounded, the
 * way D-069 first bounded the rating's — fast, then slow, then not at all —
 * on `pendingAwaitedMs`, the time since the receipt last moved:
 *
 * - waiting on a transfer or a rating (`receiptAwaitsChain`,
 *   `ratingStillComing`): `CREDIT_POLL_MS` for `PENDING_FAST_WAIT_MS`, then
 *   `ADJUDICATION_POLL_MS` until `PENDING_WAIT_MS`.
 * - waiting on a decision (`open`): `ADJUDICATION_POLL_MS` until
 *   `DECISION_WAIT_MS`.
 *
 * Nothing in either is sure to come — `upheld` and `credited` without a
 * transfer wait on an operator, and one that must reconcile by hand can take
 * days — so a receipt left open stops reading, and says so, rather than
 * reading every five seconds for the life of the tab. A task whose receipts
 * have all settled, or that has no dispute, is not polled at all.
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
  const waitedMs = state.pendingAwaitedMs ?? 0;
  // An unconfirmed settlement is re-read on the chain-wait cadence: fast,
  // then slow, then not at all — and the receipt then says it stopped.
  let ms: number | null = null;
  if (
    (res.settlement_state === "unconfirmed" || res.seal === "pending") &&
    state.doneAtRequest
  ) {
    if (waitedMs < PENDING_FAST_WAIT_MS) return CREDIT_POLL_MS;
    if (waitedMs < PENDING_WAIT_MS) ms = ADJUDICATION_POLL_MS;
  }
  if (res.settlement === null) {
    if (!state.doneAtRequest) return null;
    return state.awaitedMs < SETTLEMENT_WAIT_MS ? SETTLEMENT_POLL_MS : ms;
  }
  for (const dispute of jobDisputes(res)) {
    if (receiptAwaitsChain(dispute) || ratingStillComing(dispute)) {
      if (waitedMs < PENDING_FAST_WAIT_MS) return CREDIT_POLL_MS;
      if (waitedMs < PENDING_WAIT_MS) ms = ADJUDICATION_POLL_MS;
    } else if (dispute.status === "open" && waitedMs < DECISION_WAIT_MS) {
      ms = ADJUDICATION_POLL_MS;
    }
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
 * Only ever used while no receipt of the task is on screen: a first read, or
 * one after this stub (a later 404 from a route that already 404'd is the
 * same missing route, and bannered it as "receipt unavailable" when the run
 * sealed). A route that answered with a receipt exists, so a later 404 is a
 * blip — a redeploy, a proxy — not a backend
 * that predates receipts, and standing in this stub for a receipt already on
 * screen would erase it: the view would go `hidden`, `error` would be null so
 * nothing explained it, and the poll would never re-arm, because a stub with
 * no settlement is not polled.
 */
function noReceiptRoute(taskId: string): TaskDisputes {
  return { task_id: taskId, window_closes_at: null, disputes: [] };
}

/**
 * When the wait for a moving receipt started: carried from the answer before
 * while what is pending is unchanged, restarted at `nowMs` when it changed,
 * and null when nothing is pending.
 */
function pendingSince(
  held: Snapshot | null,
  key: string,
  nowMs: number,
): number | null {
  if (key === "") return null;
  if (held !== null && held.pendingKey === key && held.pendingSinceMs !== null)
    return held.pendingSinceMs;
  return nowMs;
}

/** The error a re-read that lost the settlement on screen is reported as. */
function lostSettlement(taskId: string): string {
  return `GET /tasks/${encodeURIComponent(taskId)}/disputes answered with no settlement on record — showing the receipt last read`;
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
  /**
   * The local clock when the receipt was last seen to MOVE while something
   * on it was still moving, carried the same way; null when nothing is.
   */
  pendingSinceMs: number | null;
  /** `pendingKey` of `res`: what `pendingSinceMs` was started for. */
  pendingKey: string;
  /**
   * The payer's read grant this answer was read with, or null for none —
   * and null too once the server showed it no longer honours it, so a
   * dropped grant is never mistaken for one still to be presented.
   */
  grant: string | null;
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
  /** Server clock minus local clock, in ms; 0 while nothing measured it. */
  offsetMs: number;
  /** Fold a dispute the server returned into the view, without a read. */
  adopt: (dispute: Dispute) => void;
};

/**
 * `disputes` with `adopted` folded in: each adopted dispute replaces the row
 * with its id, or joins the list when there is none.
 */
function withDisputes(disputes: Dispute[], adopted: Dispute[]): Dispute[] {
  const ids = new Set(adopted.map((d) => d.id));
  return [...disputes.filter((d) => !ids.has(d.id)), ...adopted];
}

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
  // When the buyer last came back to this tab. The bounded waits are for a
  // receipt nobody is attending to, and a hidden tab reads nothing, so a
  // return restarts the wait of a receipt still moving (see the poll).
  const [attendedAtMs, setAttendedAtMs] = useState(0);

  // Read by callbacks that must not re-subscribe on every render. Synced in an
  // effect, not during render, and declared before the effects that read them.
  const targetRef = useRef(target);
  const doneRef = useRef(workflowDone);
  const stateRef = useRef(state);
  const addressRef = useRef(address);
  useEffect(() => {
    targetRef.current = target;
    doneRef.current = workflowDone;
    stateRef.current = state;
    addressRef.current = address;
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
  // Disputes the server handed back outside a read (`adopt`), each held until
  // a read of its task lists it. A read that does not is older than the
  // dispute, or failed to see it; either way the dispute exists.
  const adoptedRef = useRef<Dispute[]>([]);
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
      // Whether this task already has a receipt answer on screen, read
      // before the state below is touched: it decides what a 404 means (see
      // `noReceiptRoute`). An answer with no settlement KEY is not one — it
      // is the stub a first 404 left, or a backend with no receipts — so a
      // route that 404'd once and 404s again when the run seals, or on a
      // refresh, is still the route that is missing, never an error.
      const held = stateRef.current;
      const firstRead =
        held.taskId !== id ||
        held.snapshot === null ||
        held.snapshot.res.settlement === undefined;
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
      // The payer's read grant, if this tab holds one for this wallet: read
      // from storage on every read, so a poll presents it and never signs.
      const grant = heldReadGrant(id, addressRef.current);
      let res: TaskDisputes;
      try {
        res = await getTaskDisputes(id, grant);
      } catch (err) {
        if (!isLatest()) return;
        if (err instanceof ApiError && err.status === 404 && firstRead) {
          res = noReceiptRoute(id);
        } else {
          // Whatever is on screen stays: it is this task's (the epoch says no
          // other load has started since), and the error dates it.
          const error = toMessage(err);
          setState((s) => ({ ...s, error }));
          // While the panel is waiting for a settlement or a rating, time
          // passed whether or not the answer came: both waits are bounded on
          // this clock, and a backend failing every read must not hold either
          // open for ever. The clock is left alone otherwise, so a failed poll
          // of a settled receipt leaves the view it dates untouched.
          const waiting = stateRef.current.snapshot;
          if (
            (waiting?.awaitingSinceMs ?? null) !== null ||
            (waiting?.pendingSinceMs ?? null) !== null
          ) {
            setClockMs((prev) => Math.max(prev, Date.now()));
          }
          // The run sealed while this read was out, and the seal was recorded
          // against it rather than spent on a read of its own. It failed, so
          // the seal is spent now: nothing else would ever ask again, and the
          // settlement the seal says is coming would never be read.
          if (sealedInFlightRef.current && !doneAtRequest) {
            void load(id, true);
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
      const offsetMs = serverClockOffsetMs(res, sentAtMs);
      // A grant kept from now on is judged on this clock too (D-067): its
      // expiry is the server's, and a laptop an hour fast dropped every
      // fresh grant on its first read without it.
      if (typeof res.now === "number") noteServerClockOffset(offsetMs);
      // A grant that still came back withheld is one the server no longer
      // honours — it restarted, and its key rotated. Dropped, so the payer is
      // offered the signature again, once, by the receipt; never re-asked
      // for here, which would loop a wallet prompt on every poll.
      const dishonoured =
        grant !== null && res.disputes.some((d) => d.reason_withheld);
      if (dishonoured) forgetReadGrant(id);
      if (!isLatest()) return;
      // What this read lists speaks for itself from now on; what it does not
      // is still folded in.
      const listed = new Set(res.disputes.map((d) => d.id));
      adoptedRef.current = adoptedRef.current.filter((d) => !listed.has(d.id));
      const adopted = adoptedRef.current.filter((d) => d.task_id === id);
      if (adopted.length > 0) {
        res = { ...res, disputes: withDisputes(res.disputes, adopted) };
      }
      const sealed = doneAtRequest || sealedInFlightRef.current;
      setState((s) => {
        const held = s.taskId === id ? s.snapshot : null;
        // A settlement never un-happens. An answer without one — `null` from
        // a store that restarted and lost its records, or no key at all from
        // an older backend behind the same proxy — says the RECORD is
        // missing, not that the charge is: it may not replace a receipt on
        // screen, least of all one with a dispute in flight, which it would
        // have turned into "nothing was charged" some thirty seconds later
        // with no error and no further read. The receipt stays, the error
        // dates it, and the poll goes on at the receipt's own cadence. Only
        // the grant is taken from the answer, so a grant it dropped is not
        // presented — and re-read for — again.
        if (held !== null && held.res.settlement && !res.settlement) {
          return {
            taskId: id,
            snapshot: { ...held, grant: dishonoured ? null : grant },
            error: lostSettlement(id),
          };
        }
        // A sealed run whose settlement has not appeared: the wait starts at
        // the first such answer and is carried by every one after it, so a
        // run of re-reads cannot extend its own deadline.
        const awaiting = sealed && res.settlement === null;
        // The bounded waits restart whenever what is pending changes.
        const key = pendingKey(res);
        return {
          taskId: id,
          snapshot: {
            res,
            offsetMs,
            doneAtRequest: sealed,
            awaitingSinceMs: awaiting
              ? (held?.awaitingSinceMs ?? receivedAtMs)
              : null,
            pendingSinceMs: pendingSince(held, key, receivedAtMs),
            pendingKey: key,
            grant: dishonoured ? null : grant,
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

  // Reads again when the grant this tab holds for the connected wallet is
  // not the one the answer on screen was read with. The wallet restores
  // AFTER the first read, so a payer who signed for a grant and then
  // reloaded was read without it and offered the signature again — on a
  // settled receipt nothing polls, so it stayed that way. It also covers a
  // grant expiring, and another wallet connecting: the payer's words go the
  // moment the grant stops being theirs to present.
  //
  // Settles in one read: that answer records the grant it presented, and a
  // grant the server refused is dropped from both sides at once.
  useEffect(() => {
    if (target === null || inFlightRef.current) return;
    const held = state.taskId === target ? state.snapshot : null;
    if (held === null) return;
    if (heldReadGrant(target, address) === held.grant) return;
    void load(target, doneRef.current);
  }, [target, address, state, load]);

  const refresh = useCallback(async (): Promise<void> => {
    const id = targetRef.current;
    if (id === null) return;
    await load(id, doneRef.current);
  }, [load]);

  const adopt = useCallback((dispute: Dispute): void => {
    const id = targetRef.current;
    if (id === null || dispute.task_id !== id) return;
    adoptedRef.current = withDisputes(adoptedRef.current, [dispute]);
    setState((s) => {
      if (s.taskId !== id || s.snapshot === null) return s;
      const res = {
        ...s.snapshot.res,
        disputes: withDisputes(s.snapshot.res.disputes, [dispute]),
      };
      // A dispute just raised is the receipt moving: its wait starts now.
      const key = pendingKey(res);
      return {
        ...s,
        snapshot: {
          ...s.snapshot,
          res,
          pendingSinceMs: pendingSince(s.snapshot, key, Date.now()),
          pendingKey: key,
        },
      };
    });
  }, []);

  const current = target !== null && state.taskId === target ? state : null;
  const snapshot = current?.snapshot ?? null;
  const loading = target !== null && snapshot === null && !current?.error;
  const error = current?.error ?? null;

  // How long a settlement the seal says should exist has been looked for, and
  // whether the panel is still looking. Both are 0/false unless it is waiting.
  const awaitingSinceMs = snapshot?.awaitingSinceMs ?? null;
  const awaitedMs =
    awaitingSinceMs === null ? 0 : Math.max(0, clockMs - awaitingSinceMs);
  // A backend that reports how the settlement ended without a record —
  // failed, unconfirmed, released, skipped — has already answered: waiting
  // out the record would hide a failed settlement behind "appears here once
  // this workflow settles" for the whole wait. Only `settled` (or no state
  // at all) says a record is still to come.
  const reported = snapshot?.res.settlement_state;
  const answeredWithoutRecord =
    reported !== undefined && reported !== null && reported !== "settled";
  const stillLooking =
    !answeredWithoutRecord &&
    awaitingSinceMs !== null &&
    awaitedMs < SETTLEMENT_WAIT_MS;
  // The same, for a receipt still moving: how long since it last moved, or
  // since the buyer last came back to it, whichever is later.
  const movedAtMs = snapshot?.pendingSinceMs ?? null;
  const pendingSinceMs =
    movedAtMs === null ? null : Math.max(movedAtMs, attendedAtMs);
  const pendingAwaitedMs =
    pendingSinceMs === null ? 0 : Math.max(0, clockMs - pendingSinceMs);
  const pollMs = disputePollMs(
    snapshot === null
      ? null
      : {
          res: snapshot.res,
          doneAtRequest: snapshot.doneAtRequest,
          awaitedMs,
          pendingAwaitedMs,
        },
  );
  // The very condition that ends the poll, so a receipt says it stopped
  // reading exactly when it did: something is still moving, and nothing
  // reads for it any more.
  const waitOver = pendingSinceMs !== null && pollMs === null;

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
        waitOver,
      }),
    [snapshot, address, workflowDone, stillLooking, clockMs, demo, waitOver],
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
  //
  // Every wait is bounded (`disputePollMs`), and a return to the tab restarts
  // the wait of a receipt still moving: the bounds are for a receipt left
  // unattended, and a buyer who comes back is watching again. So the listener
  // stays while anything is still moving, even once the poll has stopped, and
  // a return to a stopped receipt reads it at once — "stopped checking" is
  // never left standing over a buyer who has just looked.
  //
  // `pollMs` is computed above, with the view that reports its stopping.
  const moving = pendingSinceMs !== null;
  useEffect(() => {
    if (target === null || (pollMs === null && !moving)) return;
    const id = target;
    // Undefined while paused, and between a poll firing and its answer
    // landing — which re-runs this effect and arms the next one.
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = () => {
      timer = undefined;
      if (!inFlightRef.current) void load(id, doneRef.current);
    };
    const hidden = () => document.visibilityState === "hidden";
    /** What is left of the cadence since the last read, never negative;
     * 0 once the poll has stopped, since a return is then overdue. */
    const dueInMs = () =>
      pollMs === null
        ? 0
        : Math.max(0, pollMs - (Date.now() - lastReadAtMs.current));
    const onVisibilityChange = () => {
      if (hidden()) {
        clearTimeout(timer);
        timer = undefined;
        return;
      }
      if (moving) setAttendedAtMs(Date.now());
      if (timer === undefined) {
        const leftMs = dueInMs();
        if (leftMs === 0) poll();
        else timer = setTimeout(poll, leftMs);
      }
    };
    if (!hidden() && pollMs !== null) timer = setTimeout(poll, pollMs);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [target, pollMs, moving, state, load]);

  return {
    view,
    loading,
    error,
    refresh,
    offsetMs: snapshot?.offsetMs ?? 0,
    adopt,
  };
}
