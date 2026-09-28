"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Logo } from "@/components/ui/logo";
import { ButtonLink } from "@/components/ui/button";
import { ConnectWallet } from "@/components/ui/connect-wallet";
import { LIST_YOUR_AGENT_PATH } from "@/lib/guide/display";
import { cn } from "@/lib/utils";

// Section links are rooted at "/" so they also work from the guide pages,
// which share this nav; on the home page they still just scroll.
const links = [
  { href: "/#solution", label: "Product" },
  { href: "/#architecture", label: "Architecture" },
  { href: "/#reputation", label: "Reputation" },
  { href: "/#use-cases", label: "Use Cases" },
  { href: "/#roadmap", label: "Roadmap" },
  { href: LIST_YOUR_AGENT_PATH, label: "Guide" },
];

export function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const firstLinkRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Mobile menu: Escape closes, focus moves to the first link on open and
  // returns to the hamburger on close (same conventions as the app sidebar).
  useEffect(() => {
    if (!open) return;
    const opener = menuButtonRef.current;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    firstLinkRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      opener?.focus();
    };
  }, [open]);

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-50 transition-all duration-300",
        scrolled
          ? "bg-bg/70 backdrop-blur-xl border-b border-border"
          : "bg-transparent",
      )}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
        <Logo />
        <nav className="hidden items-center gap-6 xl:flex 2xl:gap-8">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="whitespace-nowrap font-mono text-[11px] uppercase tracking-[0.22em] text-muted hover:text-text transition-colors"
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-3">
          <ConnectWallet size="sm" className="hidden xl:flex" />
          <ButtonLink href="/app" size="sm" variant="primary">
            Launch App ▸
          </ButtonLink>
          <button
            ref={menuButtonRef}
            type="button"
            aria-expanded={open}
            aria-controls="marketing-mobile-menu"
            aria-label={open ? "Close menu" : "Open menu"}
            onClick={() => setOpen((v) => !v)}
            className="grid h-9 w-9 place-items-center text-muted hover:text-text transition-colors xl:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-cyan"
          >
            <svg
              viewBox="0 0 20 20"
              fill="none"
              className="h-5 w-5"
              aria-hidden="true"
            >
              {open ? (
                <path
                  d="M5 5l10 10M15 5L5 15"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              ) : (
                <path
                  d="M3 5h14M3 10h14M3 15h14"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              )}
            </svg>
          </button>
        </div>
      </div>
      {/* Mobile disclosure panel — same links as the desktop nav. */}
      <nav
        id="marketing-mobile-menu"
        aria-label="Mobile"
        className={cn(
          "border-b border-border bg-bg/95 px-6 pb-6 pt-2 backdrop-blur-xl xl:hidden",
          open ? "block" : "hidden",
        )}
      >
        <div className="flex flex-col gap-1">
          {links.map((l, i) => (
            <Link
              key={l.href}
              href={l.href}
              ref={i === 0 ? firstLinkRef : undefined}
              onClick={() => setOpen(false)}
              className="rounded-sm px-3 py-2.5 font-mono text-[11px] uppercase tracking-[0.22em] text-muted hover:bg-white/5 hover:text-text transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-cyan"
            >
              {l.label}
            </Link>
          ))}
        </div>
        <div className="mt-4 border-t border-border pt-4">
          <ConnectWallet size="sm" className="w-full" />
        </div>
      </nav>
    </header>
  );
}
