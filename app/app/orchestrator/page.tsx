"use client";
import { useState, type FormEvent, type KeyboardEvent } from "react";
import { AnimatePresence } from "framer-motion";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { decompose } from "@/lib/api";
import { focusRing } from "@/lib/ui";
import { useAsyncAction } from "@/lib/use-async-action";
import { ExecutionPlan } from "./_components/execution-plan";

const PRESETS = [
  "tetris game in html",
  "calculator web app",
  "snake game in html",
  "pomodoro timer with sound",
];

export default function OrchestratorPage() {
  const [intent, setIntent] = useState("");
  // Decompose is the page's only async flow; the execute flows (simulate /
  // authorize / fiat) live in ExecutionPlan, which is fed `plan.data`.
  const plan = useAsyncAction(decompose);

  const decomposeIntent = (text: string) => {
    if (!text || plan.pending) return;
    // reset() first so the previous plan drops while the new one is in
    // flight instead of lingering under the spinner.
    plan.reset();
    void plan.run(text);
  };

  const submitIntent = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    decomposeIntent(intent.trim());
  };

  // The intent box is a textarea, so Enter inserts a newline by default —
  // submit instead (Shift+Enter keeps the newline).
  const submitOnEnter = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      e.currentTarget.form?.requestSubmit();
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Orchestrator</h1>
        <p className="mt-1 text-sm text-muted">
          Intent in. Agent chain out. Pay-per-workflow via x402 on Stellar.
        </p>
      </div>

      <Card>
        <form onSubmit={submitIntent}>
          <label
            htmlFor="intent"
            className="font-mono text-[10px] uppercase tracking-[0.25em] text-cyan"
          >
            ▸ intent
          </label>
          <textarea
            id="intent"
            value={intent}
            onChange={(e) => setIntent(e.target.value)}
            onKeyDown={submitOnEnter}
            placeholder='e.g. "code a calculator web app"'
            rows={3}
            className="mt-2 w-full bg-bg/60 border border-border p-4 font-mono text-sm placeholder:text-muted focus:border-violet focus:outline-none focus:shadow-neon-violet transition"
          />

          <div className="mt-4 flex items-center justify-between flex-wrap gap-3">
            <div className="flex gap-2 flex-wrap">
              {PRESETS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setIntent(s)}
                  className={`clip-cyber-sm border border-border px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest text-muted hover:text-text hover:border-violet/60 transition ${focusRing}`}
                >
                  ▸ {s.slice(0, 36)}
                </button>
              ))}
            </div>
            <Button type="submit" disabled={!intent.trim() || plan.pending}>
              {plan.pending ? "◉ Decomposing…" : "Decompose ▸"}
            </Button>
          </div>

          {plan.error && (
            <div
              role="alert"
              className="mt-4 clip-cyber-sm border border-magenta/40 bg-magenta/5 px-4 py-3 font-mono text-xs text-magenta"
            >
              {plan.error}
            </div>
          )}
        </form>
      </Card>

      <AnimatePresence>
        {plan.data && <ExecutionPlan plan={plan.data} />}
      </AnimatePresence>
    </div>
  );
}
