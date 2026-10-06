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

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import {
  draftToSpec,
  specChanged,
  specToDraft,
  type SpecDraft,
  type SpecField,
} from "@/lib/plan-spec";
import type { PlanSpec } from "@/lib/types";
import { inputCls } from "@/lib/ui";
import { cn } from "@/lib/utils";

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

/** The form's fields, in the order a buyer reads a brief. */
const FIELDS: ReadonlyArray<{
  name: SpecField;
  label: string;
  hint?: string;
  rows?: number;
}> = [
  { name: "goal", label: "Goal", rows: 2 },
  { name: "deliverable", label: "Deliverable" },
  { name: "constraints", label: "Constraints", hint: "One per line.", rows: 3 },
  { name: "done_criteria", label: "Done when", hint: "One per line.", rows: 3 },
  {
    name: "summary",
    label: "Summary",
    hint: "One sentence. Left blank, the goal is used.",
    rows: 2,
  },
];

function SpecForm({
  spec,
  busy,
  onSubmit,
  onCancel,
  headingId,
}: {
  spec: PlanSpec;
  busy: boolean;
  onSubmit: (spec: PlanSpec) => void;
  onCancel: () => void;
  headingId: string;
}) {
  const uid = useId();
  const [draft, setDraft] = useState<SpecDraft>(() => specToDraft(spec));
  const [errors, setErrors] = useState<Partial<Record<SpecField, string>>>({});
  const [unchanged, setUnchanged] = useState(false);
  const refs = useRef<
    Partial<Record<SpecField, HTMLInputElement | HTMLTextAreaElement | null>>
  >({});

  const idOf = (name: SpecField, part: string) => `${uid}-${name}-${part}`;

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const result = draftToSpec(draft);
    if (!result.ok) {
      setErrors(result.errors);
      setUnchanged(false);
      const first = FIELDS.find((f) => result.errors[f.name]);
      if (first) refs.current[first.name]?.focus();
      return;
    }
    setErrors({});
    if (!specChanged(spec, result.spec)) {
      setUnchanged(true);
      return;
    }
    setUnchanged(false);
    onSubmit(result.spec);
  };

  return (
    <form
      onSubmit={submit}
      aria-labelledby={headingId}
      noValidate
      className="mt-3 space-y-4"
    >
      <p className="text-sm leading-relaxed text-muted">
        Correct anything we got wrong. Your edited brief is checked again before
        a new plan is made from it, and nothing is charged until you authorize a
        plan.
      </p>
      {FIELDS.map((f, i) => {
        const error = errors[f.name];
        const describedBy =
          [f.hint && idOf(f.name, "hint"), error && idOf(f.name, "error")]
            .filter(Boolean)
            .join(" ") || undefined;
        const common = {
          id: idOf(f.name, "input"),
          value: draft[f.name],
          onChange: (
            e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
          ) => {
            const value = e.target.value;
            setDraft((d) => ({ ...d, [f.name]: value }));
            setUnchanged(false);
          },
          "aria-invalid": error ? true : undefined,
          "aria-describedby": describedBy,
          disabled: busy,
          className: cn(
            inputCls,
            "mt-1.5 text-[13px] leading-relaxed",
            error && "border-magenta/60",
          ),
          ref: (el: HTMLInputElement | HTMLTextAreaElement | null) => {
            refs.current[f.name] = el;
          },
        };
        return (
          <div key={f.name}>
            <label htmlFor={common.id} className={label}>
              {f.label}
            </label>
            {f.rows ? (
              <textarea
                {...common}
                rows={f.rows}
                autoFocus={i === 0}
                className={cn(common.className, "resize-y")}
              />
            ) : (
              <input {...common} type="text" autoFocus={i === 0} />
            )}
            {f.hint && (
              <p
                id={idOf(f.name, "hint")}
                className="mt-1 font-mono text-[10px] text-muted"
              >
                {f.hint}
              </p>
            )}
            {error && (
              <p
                id={idOf(f.name, "error")}
                className="mt-1 font-mono text-[11px] text-magenta"
              >
                {error}
              </p>
            )}
          </div>
        );
      })}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="sm" disabled={busy}>
          Re-plan with this brief ▸
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onCancel}
          disabled={busy}
        >
          Cancel
        </Button>
        {/* Always mounted, so the sentence is announced when it appears. */}
        <p role="status" className="font-mono text-[11px] text-muted">
          {unchanged ? "Nothing changed yet — edit a field to plan again." : ""}
        </p>
      </div>
    </form>
  );
}
