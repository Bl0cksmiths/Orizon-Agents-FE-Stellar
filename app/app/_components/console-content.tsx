"use client";
/**
 * Wrapper for everything to the right of the sidebar (topbar + main).
 *
 * While the mobile nav drawer is open it sets the `inert` attribute so the
 * background content leaves the tab order and the accessibility tree —
 * without this, the drawer's aria-modal was a lie: tab could still reach
 * topbar and page content behind the dialog.
 *
 * The attribute is toggled via ref because @types/react 18 doesn't type the
 * `inert` prop yet.
 */
import { useEffect, useRef } from "react";
import { useMobileNav } from "./mobile-nav-context";

export function ConsoleContent({ children }: { children: React.ReactNode }) {
  const { open } = useMobileNav();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open) el.setAttribute("inert", "");
    else el.removeAttribute("inert");
  }, [open]);

  return (
    <div ref={ref} className="lg:pl-60">
      {children}
    </div>
  );
}
