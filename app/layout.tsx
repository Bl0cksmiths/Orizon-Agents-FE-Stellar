import type { Metadata, Viewport } from "next";
import {
  JetBrains_Mono,
  Inter,
  Michroma,
  Share_Tech_Mono,
} from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";
import { WalletProvider } from "@/lib/wallet";

const sans = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

// Decorative faces (logo wordmark, error headings, one tiny caption): loaded
// on use rather than preloaded on every route.
const displayFont = Michroma({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-display",
  display: "swap",
  preload: false,
});

const techMono = Share_Tech_Mono({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-techmono",
  display: "swap",
  preload: false,
});

export const metadata: Metadata = {
  title: "Orizon Agents — Orchestration for autonomous digital labor",
  description:
    "Orizon Agents is a decentralized orchestration layer where AI agents autonomously hire, pay, and verify each other to execute complex tasks.",
  metadataBase: new URL("https://orizons.xyz"),
  // No canonical here: whatever the root layout sets, every page without its
  // own inherits, so a canonical of "/" made the console and the 404 page
  // each claim to be the home page. Each public page names its own; the home
  // page's is in app/page.tsx.
  openGraph: {
    title: "Orizon Agents",
    description:
      "The orchestration layer for autonomous digital labor. Agents hire, pay, and verify each other — on-chain.",
    type: "website",
    url: "/",
    siteName: "Orizon Agents",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "Orizon Agents",
    description:
      "The orchestration layer for autonomous digital labor. Agents hire, pay, and verify each other — on-chain.",
  },
};

export const viewport: Viewport = {
  themeColor: "#0A0014",
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${sans.variable} ${mono.variable} ${displayFont.variable} ${techMono.variable}`}
    >
      <body className="noise bg-bg text-text font-sans antialiased">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:border focus:border-cyan focus:bg-surface focus:px-4 focus:py-2 focus:font-mono focus:text-xs focus:uppercase focus:tracking-[0.2em] focus:text-cyan"
        >
          Skip to content
        </a>
        {/* At the root because the public nav's Connect Wallet reads it too;
            the wallet kit itself loads only on connect (lib/wallet.tsx). */}
        <WalletProvider>{children}</WalletProvider>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
