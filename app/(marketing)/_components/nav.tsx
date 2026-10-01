"use client";

/**
 * The marketing site's top bar, shared by the home page and the public pages
 * (guide, evidence, demo, litepaper).
 *
 * From `lg`: the logo, then three items — the Platform and Resources menus
 * and the promoted Guide link — centred, then Connect Wallet (quiet) and
 * Launch App (primary). Below `lg`: the logo, Launch App and a toggle for the
 * full-height sheet. The links themselves live in ./nav/links.ts.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ButtonLink } from "@/components/ui/button";
import { ConnectWallet } from "@/components/ui/connect-wallet";
import { Logo } from "@/components/ui/logo";
import { focusRing } from "@/lib/ui";
import { cn } from "@/lib/utils";
import { GUIDE, isCurrent, MENUS, type NavGroup } from "./nav/links";
import { MobileMenu } from "./nav/mobile-menu";
import { CurrentMark, NavMenu } from "./nav/nav-menu";

export function Nav() {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [openMenu, setOpenMenu] = useState<NavGroup["id"] | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // A new page closes whatever was open on the last one.
  useEffect(() => {
    setOpenMenu(null);
    setSheetOpen(false);
  }, [pathname]);

  const guideCurrent = isCurrent(GUIDE, pathname);

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-50 transition-all duration-300",
        // An open menu over the hero gets the scrolled bar's backdrop too, so
        // its panel never floats on a transparent strip.
        scrolled || openMenu
          ? "border-b border-border bg-bg/70 backdrop-blur-xl"
          : "bg-transparent",
      )}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6 lg:grid lg:gap-8 lg:grid-cols-[1fr_auto_1fr]">
        <Logo className="shrink-0 justify-self-start" />

        <nav aria-label="Main" className="hidden lg:block">
          <ul className="flex items-center gap-2 xl:gap-4">
            {MENUS.map((group) => (
              <li key={group.id}>
                <MenuSlot
                  group={group}
                  openMenu={openMenu}
                  setOpenMenu={setOpenMenu}
                  pathname={pathname}
                />
              </li>
            ))}
            <li>
              <Link
                href={GUIDE.href}
                aria-current={guideCurrent ? "page" : undefined}
                className={cn(
                  "relative flex h-9 items-center whitespace-nowrap px-3 font-mono text-[11px] uppercase tracking-[0.22em] transition-colors",
                  guideCurrent ? "text-text" : "text-muted hover:text-text",
                  focusRing,
                )}
              >
                {GUIDE.label}
                <CurrentMark show={guideCurrent} />
              </Link>
            </li>
          </ul>
        </nav>

        {/* Below `sm` the row is tight — a 360px phone has room for the logo,
            Launch App and the toggle with little to spare — so the gaps
            close up and Launch App drops its arrow there. */}
        <div className="flex shrink-0 items-center gap-2 justify-self-end sm:gap-3">
          <ConnectWallet
            size="sm"
            variant="outline"
            showWalletName={false}
            className="hidden lg:flex"
          />
          <ButtonLink
            href="/app"
            size="sm"
            variant="primary"
            // 44px tall on a touch screen; a mouse keeps the compact bar.
            className="whitespace-nowrap [@media(pointer:coarse)]:min-h-11"
          >
            Launch App{" "}
            <span aria-hidden className="hidden sm:inline">
              ▸
            </span>
          </ButtonLink>
          <MobileMenu
            open={sheetOpen}
            onOpenChange={setSheetOpen}
            pathname={pathname}
          />
        </div>
      </div>
    </header>
  );
}

/** One menu, with its open state lifted so only one is open at a time. */
function MenuSlot({
  group,
  openMenu,
  setOpenMenu,
  pathname,
}: {
  group: NavGroup;
  openMenu: NavGroup["id"] | null;
  setOpenMenu: (id: NavGroup["id"] | null) => void;
  pathname: string | null;
}) {
  const onOpenChange = useCallback(
    (open: boolean) => setOpenMenu(open ? group.id : null),
    [group.id, setOpenMenu],
  );
  return (
    <NavMenu
      group={group}
      open={openMenu === group.id}
      onOpenChange={onOpenChange}
      pathname={pathname}
    />
  );
}
