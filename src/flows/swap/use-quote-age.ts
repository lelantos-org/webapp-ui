// How old the displayed quote is, and whether that has passed the point where
// the form refuses to submit against it.
//
// Its own hook because it owns a 1Hz timer, and the gating is what keeps that
// timer from being a permanent cost: `now` drives the age counter alone, so it
// ticks only while a quote exists and is still fresh. Ungated, it would
// re-render the whole swap form subtree once a second for the life of the
// route, including while the tab sits unused on a stale quote.

import type { SwapQuote } from "@lelantos-org/sdk";
import { useEffect, useState } from "react";
import { QUOTE_STALE_SECS } from "./use-swap-quote";

export interface QuoteAge {
  /// Seconds since the quote was issued, or `undefined` with no quote to age.
  ageSecs: number | undefined;
  /// Past `QUOTE_STALE_SECS`. The submit is blocked on this.
  stale: boolean;
}

const nowSecs = () => Math.floor(Date.now() / 1000);

export function useQuoteAge(quote: SwapQuote | undefined): QuoteAge {
  const [now, setNow] = useState(nowSecs);
  // `quotedAt` is when the venue was asked, in unix seconds; a clock behind it
  // reads as fresh rather than as a negative age.
  const ageSecs = quote ? Math.max(0, now - quote.quotedAt) : undefined;
  const stale = ageSecs !== undefined && ageSecs > QUOTE_STALE_SECS;

  // Resynced on entry, so a quote arriving after a pause is not measured
  // against a clock that stopped ticking while the effect was torn down.
  useEffect(() => {
    if (!quote || stale) return;
    setNow(nowSecs());
    const id = setInterval(() => setNow(nowSecs()), 1000);
    return () => clearInterval(id);
  }, [quote, stale]);

  return { ageSecs, stale };
}
