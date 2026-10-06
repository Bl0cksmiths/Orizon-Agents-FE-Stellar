"use client";

import type { ReactNode } from "react";
import { Isolate } from "@/components/isolate";
import { WalletProvider, WalletUnavailable } from "@/lib/wallet";

/**
 * The wallet provider in a local boundary, for the root layout: if the
 * provider fails, the page renders under WalletUnavailable (wallet controls
 * say "Wallet unavailable") instead of the whole document becoming
 * app/global-error.tsx.
 *
 * A client component on purpose. The boundary needs the page twice, once
 * under each provider, and here the page (`children`) arrives once and is
 * reused on the client. Written out in the server layout, the page would be
 * sent twice in the RSC payload, the second copy as a reference to the
 * first; while that first copy waits on a client chunk, Next 14.2's React
 * resolves the reference to null, and hydration fails ("Cannot destructure
 * property 'parallelRouterKey'") on a share of loads.
 */
export function WalletBoundary({ children }: { children: ReactNode }) {
  return (
    <Isolate
      name="wallet"
      fallback={<WalletUnavailable>{children}</WalletUnavailable>}
    >
      <WalletProvider>{children}</WalletProvider>
    </Isolate>
  );
}
