import type { SwapQuote } from "@lelantos-org/sdk";
import { useEffect, useState } from "react";
import { QUOTE_STALE_SECS } from "./use-swap-quote";

export interface QuoteAge {
  /// Seconds since the quote was issued.
  ageSecs: number | undefined;
  /// Past `QUOTE_STALE_SECS`; blocks the submit.
  stale: boolean;
}

const nowSecs = () => Math.floor(Date.now() / 1000);

/// The quote's age, ticking once a second only while a fresh quote exists.
export function useQuoteAge(quote: SwapQuote | undefined): QuoteAge {
  const [now, setNow] = useState(nowSecs);
  const ageSecs = quote ? Math.max(0, now - quote.quotedAt) : undefined;
  const stale = ageSecs !== undefined && ageSecs > QUOTE_STALE_SECS;

  useEffect(() => {
    if (!quote || stale) return;
    setNow(nowSecs());
    const id = setInterval(() => setNow(nowSecs()), 1000);
    return () => clearInterval(id);
  }, [quote, stale]);

  return { ageSecs, stale };
}
