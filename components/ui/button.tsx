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
  // A CSS border runs only along the box's four sides, so `clip-cyber` cut it
  // off at the two chamfered corners and left the diagonals bare. The border
  // still draws the straight sides; `chamfer-edges` (globals.css) paints the
  // two diagonals in the same colour, `--edge`, which hover brightens.
  outline:
    "chamfer-edges bg-transparent text-text border [--edge:rgba(176,38,255,0.6)] border-[color:var(--edge)] hover:[--edge:#B026FF] hover:bg-violet/10 hover:shadow-neon-violet",
  ghost: "bg-transparent text-muted hover:text-text hover:bg-white/5",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-[10px]",
  md: "h-10 px-5 text-xs",
  lg: "h-12 px-7 text-sm",
};

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
    { variant = "primary", size = "md", className, children, style, ...props },
    ref,
  ) => (
    <button
      ref={ref}
      className={cn(base, variants[variant], sizes[size], className)}
      style={style}
      {...props}
    >
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
      {children}
    </Link>
  );
}
