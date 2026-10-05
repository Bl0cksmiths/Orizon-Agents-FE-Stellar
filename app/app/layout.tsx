import type { Metadata } from "next";
import { Sidebar } from "./_components/sidebar";
import { Topbar } from "./_components/topbar";
import { GridBg } from "@/components/ui/grid-bg";
import { ConsoleContent } from "./_components/console-content";
import { MobileNavProvider } from "./_components/mobile-nav-context";
import { MotionProvider } from "@/components/ui/motion-provider";

import { HORIZON_URL, SOROBAN_RPC_URL } from "@/lib/env";

// Origins the console talks to from the browser — sourced from the shared
// validated network config, so the preconnect hints below always match the
// endpoints actually fetched.
const HORIZON_ORIGIN = new URL(HORIZON_URL).origin;
const SOROBAN_RPC_ORIGIN = new URL(SOROBAN_RPC_URL).origin;

export const metadata: Metadata = {
  title: {
    default: "Console — Orizon Agents",
    template: "%s · Orizon Agents",
  },
  robots: {
    index: false,
    follow: false,
  },
};

export default function AppLayout({ children }: { children: React.ReactNode }) {
  // framer-motion animates the console only, so its provider (and the
  // animation features it fetches) lives here rather than in the root layout
  // the public pages share.
  return (
    <MotionProvider>
      <MobileNavProvider>
        <link rel="preconnect" href={HORIZON_ORIGIN} crossOrigin="" />
        {SOROBAN_RPC_ORIGIN !== HORIZON_ORIGIN && (
          <link rel="preconnect" href={SOROBAN_RPC_ORIGIN} crossOrigin="" />
        )}
        <div className="relative min-h-screen">
          <GridBg fade={false} className="opacity-40" />
          <Sidebar />
          <ConsoleContent>
            <Topbar />
            <main
              id="main"
              className="relative px-4 sm:px-6 md:px-8 py-6 md:py-8"
            >
              {children}
            </main>
          </ConsoleContent>
        </div>
      </MobileNavProvider>
    </MotionProvider>
  );
}
