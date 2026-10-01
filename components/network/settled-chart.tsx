import type { Measured } from "@/lib/network-stats";
import type { SettledDay } from "@/lib/types";

/** The window the measured overview's series covers. */
export const SERIES_DAYS = 14;

const W = 600;
const H = 140;
/** Surface gap between neighbouring bars, in viewBox units. */
const GAP = 2;

/** "Oct 2", read in UTC — the series' days are UTC dates, and a local
 * reading would shift every label a day west of Greenwich. */
export function formatDay(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

const plural = (n: number) => `${n} settled workflow${n === 1 ? "" : "s"}`;

/** The sentence a screen reader hears for the whole chart. */
export function seriesSummary(days: SettledDay[]): string {
  const total = days.reduce((sum, d) => sum + d.settled, 0);
  const peak = days.reduce((a, b) => (b.settled > a.settled ? b : a));
  return `Settled workflows per day, ${formatDay(days[0].date)} to ${formatDay(days[days.length - 1].date)}: ${plural(total)} in total, at most ${peak.settled} on ${formatDay(peak.date)}.`;
}

const EMPTY =
  "grid h-36 place-items-center border border-dashed border-border px-4 text-center font-mono text-[11px] text-muted";

/**
 * Workflows settled per day, as bars. Only the measured series is drawn:
 * a backend that does not report one gets the reason, and a window with
 * nothing settled says so in words rather than as a flat line that reads
 * like a broken chart.
 */
export function SettledChart({ series }: { series: Measured<SettledDay[]> }) {
  if (!series.ok) {
    return (
      <div className={EMPTY}>
        Settled-workflow history unavailable — {series.reason}.
      </div>
    );
  }
  const days = series.value;
  const max = Math.max(0, ...days.map((d) => d.settled));
  if (max === 0) {
    return (
      <div className={EMPTY}>
        No settled workflows in the last {days.length || SERIES_DAYS} days.
      </div>
    );
  }

  const slot = W / days.length;
  return (
    <figure>
      <div className="flex gap-2">
        {/* The y axis: the peak and the baseline. Hidden from assistive
            tech, which reads the summary and the table instead. */}
        <div
          aria-hidden
          className="flex h-36 flex-col justify-between text-right font-mono text-[10px] leading-none text-muted"
        >
          <span>{max}</span>
          <span>0</span>
        </div>
        <svg
          role="img"
          aria-label={seriesSummary(days)}
          viewBox={`0 0 ${W} ${H}`}
          className="h-36 min-w-0 flex-1"
          preserveAspectRatio="none"
        >
          <line
            x1="0"
            x2={W}
            y1="0.5"
            y2="0.5"
            stroke="currentColor"
            className="text-border"
            vectorEffect="non-scaling-stroke"
          />
          <line
            x1="0"
            x2={W}
            y1={H - 0.5}
            y2={H - 0.5}
            stroke="currentColor"
            className="text-muted/40"
            vectorEffect="non-scaling-stroke"
          />
          {days.map((d, i) => {
            const h = (d.settled / max) * (H - 2);
            return (
              <g key={d.date} data-day={d.date}>
                <title>{`${formatDay(d.date)}: ${plural(d.settled)}`}</title>
                {/* A full-height hit target, so a zero day still answers
                    hover with its date. */}
                <rect
                  x={i * slot}
                  y="0"
                  width={slot}
                  height={H}
                  fill="transparent"
                />
                <rect
                  x={i * slot + GAP / 2}
                  y={H - h}
                  width={Math.max(0, slot - GAP)}
                  height={h}
                  fill="#B026FF"
                />
              </g>
            );
          })}
        </svg>
      </div>
      <div
        aria-hidden
        className="mt-1 flex justify-between pl-6 font-mono text-[10px] text-muted"
      >
        <span>{formatDay(days[0].date)}</span>
        <span>{formatDay(days[days.length - 1].date)}</span>
      </div>
      <table className="sr-only">
        <caption>Settled workflows per day</caption>
        <thead>
          <tr>
            <th scope="col">Day</th>
            <th scope="col">Settled</th>
          </tr>
        </thead>
        <tbody>
          {days.map((d) => (
            <tr key={d.date}>
              <th scope="row">{formatDay(d.date)}</th>
              <td>{d.settled}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
