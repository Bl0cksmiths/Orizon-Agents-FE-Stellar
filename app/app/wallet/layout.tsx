import type { Metadata } from "next";

// The page is a client component and cannot export metadata; this server
// layout supplies the per-route title the console layout's "%s · Orizon
// Agents" template completes.
export const metadata: Metadata = { title: "Wallet" };

export default function WalletLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
