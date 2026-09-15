import Link from "next/link";
import { focusRing } from "@/lib/ui";
import { cn } from "@/lib/utils";

export function Logo({
  className,
  href = "/",
}: {
  className?: string;
  href?: string;
}) {
  return (
    <Link
      href={href}
      aria-label="Orizon Agents — home"
      className={cn(
        "inline-flex items-center gap-2.5 group select-none",
        focusRing,
        className,
      )}
    >
      <svg
        viewBox="0 0 140 110"
        fill="none"
        aria-hidden="true"
        className="logo-sunrise h-8 w-10 drop-shadow-[0_0_6px_rgba(176,38,255,0.7)]"
      >
        <defs>
          <linearGradient id="logo-sun" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#FF2E9A" />
            <stop offset="1" stopColor="#B026FF" />
          </linearGradient>
          <clipPath id="logo-horizon">
            <rect x="0" y="0" width="140" height="66" />
          </clipPath>
        </defs>
        <circle
          cx="70"
          cy="70"
          r="37"
          stroke="url(#logo-sun)"
          strokeWidth="7"
          clipPath="url(#logo-horizon)"
        />
        <rect x="4" y="68" width="132" height="4" fill="#00FFD1" />
        <rect
          x="24"
          y="80"
          width="92"
          height="3"
          fill="rgba(0,255,209,0.5)"
          className="logo-shimmer"
        />
        <rect
          x="42"
          y="90"
          width="56"
          height="2"
          fill="rgba(0,255,209,0.3)"
          className="logo-shimmer logo-shimmer-delay"
        />
      </svg>
      <span className="flex flex-col leading-none">
        <span className="font-display text-[13px] tracking-[0.28em] text-text neon-text">
          ORIZON<span className="text-cyan">_</span>
        </span>
        <span className="mt-1 ml-[0.52em] font-techmono text-[7px] tracking-[0.52em] text-muted">
          AGENTS
        </span>
      </span>
    </Link>
  );
}
