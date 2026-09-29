"use client";
import { assetLabel } from "@/lib/money";
import { useId, useState } from "react";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { ErrorNote } from "@/components/ui/error-note";
import { KVRow } from "@/components/ui/kv-row";
import {
  DEFAULT_REP_PARAMS,
  lowerBoundBps,
  smoothedBps,
  scoreOutOfFive,
  type RepMathParams,
} from "@/lib/reputation-math";
import type { ReputationParams } from "@/lib/types";

/**
 * Interactive "probe the math" card — mirrors the backend's Bayesian
 * smoothing + Wilson lower bound client-side so visitors can see how prior
 * mass and settled evidence shape a routable score. Runs on
 * DEFAULT_REP_PARAMS until the live params arrive.
 *
 * The fallback is stated honestly: "loading…" only while a fetch is actually
 * in flight, and an announced error once it has failed — the numbers below are
 * then the client's own constants, not the floor the orchestrator routes on.
 */
export function ScoreCalculator({
  params,
  loading = false,
  error = null,
  retrying = false,
  onRetry,
  asset = null,
}: {
  params: ReputationParams | null;
  loading?: boolean;
  error?: string | null;
  /** An automatic retry is scheduled or in flight (`useFetch.retrying`). */
  retrying?: boolean;
  onRetry?: () => void;
  /** The network route's `asset`: what evidence weight is denominated in
   *  ("native" → XLM on testnet). Unknown → no unit, never "USDC". */
  asset?: string | null;
}) {
  const unit = assetLabel(asset);
  const p: RepMathParams = params ?? DEFAULT_REP_PARAMS;
  const uid = useId();
  const [mean, setMean] = useState(85);
  const [weight, setWeight] = useState(25);

  const smoothed = smoothedBps(mean * 100, weight, p);
  const lower = lowerBoundBps(smoothed, weight, p);
  const routable = lower >= p.floor_bps;

  const meanId = `${uid}-mean`;
  const weightId = `${uid}-weight`;

  return (
    <Card>
      <div className="mb-5">
        <h2 className="text-lg font-semibold">Score calculator</h2>
        <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-muted">
          probe the math — smoothing · wilson bound · floor
        </p>
        {/* The error wins over the "loading…" line: an automatic retry flips
            `loading` back to true, and a loading-first branch would blink the
            failure away and back once per attempt. */}
        {error ? (
          <ErrorNote
            className="mt-3 clip-cyber-sm"
            onRetry={onRetry}
            retrying={retrying || loading}
          >
            params unavailable — the math below runs on built-in defaults, not
            the live routing parameters. {error}
          </ErrorNote>
        ) : (
          !params && (
            <p className="mt-1 font-mono text-[10px] text-muted">
              {loading
                ? "defaults — live params loading…"
                : "defaults — live params unavailable"}
            </p>
          )
        )}
      </div>

      <div className="space-y-5">
        <div>
          <div className="flex items-baseline justify-between gap-4 mb-2">
            <label
              htmlFor={meanId}
              className="font-mono text-[10px] uppercase tracking-widest text-muted"
            >
              raw on-chain mean
            </label>
            <span className="font-mono text-sm text-text">
              ★ {scoreOutOfFive(mean * 100)}
              <span className="text-muted"> · {mean}/100</span>
            </span>
          </div>
          <input
            id={meanId}
            type="range"
            min={0}
            max={100}
            step={1}
            value={mean}
            onChange={(e) => setMean(Number(e.target.value))}
            className="w-full accent-violet"
          />
        </div>

        <div>
          <div className="flex items-baseline justify-between gap-4 mb-2">
            <label
              htmlFor={weightId}
              className="font-mono text-[10px] uppercase tracking-widest text-muted"
            >
              settled evidence
            </label>
            <span className="font-mono text-sm text-text">
              {weight}
              {unit ? ` ${unit}` : ""}
            </span>
          </div>
          <input
            id={weightId}
            type="range"
            min={0}
            max={500}
            step={1}
            value={weight}
            onChange={(e) => setWeight(Number(e.target.value))}
            className="w-full accent-violet"
          />
        </div>

        <div
          role="img"
          aria-label={`smoothed score ${scoreOutOfFive(smoothed)} of 5, lower bound ${scoreOutOfFive(lower)}, floor ${scoreOutOfFive(p.floor_bps)}`}
          className="relative h-1.5 w-full rounded-full bg-border/20"
        >
          <div
            className={cn(
              "h-full rounded-full",
              routable ? "bg-cyan" : "bg-magenta",
            )}
            style={{ width: `${smoothed / 100}%` }}
          />
          {/* brighter notch = wilson lower bound; faint tick = routing floor */}
          <span
            aria-hidden="true"
            className="absolute top-1/2 h-3 w-0.5 -translate-y-1/2 bg-text"
            style={{ left: `${lower / 100}%` }}
          />
          <span
            aria-hidden="true"
            className="absolute top-0 h-full w-px bg-text/40"
            style={{ left: `${p.floor_bps / 100}%` }}
          />
        </div>

        <dl className="space-y-2 font-mono text-sm">
          <KVRow
            k="smoothed score"
            value={`★ ${scoreOutOfFive(smoothed)}`}
            valueClassName="font-mono"
          />
          <KVRow
            k="wilson lower bound"
            value={`★ ${scoreOutOfFive(lower)}`}
            valueClassName="font-mono"
          />
          <KVRow k="routing">
            <span
              className={cn(
                "inline-flex items-center gap-1.5 border px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest",
                routable
                  ? "border-cyan/40 bg-cyan/10 text-cyan"
                  : "border-magenta/40 bg-magenta/15 text-magenta",
              )}
            >
              {routable
                ? "✓ routable"
                : "⚑ below floor — excluded at decompose"}
            </span>
          </KVRow>
        </dl>

        <p className="font-mono text-[10px] text-muted">
          mirrors backend math — prior ★{scoreOutOfFive(p.prior_bps)} carries{" "}
          {p.prior_weight_usdc} {unit || "units"} of mass; confidence grows with
          settled value, not clicks.
        </p>
      </div>
    </Card>
  );
}
