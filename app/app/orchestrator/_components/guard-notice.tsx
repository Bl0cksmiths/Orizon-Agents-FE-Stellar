"use client";
/**
 * What the Orchestrator form says when the request check (orchestrator v2)
 * answers a decompose with something other than a plan.
 *
 * Every request is checked before it is planned. Four answers are not plans,
 * and each gets its own notice in plain words instead of an error string:
 *
 * - blocked: the request was judged unsafe, or an attempt to steer the agents
 *   off their instructions. Said once, with the backend's reason, and without
 *   a lecture.
 * - needs detail: too short, too vague, or not something agents can act on.
 *   The backend's question is the notice; the intent box is where to answer.
 * - unavailable: the check could not run, and the backend fails closed rather
 *   than plan an unchecked request. Retryable once its Retry-After passes.
 * - paused: today's budget for AI planning is spent. The curated examples
 *   still plan, and the notice says when AI planning resumes.
 *
 * Every one says nothing was charged: no plan exists yet to pay for, and "did
 * that cost me anything" is the first question a refusal on a pay page raises.
 *
 * The facts sit in one `role="alert"` region — each is the answer to the
 * buyer's own submit, as the plain error it replaces was. Anything that
 * changes on its own (the retry countdown) and the retry button sit outside
 * it, because a live region re-announces whenever its text changes.
 */

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatLocalTime } from "@/lib/local-time";
import { cn } from "@/lib/utils";
import { GUARD_NOTICE_ID, type DecomposeRefusal } from "./plan-errors";

export { GUARD_NOTICE_ID } from "./plan-errors";

const NOTHING_CHARGED = "Nothing was charged.";

/**
 * Whole seconds left until `untilMs`, ticking once a second and stopping at
 * zero. Null when there is no deadline. The deadline is fixed when the notice
 * mounts, so a re-render never moves it.
 */
function useSecondsLeft(waitMs: number | null): number | null {
  const [until] = useState(() =>
    waitMs === null ? null : Date.now() + waitMs,
  );
  const left = () =>
    until === null
      ? null
      : Math.max(0, Math.ceil((until - Date.now()) / 1_000));
  const [seconds, setSeconds] = useState(left);
  useEffect(() => {
    if (until === null) return;
    const timer = setInterval(() => {
      const s = left();
      setSeconds(s);
      if (s === 0) clearInterval(timer);
    }, 1_000);
    return () => clearInterval(timer);
    // `left` reads only `until`, which never changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [until]);
  return seconds;
}

/** The notice's look per answer. Magenta is kept for the two that are a
 *  failure; a question and a pause are not, and must not read as one. */
const FRAME: Record<DecomposeRefusal["kind"], string> = {
  blocked: "border-magenta/40 bg-magenta/5",
  needs_detail: "border-violet/40 bg-violet/5",
  unavailable: "border-magenta/40 bg-magenta/5",
  paused: "border-violet/40 bg-violet/5",
};

const BADGE: Record<
  DecomposeRefusal["kind"],
  { tone: "magenta" | "violet"; glyph: string; word: string }
> = {
  blocked: { tone: "magenta", glyph: "✕", word: "not planned" },
  needs_detail: { tone: "violet", glyph: "?", word: "needs detail" },
  unavailable: { tone: "magenta", glyph: "!", word: "check unavailable" },
  paused: { tone: "violet", glyph: "‖", word: "paused" },
};

export function GuardNotice({
  refusal,
  onRetry,
  busy = false,
  className,
}: {
  refusal: DecomposeRefusal;
  /** Sends the same request again — offered only while the check is down. */
  onRetry?: () => void;
  /** A decompose is already out; a retry waits for it. */
  busy?: boolean;
  className?: string;
}) {
  const badge = BADGE[refusal.kind];
  return (
    <div
      className={cn(
        "clip-cyber-sm border px-4 py-3",
        FRAME[refusal.kind],
        className,
      )}
    >
      <div id={GUARD_NOTICE_ID} role="alert">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={badge.tone}>
            <span aria-hidden="true">{badge.glyph}</span>
            {badge.word}
          </Badge>
          {/* A <p>, not a heading: the alert sits inside the form, and the
              page's outline is the form and the plan. */}
          <p className="min-w-0 text-sm font-semibold tracking-tight text-text">
            {TITLE[refusal.kind]}
          </p>
        </div>
        <div className="mt-2 space-y-2 text-sm leading-relaxed text-muted">
          <Body refusal={refusal} />
        </div>
      </div>
      {refusal.kind === "unavailable" && onRetry && (
        <RetryRow waitMs={refusal.retryAfterMs} onRetry={onRetry} busy={busy} />
      )}
    </div>
  );
}

const TITLE: Record<DecomposeRefusal["kind"], string> = {
  blocked: "We can't plan this request",
  needs_detail: "Tell us a little more",
  unavailable: "Our request check isn't answering",
  paused: "AI planning is paused for today",
};

function Body({ refusal }: { refusal: DecomposeRefusal }) {
  switch (refusal.kind) {
    case "blocked":
      return (
        <>
          <p className="text-text/90">
            {refusal.reason ??
              "Our safety check flagged it as something the agents can't help with."}
          </p>
          <p>
            {NOTHING_CHARGED} If this looks wrong, describe what you need in
            plain words and decompose again.
          </p>
        </>
      );
    case "needs_detail":
      return (
        <>
          <p className="text-text/90">
            {refusal.question ??
              "The request is too short or unclear to plan. What should the agents make, and what is it for?"}
          </p>
          <p>
            Add more detail in the box above and decompose again.{" "}
            {NOTHING_CHARGED}
          </p>
        </>
      );
    case "unavailable":
      return (
        <p>
          Every request is checked before it is planned, and the check
          couldn&apos;t run just now, so nothing was planned. {NOTHING_CHARGED}
        </p>
      );
    case "paused":
      return (
        <>
          <p>
            Today&apos;s budget for AI planning has been used, so new requests
            can&apos;t be planned yet. {NOTHING_CHARGED}
          </p>
          <p>
            <ResumesAt waitMs={refusal.retryAfterMs} /> The ready-made examples
            above still plan as usual.
          </p>
        </>
      );
  }
}

/** When planning resumes, as a time in the buyer's own zone. The deadline is
 *  read once, on mount, so a re-render never moves it. */
function ResumesAt({ waitMs }: { waitMs: number | null }) {
  const [at] = useState(() => (waitMs === null ? null : Date.now() + waitMs));
  if (at === null) {
    return <>AI planning resumes when the daily budget resets.</>;
  }
  return (
    <>
      AI planning resumes around{" "}
      <time dateTime={new Date(at).toISOString()} className="text-text/90">
        {formatLocalTime(at)}
      </time>
      .
    </>
  );
}

function RetryRow({
  waitMs,
  onRetry,
  busy,
}: {
  waitMs: number | null;
  onRetry: () => void;
  busy: boolean;
}) {
  const seconds = useSecondsLeft(waitMs);
  const waiting = seconds !== null && seconds > 0;
  return (
    <div className="mt-3 flex flex-wrap items-center gap-3">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={onRetry}
        disabled={waiting || busy}
      >
        Try again ▸
      </Button>
      {/* Fixed width in ch so the count ticking from 10 s to 9 s never nudges
          the row. Not live: the button's state is what changes for a reader
          who tabs to it. */}
      {waiting && (
        <span className="min-w-[14ch] font-mono text-[11px] text-muted">
          available in {seconds} s
        </span>
      )}
    </div>
  );
}
