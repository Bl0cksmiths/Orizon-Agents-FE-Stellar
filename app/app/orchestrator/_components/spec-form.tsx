"use client";
/**
 * The editor for the brief a plan was built from ("We understood this as…").
 * Its own chunk: only a buyer who chooses to correct the brief ever needs it,
 * so it is fetched when they reach for the edit button, not with the page.
 */

import { useId, useRef, useState, type FormEvent } from "react";
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

export function SpecForm({
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
