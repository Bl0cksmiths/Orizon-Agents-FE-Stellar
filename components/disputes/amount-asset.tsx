"use client";
/**
 * The asset every amount on the receipt and the dispute form is denominated
 * in, handed down once from the page that read the network.
 *
 * A context rather than a prop because the figures sit five components deep
 * — a step's price, its payout, its credit, the dispute receipt under it, the
 * dialog — and every one of them has to print the SAME unit: the network
 * route's `asset`, through `assetLabel`, never the "usdc" in a field name.
 * Outside a provider the asset is unknown, and amounts print bare rather than
 * guess one.
 */
import { createContext, useCallback, useContext, type ReactNode } from "react";
import { formatAmount } from "@/lib/disputes";

const AmountAssetContext = createContext<string | null | undefined>(undefined);

export function AmountAssetProvider({
  asset,
  children,
}: {
  /** The network route's `asset` ("native" on testnet); null or undefined
   *  while it is unknown. */
  asset: string | null | undefined;
  children: ReactNode;
}) {
  return (
    <AmountAssetContext.Provider value={asset}>
      {children}
    </AmountAssetContext.Provider>
  );
}

/** `formatAmount` bound to the provided asset. */
export function useFormatAmount(): (n: number) => string {
  const asset = useContext(AmountAssetContext);
  return useCallback((n: number) => formatAmount(n, asset), [asset]);
}
