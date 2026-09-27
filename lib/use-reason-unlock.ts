"use client";
/**
 * The payer's "show my reason" action (D-067): one click, one wallet
 * signature, a read grant held for the tab, and a re-read that presents it.
 *
 *   const { status, unavailable, unlock } = useReasonUnlock(taskId, refresh);
 *
 * Nothing here runs on its own. The wallet is asked only inside `unlock`,
 * which only a click calls, and whether to offer it at all is the view's
 * `reasonsWithheld` — the payer, and a backend saying it withheld something.
 *
 * - `status` is how the last attempt ended, for the line beside the control.
 *   A declined prompt is `declined`: the payer changing their mind, which the
 *   receipt states quietly, never as an error.
 * - `unavailable` turns the control off for this task: the challenge route
 *   answered 404, so this backend has no grant to give, or nothing to read.
 */

import { useCallback, useRef, useState } from "react";
import {
  obtainReadGrant,
  readGrantFailure,
  type ReadGrantFailure,
} from "./dispute-read-grant";
import { useWallet } from "./wallet";

export type ReasonUnlockStatus =
  "idle" | "signing" | Exclude<ReadGrantFailure, "unavailable">;

type UnlockState = {
  /** The task everything below describes; a mismatch means "nothing yet". */
  taskId: string | null;
  status: ReasonUnlockStatus;
  unavailable: boolean;
};

const IDLE: Omit<UnlockState, "taskId"> = {
  status: "idle",
  unavailable: false,
};

export type UseReasonUnlockResult = {
  status: ReasonUnlockStatus;
  unavailable: boolean;
  unlock: () => Promise<void>;
};

export function useReasonUnlock(
  taskId: string | null,
  /** Re-reads the receipt, resolving once the answer is on screen. */
  refresh: () => Promise<void>,
): UseReasonUnlockResult {
  const { address, signMessage } = useWallet();
  const [state, setState] = useState<UnlockState>({ taskId, ...IDLE });
  // Another task starts from nothing: an outcome, or a missing route, on one
  // trace says nothing about the next.
  const current = state.taskId === taskId ? state : { taskId, ...IDLE };
  // One attempt at a time, whatever the button's state has rendered as: a
  // double click must never become two wallet prompts.
  const busyRef = useRef(false);

  const unlock = useCallback(async (): Promise<void> => {
    if (taskId === null || address === null || busyRef.current) return;
    busyRef.current = true;
    const set = (next: Omit<UnlockState, "taskId">) =>
      setState({ taskId, ...next });
    set({ status: "signing", unavailable: false });
    try {
      await obtainReadGrant({ taskId, payer: address, signMessage });
      // Held until the receipt has re-read with the grant, so the control
      // cannot take a second press — or a second signature — in between.
      await refresh();
      set({ status: "idle", unavailable: false });
    } catch (err) {
      const failure = readGrantFailure(err);
      set(
        failure === "unavailable"
          ? { status: "idle", unavailable: true }
          : { status: failure, unavailable: false },
      );
    } finally {
      busyRef.current = false;
    }
  }, [taskId, address, signMessage, refresh]);

  return {
    status: current.status,
    unavailable: current.unavailable,
    unlock,
  };
}
