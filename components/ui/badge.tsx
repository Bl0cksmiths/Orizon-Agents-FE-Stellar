import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

type Tone = "violet" | "cyan" | "magenta" | "muted" | "success";

const tones: Record<Tone, string> = {
  violet: "bg-violet/15 text-violet-readable border-violet/40",
  cyan: "bg-cyan/10 text-cyan border-cyan/40",
  magenta: "bg-magenta/15 text-magenta border-magenta/40",
  muted: "bg-white/5 text-muted border-white/10",
  success: "bg-emerald-500/10 text-emerald-300 border-emerald-400/40",
};

export function Badge({
  children,
  tone = "violet",
  dot = false,
  className,
}: {
  children: ReactNode;
  tone?: Tone;
  dot?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 border px-2 py-0.5 text-[10px] font-mono uppercase tracking-widest",
        tones[tone],
        className,
      )}
    >
      {dot && (
        <span
          className={cn(
            "h-1.5 w-1.5 rounded-full animate-pulseGlow",
            tone === "cyan" && "bg-cyan shadow-[0_0_8px_#00FFD1]",
            tone === "violet" && "bg-violet shadow-[0_0_8px_#B026FF]",
            tone === "magenta" && "bg-magenta shadow-[0_0_8px_#FF2E9A]",
            tone === "success" && "bg-emerald-400 shadow-[0_0_8px_#34D399]",
            tone === "muted" && "bg-muted",
          )}
        />
      )}
      {children}
    </span>
  );
}
