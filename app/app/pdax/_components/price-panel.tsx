"use client";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ErrorNote } from "@/components/ui/error-note";
import { getPdaxPrice, pdaxFirmQuote } from "@/lib/pdax";
import type { PdaxSide } from "@/lib/pdax-types";
import { inputCls } from "@/lib/ui";
import { useAsyncAction } from "@/lib/use-async-action";

/**
 * Indicative price + firm-quote console for a PHP pair (default USDC).
 *
 * No `StaleBadge` here, deliberately, even though the panel prints money:
 * staleness means a real value is on screen and a later refresh failed, and
 * nothing on this panel refreshes. `useAsyncAction` runs only on a click, and
 * `run()` calls `reset()` first, so a failed quote leaves an error and no
 * price rather than a frozen one. A price is only ever shown when the request
 * that produced it succeeded.
 */
export function PricePanel() {
  const [side, setSide] = useState<PdaxSide>("buy");
  const [quoteCurrency, setQuoteCurrency] = useState("USDC");
  const [baseQuantity, setBaseQuantity] = useState("100");

  // The firm flag rides along with the quote so a failed run can't leave
  // a stale "firm" badge on an indicative price (or vice versa).
  const {
    run: fetchQuote,
    data: result,
    error: err,
    pending: busy,
    reset,
  } = useAsyncAction(async (firmQuote: boolean) => {
    const params = {
      quote_currency: quoteCurrency,
      side,
      base_quantity: baseQuantity,
    };
    const quote = firmQuote
      ? await pdaxFirmQuote(params)
      : await getPdaxPrice(params);
    return { quote, firm: firmQuote };
  });

  const run = (firmQuote: boolean) => {
    reset(); // drop the previous quote while the new one is in flight
    void fetchQuote(firmQuote);
  };

  const quote = result?.quote ?? null;
  const firm = result?.firm ?? false;

  return (
    <Card>
      <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted">
        price &amp; quote
      </div>

      {/* One column below sm: three inputs across a ~380px viewport leave
          each field ~30px of usable text width once padding is counted. */}
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label className="space-y-1" htmlFor="pdax-side">
          <span className="text-[10px] text-muted">side</span>
          <select
            id="pdax-side"
            value={side}
            onChange={(e) => setSide(e.target.value as PdaxSide)}
            className={inputCls}
          >
            <option value="buy">buy</option>
            <option value="sell">sell</option>
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-[10px] text-muted">asset</span>
          <input
            value={quoteCurrency}
            onChange={(e) => setQuoteCurrency(e.target.value.toUpperCase())}
            className={inputCls}
          />
        </label>
        <label className="space-y-1">
          <span className="text-[10px] text-muted">quantity</span>
          <input
            value={baseQuantity}
            onChange={(e) => setBaseQuantity(e.target.value)}
            className={inputCls}
          />
        </label>
      </div>

      <div className="mt-4 flex gap-3">
        <Button
          size="sm"
          variant="outline"
          onClick={() => run(false)}
          disabled={busy}
        >
          {busy ? "◉ …" : "indicative price"}
        </Button>
        <Button
          size="sm"
          variant="cyan"
          onClick={() => run(true)}
          disabled={busy}
        >
          firm quote
        </Button>
      </div>

      {err && (
        <ErrorNote className="mt-3 border-0 bg-transparent p-0">
          {err}
        </ErrorNote>
      )}

      {quote && (
        <div className="mt-4 border border-border bg-bg/40 p-4 space-y-1">
          <div className="flex items-center justify-between">
            <span className="font-mono text-sm">
              {quote.side} {quote.base_quantity} {quote.quote_currency}
            </span>
            <Badge tone={firm ? "cyan" : "muted"}>
              {firm ? "firm" : "indicative"}
            </Badge>
          </div>
          <div className="font-mono text-xs text-muted">
            price {quote.price} {quote.base_currency} · total{" "}
            {quote.total_amount} {quote.base_currency}
          </div>
          {firm && quote.quote_id && (
            <div className="font-mono text-[10px] text-cyan break-all">
              quote_id {quote.quote_id} · expires {quote.expires_at}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
