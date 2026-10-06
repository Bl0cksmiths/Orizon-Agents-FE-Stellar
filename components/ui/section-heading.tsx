import { cn } from "@/lib/utils";
import { entrance } from "./entrance";

/** A marketing section's eyebrow, title and subtitle, each revealed in turn
 * as it scrolls into view (the page mounts RevealOnScroll). */
export function SectionHeading({
  eyebrow,
  title,
  subtitle,
  align = "left",
  className,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  align?: "left" | "center";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "max-w-3xl",
        align === "center" && "mx-auto text-center",
        className,
      )}
    >
      {eyebrow && (
        <p
          style={entrance({ duration: 0.4, from: "translateY(8px)" })}
          className="reveal mb-4 inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.3em] text-cyan"
        >
          <span className="h-px w-8 bg-cyan/60" />
          {eyebrow}
        </p>
      )}
      <h2
        style={entrance({ delay: 0.05, from: "translateY(12px)" })}
        className="reveal text-[clamp(1.875rem,1.2rem+2.6vw,3rem)] font-semibold leading-[1.05] tracking-tight"
      >
        {title}
      </h2>
      {subtitle && (
        <p
          style={entrance({ delay: 0.1, from: "translateY(12px)" })}
          className="reveal mt-4 text-muted text-base md:text-lg max-w-2xl"
        >
          {subtitle}
        </p>
      )}
    </div>
  );
}
