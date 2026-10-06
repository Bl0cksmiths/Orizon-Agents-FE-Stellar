"use client";
/**
 * "We understood this as…" — the brief a plan was built from (orchestrator
 * v2), shown with the plan and editable.
 *
 * Before it plans, the backend rewrites the buyer's request as a structured
 * brief: a goal, a deliverable, constraints, and what done looks like. The
 * plan below answers that brief, not the raw words — so the buyer is shown
 * it, and can correct it. A corrected brief goes back to the backend as
 * `spec`, where it is checked again before anything is planned from it.
 *
 * Above the steps, like the floor summary: it is the frame the plan was built
 * in, and a buyer who reads the steps first has already judged the plan by
 * the time they learn what it was answering.
 */

import dynamic from "next/dynamic";
import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type { PlanSpec } from "@/lib/types";
import { cn } from "@/lib/utils";

// The editor is its own chunk (the plan page sits at its first-load budget),
// fetched as the buyer reaches for the edit button — on hover or focus — so
// it is usually in hand before the click.
const loadSpecForm = () => import("./spec-form");
const SpecForm = dynamic(() => loadSpecForm().then((m) => m.SpecForm), {
  ssr: false,
});

const label = "font-mono text-[10px] uppercase tracking-[0.25em] text-muted";

export function UnderstoodAsPanel({
  spec,
  onRespec,
  busy = false,
}: {
  spec: PlanSpec;
  /** Plans again from the edited brief. Absent, the brief is read-only. */
  onRespec?: (spec: PlanSpec) => void;
  /** This plan is being paid for, or a new one is on its way: editing waits,
   *  as the card's other actions do. */
  busy?: boolean;
}) {
  const uid = useId();
  const headingId = `${uid}-heading`;
  const [editing, setEditing] = useState(false);
  const editButton = useRef<HTMLButtonElement>(null);

  // Set on cancel, so focus goes back to the edit button once it is on
  // screen again — never on the first render, which must not steal focus.
  const refocus = useRef(false);
  useEffect(() => {
    if (editing || !refocus.current) return;
    refocus.current = false;
    editButton.current?.focus();
  }, [editing]);

  const close = () => {
    refocus.current = true;
    setEditing(false);
  };

  return (
    <section
      aria-labelledby={headingId}
      className="mb-6 clip-cyber-sm border border-border bg-bg/40 p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* h3: the card's own "Execution plan" is the h2 above it. */}
        <h3 id={headingId} className="text-sm font-semibold tracking-tight">
          We understood this as…
        </h3>
        {onRespec && !editing && (
          <Button
            ref={editButton}
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setEditing(true)}
            onPointerEnter={() => void loadSpecForm()}
            onFocus={() => void loadSpecForm()}
            disabled={busy}
          >
            Edit the brief ▸
          </Button>
        )}
      </div>

      {editing && onRespec ? (
        <SpecForm
          spec={spec}
          busy={busy}
          onSubmit={onRespec}
          onCancel={close}
          headingId={headingId}
        />
      ) : (
        <SpecView spec={spec} />
      )}
    </section>
  );
}

function SpecView({ spec }: { spec: PlanSpec }) {
  return (
    <>
      <p className="mt-2 text-sm leading-relaxed text-text [overflow-wrap:anywhere]">
        {spec.summary}
      </p>
      <dl className="mt-4 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-[minmax(7rem,auto)_minmax(0,1fr)]">
        <Row term="Goal">{spec.goal}</Row>
        <Row term="Deliverable">{spec.deliverable}</Row>
        <Row term="Constraints">
          <Items items={spec.constraints} />
        </Row>
        <Row term="Done when">
          <Items items={spec.done_criteria} />
        </Row>
      </dl>
    </>
  );
}

function Row({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <>
      <dt className={cn(label, "pt-1")}>{term}</dt>
      <dd className="min-w-0 leading-relaxed text-text/90 [overflow-wrap:anywhere]">
        {children}
      </dd>
    </>
  );
}

function Items({ items }: { items: string[] }) {
  if (items.length === 0)
    return <span className="text-muted">None stated</span>;
  return (
    <ul className="space-y-1">
      {items.map((item, i) => (
        <li key={`${i}-${item}`} className="flex gap-2">
          <span aria-hidden="true" className="text-cyan">
            ▸
          </span>
          <span className="min-w-0">{item}</span>
        </li>
      ))}
    </ul>
  );
}
