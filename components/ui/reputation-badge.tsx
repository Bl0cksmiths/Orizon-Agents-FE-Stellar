import { cn } from "@/lib/utils";

/** bps is 0..10000 over a 0–100 rating scale → familiar 0–5 score. */
const score = (bps: number) => (bps / 2000).toFixed(2);

/**
 * Compact on-chain reputation chip.
 *
 * Cyan when the score is backed by on-chain evidence, violet-tinted with a
 * `≈` prefix when it is only the Bayesian prior, magenta when it sits below
 * the network floor. Meaning is never carried by color alone — the ≈ / ★ / ⚑
 * glyphs carry it for sighted readers, and an sr-only sentence (repeated as
 * the tooltip) carries the source, the score, the floor verdict and the
 * dispute rate for everyone else.
 *
 * The floor decision follows the backend's `passes_floor`: the Wilson lower
 * bound against the floor, never the displayed (smoothed) score. Callers
 * that gate on the floor must pass `lowerBoundBps` alongside `floorBps`; a
 * floor without a bound is stated as not judged, never judged on the score.
 */
export function ReputationBadge({
  bps,
  lowerBoundBps,
  source,
  degraded,
  count,
  disputeRateBps,
  floorBps,
  className,
}: {
  bps: number;
  lowerBoundBps?: number;
  /** `"onchain"` or `"prior"` today, but any string a newer backend sends
   *  reaches here as data, and absent is allowed. */
  source?: string | null;
  /** The on-chain read FAILED and this prior stands in for it — not a cold
   *  start. `source` alone reports both as "prior", which is what made the
   *  fail-open behaviour invisible in the first place. Optional: a caller
   *  that does not know simply gets the cold-start wording. */
  degraded?: boolean;
  count?: number;
  disputeRateBps?: number;
  floorBps?: number;
  className?: string;
}) {
  // Only "onchain" is evidence. "prior", a source a newer backend added, and
  // no source at all all take the humbler claim: shown as an estimate, never
  // as a measurement nobody made.
  const prior = source !== "onchain";
  // The floor gates on the lower bound, never on the headline score beside
  // it. With no bound passed the chip cannot judge the floor, and says so
  // rather than judging the smoothed score against it — the exact confusion
  // between the two numbers the floor exists to avoid.
  const floorUnjudged = floorBps != null && lowerBoundBps == null;
  const belowFloor =
    floorBps != null && lowerBoundBps != null && lowerBoundBps < floorBps;
  const clearsFloor =
    floorBps != null && lowerBoundBps != null && lowerBoundBps >= floorBps;
  const showCount = !prior && count != null && count > 0;
  const disputePct =
    disputeRateBps != null && disputeRateBps > 0
      ? (disputeRateBps / 100).toFixed(1)
      : null;

  const parts = [
    // "no on-chain ratings yet" is only true of a COLD START. A degraded read
    // reports `source: "prior"` too — the chain was unreadable and the network
    // prior was served in its place — and that agent may have a long rating
    // history we simply could not reach. Saying it has none is a false claim
    // about somebody's record, made identically on three surfaces: the
    // marketplace, the plan card and the operator dashboard.
    prior
      ? degraded
        ? `prior estimate ${score(bps)} — the on-chain read did not come back, so this is not a reading of this agent's history`
        : source === "prior"
          ? `prior estimate ${score(bps)} — no on-chain ratings yet`
          : // Not known to be a cold start either, so it claims neither.
            `estimate ${score(bps)} — not confirmed as an on-chain reading`
      : showCount
        ? `on-chain reputation ${score(bps)} from ${count} rated job${count === 1 ? "" : "s"}`
        : `on-chain reputation ${score(bps)}`,
    belowFloor ? `below the ${score(floorBps)} network floor` : null,
    clearsFloor ? `clears the ${score(floorBps)} network floor` : null,
    floorUnjudged
      ? `not judged against the ${score(floorBps)} network floor — its lower bound is not known`
      : null,
    disputePct ? `${disputePct}% disputed` : null,
  ].filter(Boolean);
  const label = parts.join(" · ");

  // The words are the chip's accessible text, in an sr-only span, and every
  // glyph and figure beside them is hidden from assistive technology. The
  // label used to ride on `aria-label`, which ARIA prohibits on a role-less
  // span: a screen reader that honours the prohibition heard only "3.50",
  // with no source, no floor and nothing to say it was an estimate.
  return (
    <span
      title={label}
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap border px-2 py-0.5 font-mono text-[10px] tracking-widest",
        belowFloor
          ? "border-magenta/40 bg-magenta/15 text-magenta"
          : prior
            ? "border-violet/25 bg-violet/10 text-muted"
            : "border-cyan/40 bg-cyan/10 text-cyan",
        className,
      )}
    >
      <span className="sr-only">{label}</span>
      <span aria-hidden="true">{prior ? "≈" : ""}★</span>
      <span aria-hidden="true">{score(bps)}</span>
      {showCount && (
        // Full tone: at 70% opacity the count on a below-floor chip was
        // 3.4:1 magenta on magenta, under the 4.5:1 a 10px figure needs.
        <span aria-hidden="true">· {count}</span>
      )}
      {disputePct && (
        <span aria-hidden="true" className="text-magenta">
          ⚑ {disputePct}%
        </span>
      )}
    </span>
  );
}
