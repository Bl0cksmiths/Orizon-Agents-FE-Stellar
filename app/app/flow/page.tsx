"use client";
import { m } from "framer-motion";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ErrorNote } from "@/components/ui/error-note";
import { Skeleton } from "@/components/ui/skeleton";
import { getFlow } from "@/lib/api";
import { useFetch } from "@/lib/use-fetch";

export default function FlowPage() {
  const {
    data: flow,
    error,
    loading,
    retrying,
    reload,
  } = useFetch(getFlow, []);

  // Every skeleton on this page is gated on `!error` rather than on `loading`,
  // so an automatic retry — which flips `loading` back to true per attempt —
  // leaves the error card in place instead of alternating with the shimmer.
  // `retrying` covers the backoff gaps between attempts, when no request is in
  // flight but the hook has one scheduled.
  const reconnecting = retrying || loading;

  const nodeById = flow
    ? Object.fromEntries(flow.nodes.map((n) => [n.id, n]))
    : {};

  // Widest fan-out in the graph: the largest number of edges leaving a single
  // node, i.e. how many branches run in parallel at the graph's widest point.
  // Derived from the payload — the flow API carries no cost or branch counts,
  // so anything it does not describe is not displayed.
  const parallelBranches = (() => {
    if (!flow) return 0;
    const outDegree = new Map<string, number>();
    for (const [from] of flow.edges) {
      outDegree.set(from, (outDegree.get(from) ?? 0) + 1);
    }
    return outDegree.size === 0 ? 0 : Math.max(...outDegree.values());
  })();

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Flow</h1>
          <p className="mt-1 text-sm text-muted">
            Chain agents with conditional logic and parallel branches.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled title="coming soon">
            ↻ Reset
          </Button>
          <Button size="sm" disabled title="coming soon">
            + Save workflow
          </Button>
        </div>
      </div>

      <Card className="!p-0 overflow-hidden">
        <div className="flex items-center justify-between border-b border-border bg-surface/80 px-4 py-2.5">
          <div className="flex items-center gap-3">
            <Badge tone="violet" dot>
              autonomous-growth.flow
            </Badge>
            <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-muted">
              {flow
                ? `${flow.nodes.length} nodes · ${flow.edges.length} edges`
                : "loading…"}
            </span>
          </div>
          <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-cyan">
            ◉ live preview
          </span>
        </div>

        {/* Nodes are positioned by percentage inside a clipped canvas and are
            each ≥140px wide, so a node near x=96% has nowhere to render on a
            narrow viewport. Below md the same graph is listed instead. */}
        <div className="relative hidden h-[520px] w-full bg-[#060010] overflow-hidden md:block">
          <div className="absolute inset-0 grid-bg opacity-60" />
          {!flow && !error && (
            <div className="absolute inset-0 grid place-items-center">
              <Skeleton className="h-40 w-[80%]" />
            </div>
          )}
          {error && (
            <div className="absolute inset-0 grid place-items-center p-4">
              <ErrorNote onRetry={reload} retrying={reconnecting}>
                backend offline — {error}
              </ErrorNote>
            </div>
          )}
          {flow && (
            // Points are percentages of this inset box, not of the canvas: a
            // node is centred on its point and at least 140px wide, so one at
            // x=4% or x=96% needs half its width of margin to stay on screen.
            <div className="absolute inset-x-20 inset-y-10">
              <svg
                viewBox="0 0 100 100"
                className="absolute inset-0 h-full w-full"
                preserveAspectRatio="none"
              >
                <defs>
                  <linearGradient id="edge" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#B026FF" />
                    <stop offset="100%" stopColor="#00FFD1" />
                  </linearGradient>
                  <marker
                    id="arrow"
                    viewBox="0 0 10 10"
                    refX="8"
                    refY="5"
                    markerWidth="4"
                    markerHeight="4"
                    orient="auto"
                  >
                    <path d="M0,0 L10,5 L0,10 z" fill="#00FFD1" />
                  </marker>
                </defs>
                {flow.edges.map(([from, to], i) => {
                  const a = nodeById[from];
                  const b = nodeById[to];
                  if (!a || !b) return null;
                  return (
                    <m.path
                      key={`${from}-${to}`}
                      d={`M${a.x},${a.y} C${(a.x + b.x) / 2},${a.y} ${(a.x + b.x) / 2},${b.y} ${b.x},${b.y}`}
                      stroke="url(#edge)"
                      strokeWidth="0.3"
                      strokeDasharray="1 1"
                      fill="none"
                      markerEnd="url(#arrow)"
                      initial={{ pathLength: 0, opacity: 0 }}
                      animate={{ pathLength: 1, opacity: 1 }}
                      transition={{ duration: 0.7, delay: 0.15 * i }}
                    />
                  );
                })}
              </svg>

              {flow.nodes.map((n, i) => (
                <m.div
                  key={n.id}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.35, delay: 0.08 * i }}
                  className="absolute"
                  // The centring goes through motion's own x/y. A plain
                  // `transform` here was overwritten by the scale animation,
                  // so every node hung off its point by its top-left corner:
                  // the edges met corners, and the last node ran out past the
                  // canvas edge at every width.
                  style={{
                    left: `${n.x}%`,
                    top: `${n.y}%`,
                    x: "-50%",
                    y: "-50%",
                  }}
                >
                  <div className="clip-cyber-sm border border-violet/60 bg-surface/80 px-4 py-2.5 shadow-neon-violet backdrop-blur hover:border-violet transition min-w-[140px]">
                    <div className="font-mono text-[9px] uppercase tracking-[0.3em] text-cyan">
                      ▸ {n.sub}
                    </div>
                    <div className="font-mono text-sm">{n.label}</div>
                  </div>
                </m.div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-[#060010] p-4 md:hidden">
          {!flow && !error && <Skeleton className="h-40 w-full" />}
          {error && (
            <ErrorNote onRetry={reload} retrying={reconnecting}>
              backend offline — {error}
            </ErrorNote>
          )}
          {flow && (
            <>
              <ol className="space-y-2">
                {flow.nodes.map((n, i) => (
                  <li
                    key={n.id}
                    className="clip-cyber-sm border border-violet/60 bg-surface/80 px-4 py-2.5"
                  >
                    <div className="font-mono text-[9px] uppercase tracking-[0.3em] text-cyan">
                      {i + 1} ▸ {n.sub}
                    </div>
                    <div className="font-mono text-sm">{n.label}</div>
                  </li>
                ))}
              </ol>
              <div className="mt-4 font-mono text-[10px] uppercase tracking-[0.25em] text-muted">
                ▸ edges
              </div>
              <ul className="mt-2 space-y-1">
                {flow.edges.map(([from, to]) => (
                  <li
                    key={`${from}-${to}`}
                    className="font-mono text-[11px] text-muted break-words"
                  >
                    {nodeById[from]?.label ?? from} →{" "}
                    {nodeById[to]?.label ?? to}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </Card>

      {/* Every tile below is computed from the loaded flow. The row is hidden
          until the payload arrives so no tile can show a number the backend
          never sent. */}
      {flow && (
        <div className="grid gap-4 md:grid-cols-3">
          {[
            { h: "Nodes", v: String(flow.nodes.length) },
            { h: "Edges", v: String(flow.edges.length) },
            { h: "Parallel branches", v: String(parallelBranches) },
          ].map((s) => (
            <Card key={s.h}>
              <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-muted mb-2">
                {s.h}
              </div>
              <div className="font-mono text-2xl neon-text">{s.v}</div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
