"use client";
import { useRef, useState } from "react";
import { entrance } from "@/components/ui/entrance";
import { faultPoint } from "@/lib/fault-injection";
import { focusRing } from "@/lib/ui";
import { cn } from "@/lib/utils";
import {
  UseCaseFlow,
  UseCasesHeading,
  USE_CASES as cases,
} from "./use-case-flow";

export function UseCases() {
  faultPoint("use-cases");
  const [active, setActive] = useState(cases[0].id);
  const current = cases.find((c) => c.id === active) ?? cases[0];
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // Roving tabindex: the tablist is one tab stop, and Arrow/Home/End move
  // between the tabs inside it (WAI-ARIA tabs pattern). Without this a keyboard
  // user has to tab through every case to reach the panel.
  function onTabKeyDown(e: React.KeyboardEvent, index: number) {
    const last = cases.length - 1;
    let next: number | null = null;
    if (e.key === "ArrowRight") next = index === last ? 0 : index + 1;
    else if (e.key === "ArrowLeft") next = index === 0 ? last : index - 1;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = last;
    if (next === null) return;
    e.preventDefault();
    setActive(cases[next].id);
    tabRefs.current[next]?.focus();
  }

  return (
    <section
      id="use-cases"
      data-use-cases="interactive"
      className="relative py-20 md:py-28"
    >
      <div className="mx-auto max-w-7xl px-6">
        <UseCasesHeading />

        <div
          role="tablist"
          aria-label="Use cases"
          className="mt-12 grid gap-2 sm:grid-cols-2 lg:flex lg:flex-wrap"
        >
          {cases.map((c, i) => {
            const selected = active === c.id;
            return (
              <button
                key={c.id}
                ref={(el) => {
                  tabRefs.current[i] = el;
                }}
                role="tab"
                id={`usecase-tab-${c.id}`}
                aria-selected={selected}
                aria-controls={`usecase-panel-${c.id}`}
                tabIndex={selected ? 0 : -1}
                onClick={() => setActive(c.id)}
                onKeyDown={(e) => onTabKeyDown(e, i)}
                className={cn(
                  "clip-cyber-sm min-h-11 border px-4 py-2 font-mono text-[11px] uppercase tracking-[0.2em] transition",
                  focusRing,
                  selected
                    ? "bg-violet/20 border-violet text-text shadow-neon-violet"
                    : "border-border text-muted hover:text-text hover:border-violet/60",
                )}
              >
                {c.title}
              </button>
            );
          })}
        </div>

        {/* Keyed by case, so a new tab mounts a new panel and its entrance
            plays again. */}
        <div
          key={current.id}
          id={`usecase-panel-${current.id}`}
          role="tabpanel"
          aria-labelledby={`usecase-tab-${current.id}`}
          // Focusable so the keyboard path continues from the tabs into the
          // panel content rather than skipping it.
          tabIndex={0}
          style={entrance({ duration: 0.4, from: "translateY(12px)" })}
          className={cn("enter mt-8", focusRing)}
        >
          <UseCaseFlow useCase={current} />
        </div>
      </div>
    </section>
  );
}
