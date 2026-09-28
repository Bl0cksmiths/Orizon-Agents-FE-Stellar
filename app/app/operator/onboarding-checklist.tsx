"use client";
/**
 * The onboarding checklist (story 5.02): the seven steps between registering
 * an agent and being paid through it, as the backend last checked them.
 *
 * Onboarding an outside operator is done hands-on, usually with someone from
 * the team on a call. Both of them need to see the same thing: which step is
 * finished, which one is stuck, what to do about it, and whether the answer on
 * screen is fresh. So every step says its status in words beside its icon,
 * the first step that is not done is pulled out as "Next", and the stamp and
 * the re-check note say plainly that the backend caches its answer.
 *
 * Every rule — step order, the next step, which page fixes which step, what
 * the live region says — lives in lib/readiness.ts. This file only draws it.
 */

import Link from "next/link";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { ErrorNote } from "@/components/ui/error-note";
import { LoadingStatus, Skeleton } from "@/components/ui/skeleton";
import {
  READINESS_CACHE_SECONDS,
  STATUS_TEXT,
  checklistSteps,
  evidenceLink,
  formatCheckedAt,
  getAgentReadiness,
  nextStep,
  recheckAnnouncement,
  stepLabel,
  stepLink,
  type ChecklistStep,
  type ReadinessStatus,
} from "@/lib/readiness";
import { inlineLink } from "@/lib/ui";
import { useAsyncAction } from "@/lib/use-async-action";
import { useFetch } from "@/lib/use-fetch";
import { cn } from "@/lib/utils";

/** Decoration only: every glyph sits beside `STATUS_TEXT`, which carries the
 * meaning in words. */
const GLYPH: Record<ReadinessStatus, string> = {
  done: "✓",
  todo: "–",
  failed: "✕",
  unknown: "?",
};

const TONE: Record<ReadinessStatus, string> = {
  done: "text-emerald-300",
  todo: "text-muted",
  failed: "text-magenta",
  unknown: "text-violet-readable",
};

const body = "font-mono text-[11px] leading-relaxed text-muted";

export function OnboardingChecklist({ agentId }: { agentId: string }) {
  const headingId = useId();
  const initial = useFetch(() => getAgentReadiness(agentId), [agentId]);
  const recheck = useAsyncAction(getAgentReadiness);
  const [announcement, setAnnouncement] = useState("");

  // A re-check is newer than the first read, so it wins — but only while it
  // is about this agent.
  const shown =
    recheck.data?.agent_id === agentId ? recheck.data : initial.data;

  const onRecheck = async () => {
    const previous = shown?.checked_at ?? null;
    setAnnouncement("");
    const result = await recheck.run(agentId);
    // A failed re-check is announced by its ErrorNote (role="alert"); saying
    // it here as well would read it out twice.
    if (result) setAnnouncement(recheckAnnouncement(result, previous));
  };

  const steps = shown ? checklistSteps(shown) : [];
  const recheckWord = recheck.pending ? "Re-checking…" : "Re-check";
  const next = nextStep(steps);

  return (
    <section aria-labelledby={headingId} className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id={headingId} className="text-sm font-semibold tracking-tight">
            Onboarding checklist
          </h2>
          <p className={`mt-1 ${body}`}>
            The seven steps between registering{" "}
            <span className="break-all text-text">{agentId}</span> and being
            paid through it.
          </p>
        </div>
        {shown && (
          <p
            className={cn(
              "clip-cyber-sm border px-2 py-1 font-mono text-[10px] uppercase tracking-widest",
              shown.ready
                ? "border-cyan/40 bg-cyan/5 text-cyan"
                : "border-border bg-white/5 text-muted",
            )}
          >
            <span aria-hidden="true">{shown.ready ? "✓ " : "– "}</span>
            {shown.ready ? "Ready to be routed" : "Not ready to be routed"}
          </p>
        )}
      </div>

      {!shown ? (
        initial.error ? (
          <ErrorNote
            onRetry={initial.reload}
            retrying={initial.loading || initial.retrying}
          >
            <span className="block">
              Could not check onboarding for {agentId}. That is a fact about our
              request, not about your agent.
            </span>
            <span className="mt-0.5 block break-all opacity-80">
              {initial.error}
            </span>
          </ErrorNote>
        ) : (
          <div className="space-y-2">
            <LoadingStatus label={`Checking onboarding for ${agentId}…`} />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        )
      ) : (
        <>
          <NextStep step={next} agentId={agentId} total={steps.length} />

          <ol
            aria-label={`Onboarding steps for ${agentId}`}
            className="space-y-3"
          >
            {steps.map((step, i) => (
              <StepRow
                key={step.key}
                step={step}
                index={i}
                agentId={agentId}
                current={step === next}
              />
            ))}
          </ol>

          {recheck.error && (
            <ErrorNote>
              <span className="block">
                Re-check failed for {agentId}. Still showing the check from{" "}
                {formatCheckedAt(shown.checked_at)}.
              </span>
              <span className="mt-0.5 block break-all opacity-80">
                {recheck.error}
              </span>
            </ErrorNote>
          )}

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onRecheck}
              disabled={recheck.pending}
              // The agent id in the name tells several of these apart when a
              // screen reader lists the page's buttons; it starts with the
              // visible words so voice control still finds it by them.
              aria-label={`${recheckWord} onboarding for ${agentId}`}
            >
              {recheckWord}
            </Button>
            <p className={body}>
              checked{" "}
              <time
                dateTime={new Date(shown.checked_at * 1_000).toISOString()}
                className="text-text"
              >
                {formatCheckedAt(shown.checked_at)}
              </time>
            </p>
          </div>
          <p className={body}>
            The backend caches this check for about {READINESS_CACHE_SECONDS}{" "}
            seconds, so a step you just fixed can take that long to show as
            done.
          </p>
        </>
      )}

      {/* Always mounted, so the first re-check result is announced: a live
          region that appears together with its text is often not read. Empty
          until the operator asks, so nothing is said on load. */}
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </section>
  );
}

