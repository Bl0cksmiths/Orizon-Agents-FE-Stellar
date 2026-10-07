import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";
import { Logo } from "@/components/ui/logo";
import { focusRing } from "@/lib/ui";
import { cn } from "@/lib/utils";
import { GUIDE, RESOURCES } from "./links";

/** The pages the plain bar links to; the home page's sections stay a scroll
 * away, and the footer still lists everything. */
const PAGES = [GUIDE, ...RESOURCES.links];

/**
 * The marketing nav's stand-in when the interactive bar fails (../nav.tsx):
 * the same bar as plain links, with no menus, no sheet and no wallet, so it
 * needs no script to work and the page keeps its banner and its way out.
 */
export function StaticNav() {
  return (
    <header
      data-nav="static"
      className="fixed inset-x-0 top-0 z-50 border-b border-border bg-bg/70 backdrop-blur-xl"
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6">
        <Logo className="shrink-0" />
        <nav aria-label="Main" className="hidden lg:block">
          <ul className="flex items-center gap-2 xl:gap-4">
            {PAGES.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className={cn(
                    "flex h-9 items-center whitespace-nowrap px-3 font-mono text-[11px] uppercase tracking-[0.22em] text-muted transition-colors hover:text-text",
                    focusRing,
                  )}
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <ButtonLink
          href="/app"
          size="sm"
          variant="primary"
          className="whitespace-nowrap [@media(pointer:coarse)]:min-h-11"
        >
          Launch App
        </ButtonLink>
      </div>
    </header>
  );
}
