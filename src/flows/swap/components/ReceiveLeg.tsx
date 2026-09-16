// The "You receive" leg of the swap: the quote and the asset it is in, as one
// panel mirroring "You pay" above it.
//
// The figure is the quote's `credit`, not the venue's `expectedOut`. The swap
// encodes exactly this as the deposit leg's `publicIn`, and both the leg-2
// protocol fee and the relayer's flush note come out of it, so `minOut / scale`
// overstates the credit by both. It is a fixed amount rather than a floor: a
// better fill goes to the treasury as dust, never to the wallet. Hence a
// sub-line that promises no upside — "exactly this, or the trade reverts" —
// never "at least".

import type { SwapQuote } from "@lelantos-org/sdk";
import { type ReactNode, useId } from "react";
import type { RegisteredAsset } from "@/config/chains";
import { assetUsd, usePrices } from "@/features/assets";
import { cx } from "@/shared/lib/cx";
import { formatAmountForAsset } from "@/shared/lib/format/asset";
import { formatUsd } from "@/shared/lib/format/money";
import { type ReceiveLine, receiveLine, venueLabel } from "../swap-copy";
import "../swap.css";

export interface ReceiveLegProps {
  outAsset: RegisteredAsset | undefined;
  /// The out-asset trigger, beside the figure.
  picker: ReactNode;
  quote: SwapQuote | undefined;
  ageSecs: number | undefined;
  stale: boolean;
  onRefresh(): void;
  refreshing: boolean;
  /// A request is in flight or the debounce is catching up.
  quoting: boolean;
  error: Error | null;
}

export function ReceiveLeg({
  outAsset,
  picker,
  quote,
  ageSecs,
  stale,
  onRefresh,
  refreshing,
  quoting,
  error,
}: ReceiveLegProps) {
  const labelId = useId();
  const prices = usePrices();

  // Only against the quote's own out asset: the pair may have moved on while a
  // refetch for the new one is in flight.
  const received = quote && outAsset?.id === quote.assetOut.id ? quote.credit.amount : undefined;
  const usd = received !== undefined && outAsset ? assetUsd(received, outAsset, prices) : undefined;

  const figure =
    received !== undefined && outAsset
      ? formatAmountForAsset(received, outAsset)
      : quoting || quote
        ? "…"
        : "0";

  const line = receiveLine({
    quoted: !!quote,
    credited: received !== undefined,
    error,
    stale,
    quoting,
  });
  const subTone = line === "quote-failed" ? "err" : line === "stale" ? "warn" : undefined;
  const sub: Record<ReceiveLine, ReactNode> = {
    "quote-failed": (
      <>
        <span className="swap-leg__msg">Couldn't get a quote.</span>
        <button type="button" className="link-btn swap-leg__retry" onClick={onRefresh}>
          Try again
        </button>
      </>
    ),
    stale: "This quote expired — refresh it with ↻",
    credited:
      usd === undefined ? (
        "Exactly this, or the trade reverts"
      ) : (
        <>
          ≈ {formatUsd(usd)} · <span>exactly this, or the trade reverts</span>
        </>
      ),
    pricing: "Working out what reaches your balance…",
    fetching: "Fetching a quote…",
    empty: "Enter an amount to see a quote",
  };

  return (
    <section
      className={cx("swap-leg", "swap-leg--receive", stale && "swap-leg--stale")}
      aria-labelledby={labelId}
    >
      <div className="swap-leg__hdr">
        <span className="swap-leg__lbl" id={labelId}>
          You receive
        </span>
        {quote ? (
          <span className="swap-leg__badges">
            <span className="badge badge--accent swap-venue">{venueLabel(quote.venue)}</span>
            <button
              type="button"
              className="swap-age"
              onClick={onRefresh}
              disabled={refreshing}
              aria-label={
                refreshing ? "Refreshing the quote" : `Quoted ${ageSecs ?? 0} seconds ago — refresh`
              }
            >
              {refreshing ? "…" : `${ageSecs ?? 0}s ↻`}
            </button>
          </span>
        ) : null}
      </div>
      <div className="swap-leg__row">
        <output
          className={cx("figure swap-leg__amt", received === undefined && "swap-leg__amt--none")}
          aria-labelledby={labelId}
        >
          {figure}
        </output>
        {picker}
      </div>
      <p className={cx("swap-leg__sub", subTone && `swap-leg__sub--${subTone}`)}>{sub[line]}</p>
    </section>
  );
}
