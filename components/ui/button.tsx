import Link from "next/link";
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { focusRing } from "@/lib/ui";
import { cn } from "@/lib/utils";

type Variant = "primary" | "outline" | "ghost" | "cyan";
type Size = "sm" | "md" | "lg";

// `clip-cyber` clips anything painted outside the element (offset rings,
// shadows), so the shared inset focus ring is the only visible option here.
const base = `relative inline-flex items-center justify-center gap-2 font-mono uppercase tracking-[0.18em] transition-all duration-200 disabled:opacity-50 disabled:pointer-events-none select-none clip-cyber ${focusRing}`;

const variants: Record<Variant, string> = {
  primary:
    "bg-violet text-white shadow-neon-violet hover:shadow-[0_0_0_1px_rgba(176,38,255,0.8),0_0_40px_rgba(176,38,255,0.55)] hover:brightness-110",
  cyan: "bg-cyan text-[#002219] shadow-neon-cyan hover:brightness-110",
  // The border is drawn by <CyberBorder> rather than `border-*`: a CSS border
  // runs only along the box's four sides, so `clip-cyber` cut it off at the two
  // chamfered corners and left the diagonals bare. The transparent border is
  // kept so every outline button keeps exactly its old size.
  outline:
    "group/outline bg-transparent text-text border border-transparent hover:bg-violet/10 hover:shadow-neon-violet",
  ghost: "bg-transparent text-muted hover:text-text hover:bg-white/5",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-[10px]",
  md: "h-10 px-5 text-xs",
  lg: "h-12 px-7 text-sm",
};

/**
 * A 1px ring in the shape of a `clip-cyber` box whose corners are cut by
 * `cut` px: the outer outline, then the same outline 1px inside it, filled
 * even-odd so only the band between them paints. On the 45° cuts the inner
 * corner sits `cut + √2 − 1` px in, which keeps the diagonal band 1px thick
 * like the straight ones.
 */
export function cyberRing(cut: number): string {
  const c = `${cut}px`;
  const d = `${(cut + Math.SQRT2 - 1).toFixed(3)}px`;
  const far = (by: string) => `calc(100% - ${by})`;
  return `polygon(evenodd, ${[
    // outer, clockwise from the top-left
    `0 0`,
    `${far(c)} 0`,
    `100% ${c}`,
    `100% 100%`,
    `${c} 100%`,
    `0 ${far(c)}`,
    `0 0`,
    // inner, 1px in
    `1px 1px`,
    `${far(d)} 1px`,
    `${far("1px")} ${d}`,
    `${far("1px")} ${far("1px")}`,
    `${d} ${far("1px")}`,
    `1px ${far(d)}`,
    `1px 1px`,
  ].join(", ")})`;
}

/**
 * The border of a chamfered (`clip-cyber`, `clip-cyber-sm`) control, diagonals
 * included. Absolutely placed over its parent, which must be `relative`; its
 * colour is its background, so set it with `bg-*` classes.
 */
export function CyberBorder({
  cut = 12,
  className,
}: {
  /** The corner cut: 12 for `clip-cyber`, 8 for `clip-cyber-sm`. */
  cut?: 12 | 8;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      data-cyber-border=""
      style={{ clipPath: cyberRing(cut) }}
      className={cn(
        "pointer-events-none absolute inset-0 transition-colors duration-200",
        className,
      )}
    />
  );
}

/** The outline variant's ring, brightening on hover as its border used to. */
const outlineBorder = (
  <CyberBorder className="bg-violet/60 group-hover/outline:bg-violet" />
);

type Common = {
  variant?: Variant;
  size?: Size;
  className?: string;
  children: ReactNode;
};

type AsButton = Common &
  ButtonHTMLAttributes<HTMLButtonElement> & { href?: undefined };
type AsLink = Common & { href: string };

export const Button = forwardRef<HTMLButtonElement, AsButton>(
  (
    { variant = "primary", size = "md", className, children, ...props },
    ref,
  ) => (
    <button
      ref={ref}
      className={cn(base, variants[variant], sizes[size], className)}
      {...props}
    >
      {variant === "outline" && outlineBorder}
      {children}
    </button>
  ),
);
Button.displayName = "Button";

export function ButtonLink({
  variant = "primary",
  size = "md",
  className,
  children,
  href,
}: AsLink & { variant?: Variant; size?: Size }) {
  return (
    <Link
      href={href}
      className={cn(base, variants[variant], sizes[size], className)}
    >
      {variant === "outline" && outlineBorder}
      {children}
    </Link>
  );
}
