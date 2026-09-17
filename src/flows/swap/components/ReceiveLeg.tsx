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
  picker: ReactNode;
  quote: SwapQuote | undefined;
  ageSecs: number | undefined;
  stale: boolean;
  onRefresh(): void;
  refreshing: boolean;
  quoting: boolean;
  error: Error | null;
}

/// The "You receive" leg: the quote's exact credit (not `expectedOut`), venue and age.
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
