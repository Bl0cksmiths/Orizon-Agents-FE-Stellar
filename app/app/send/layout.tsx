import type { Metadata } from "next";

// The page is a client component and cannot export metadata; this server
// layout supplies the per-route title the console layout's "%s · Orizon
// Agents" template completes.
export const metadata: Metadata = { title: "Send XLM" };

export default function SendLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