/** The first step that is not done, pulled out so it cannot be missed. */
function NextStep({
  step,
  agentId,
  total,
}: {
  step: ChecklistStep | null;
  agentId: string;
  total: number;
}) {
  if (!step) {
    return (
      <p className="clip-cyber-sm border border-cyan/40 bg-cyan/5 px-3 py-2 font-mono text-xs text-cyan">
        <span aria-hidden="true">✓ </span>All {total} steps done.
      </p>
    );
  }
  const link = stepLink(step, agentId);
  return (
    <div className="clip-cyber-sm space-y-1 border border-violet/40 bg-violet/5 px-3 py-2 font-mono text-xs">
      <p className="text-text">
        <span className="font-semibold">Next: {stepLabel(step.key)}</span>{" "}
        <span className={TONE[step.status]}>({STATUS_TEXT[step.status]})</span>
      </p>
      <p className="break-words text-muted">{step.action ?? step.detail}</p>
      {link && (
        <p>
          <Link href={link.href} className={inlineLink}>
            {link.label}
          </Link>
        </p>
      )}
    </div>
  );
}

function StepRow({
  step,
  index,
  agentId,
  current,
}: {
  step: ChecklistStep;
  index: number;
  agentId: string;
  current: boolean;
}) {
  const link = stepLink(step, agentId);
  const evidence = evidenceLink(step);
  return (
    <li
      aria-current={current ? "step" : undefined}
      className={cn(
        "flex gap-3 border-l-2 pl-3",
        current ? "border-violet" : "border-border",
      )}
    >
      <span
        aria-hidden="true"
        className={cn("w-4 shrink-0 font-mono text-sm", TONE[step.status])}
      >
        {GLYPH[step.status]}
      </span>
      <div className="min-w-0 flex-1 space-y-1">
        <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
          <span className="font-medium text-text">
            {index + 1}. {stepLabel(step.key)}
          </span>
          <span
            className={cn(
              "font-mono text-[10px] uppercase tracking-widest",
              TONE[step.status],
            )}
          >
            {STATUS_TEXT[step.status]}
          </span>
        </p>
        <p className={cn(body, "break-words")}>{step.detail}</p>
        {step.action && step.status !== "done" && (
          <p className={cn(body, "break-words text-text")}>
            To do: {step.action}
          </p>
        )}
        {(link || evidence) && (
          <p className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11px]">
            {link && (
              <Link href={link.href} className={inlineLink}>
                {link.label}
              </Link>
            )}
            {evidence && (
              <a
                href={evidence.href}
                target="_blank"
                rel="noreferrer"
                className={cn(inlineLink, "break-all")}
              >
                {evidence.label}
                <span className="sr-only">
                  {" "}
                  — evidence for {stepLabel(step.key)} (opens in a new tab)
                </span>
              </a>
            )}
          </p>
        )}
      </div>
    </li>
  );
}
