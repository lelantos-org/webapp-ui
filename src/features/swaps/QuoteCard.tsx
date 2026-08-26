// The quote panel: what the swap will credit, and how stale the figure behind it
// is.

import type { SwapQuote } from "@lelantos-org/sdk/quoter";
import { swapCredit } from "@/features/actions";
import { formatAmountForAsset } from "@/shared/lib/format";

interface QuoteCardProps {
  quote: SwapQuote;
  outDecimals: number;
  outScale: bigint;
  outSymbol: string;
  /// Protocol fee, needed to size the B-note. `undefined` until the read lands,
  /// in which case the card reports that rather than showing a figure the wallet
  /// will not honour.
  feeBps: bigint | undefined;
  /// What the relayer charges to flush the leg-2 deposit, in circuit units of the
  /// out asset. Also part of the B-note's size, and treated like `feeBps` while
  /// `undefined`.
  outDepositFee: bigint | undefined;
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
  outDepositFee,
  ageSecs,
  stale,
  slippageBps,
  onRefresh,
  refreshing,
}: QuoteCardProps) {
  // What the wallet is credited.
  //
  // Not `minOut / outScale`: `swapCredit` is the sizing `executeSwap` encodes as
  // the deposit leg's `publicIn`, and both the leg-2 protocol fee and the
  // relayer's flush note come out of it, so `minOut / scale` overstates the
  // credit by both. It is a fixed amount rather than a floor, so this figure is
  // both what is received and the minimum; `expectedOut` would imply upside that
  // does not reach the wallet.
  const received =
    feeBps === undefined || outDepositFee === undefined
      ? undefined
      : swapCredit({ minOut: quote.minOut, scaleOut: outScale, feeBps, depositFee: outDepositFee });
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
          {/* Slippage is a revert threshold rather than a range of outcomes: the
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
