// The quote panel: what the swap will actually credit, and how stale the
// figure behind it is.

import type { SwapQuote } from "@lelantos-org/sdk/quoter";
import { sizeBNote } from "@lelantos-org/sdk/wallet";
import { formatAmountForAsset } from "@/shared/lib/format";

interface QuoteCardProps {
  quote: SwapQuote;
  outDecimals: number;
  outScale: bigint;
  outSymbol: string;
  /// Protocol fee, needed to size the B-note. `undefined` until the read
  /// lands, in which case the card says so rather than showing a figure the
  /// wallet will not honour.
  feeBps: bigint | undefined;
  ageSecs: number;
  stale: boolean;
  slippageBps: number;
  onRefresh(): void;
  refreshing: boolean;
}

export function QuoteCard({
  quote,
  outDecimals,
  outScale,
  outSymbol,
  feeBps,
  ageSecs,
  stale,
  slippageBps,
  onRefresh,
  refreshing,
}: QuoteCardProps) {
  // What the wallet is actually credited.
  //
  // Not `minOut / outScale`. `executeSwap` sizes the re-shielded B-note with
  // this same `sizeBNote` call and encodes the result as the deposit leg's
  // `publicIn` — the leg-2 protocol fee comes out on top of it,
  // so `minOut / scale` overstates the credit by roughly the fee. It is also
  // a *fixed* amount rather than a floor: the wrapper pulls only what the
  // B-note needs and any better-than-quoted fill is forwarded to the treasury
  // as dust. So this one number is both what you receive and the minimum, and
  // showing `expectedOut` as "you receive" promised upside that never arrives.
  const received = feeBps === undefined ? undefined : sizeBNote(quote.minOut, outScale, feeBps);
  const fmt = (v: bigint) => formatAmountForAsset(v / outScale, outDecimals, outScale);
  const fmtCircuit = (v: bigint) => formatAmountForAsset(v, outDecimals, outScale);
  const slipPct = (slippageBps / 100).toFixed(slippageBps < 100 ? 2 : 1);
  return (
    <div className={`quote ${stale ? "quote--stale" : ""}`}>
      <div className="quote__hdr">
        <span className="quote__lbl">You receive</span>
        <span className="quote__badges">
          <span className="quote__venue">{quote.venue}</span>
          <button
            type="button"
            className="quote__age"
            onClick={onRefresh}
            disabled={refreshing}
            title="refresh quote"
          >
            {refreshing ? "…" : `${ageSecs}s · ↻`}
          </button>
        </span>
      </div>
      <div className="quote__amt">
        <span className="quote__num mono">
          {received === undefined ? "…" : fmtCircuit(received)}
        </span>
        <span className="quote__sym">{outSymbol}</span>
      </div>
      <div className="quote__rows">
        <div className="quote__row">
          <span className="muted">Quoted at</span>
          <span className="mono">
            {fmt(quote.expectedOut)} {outSymbol}
          </span>
        </div>
        <div className="quote__row">
          {/* Slippage is a revert threshold here, not a range of outcomes: the
              amount above is fixed, and the trade reverts if the venue cannot
              cover it. */}
          <span className="muted">Reverts below</span>
          <span>{slipPct}%</span>
        </div>
      </div>
      {stale ? <div className="quote__stale">Quote expired — refresh before swapping.</div> : null}
    </div>
  );
}
