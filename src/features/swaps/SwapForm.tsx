import { zodResolver } from "@hookform/resolvers/zod";
import { quoteAgeSecs, type SwapQuote } from "@lelantos-org/sdk/quoter";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { ActionForm } from "@/features/actions/forms/ActionForm";
import { AmountField } from "@/features/actions/forms/AmountField";
import { parseAmountSafe, validateAmount } from "@/features/actions/forms/amount-field";
import { useClearFinishedOp } from "@/features/actions/forms/use-clear-finished-op";
import { useSwap } from "@/features/actions/mutations";
import { AssetPicker } from "@/features/assets/AssetPicker";
import {
  DEFAULT_ASSET_ID,
  findAsset,
  useRegisteredAssets,
} from "@/features/assets/registered-assets";
import { useAssetBalance } from "@/features/assets/use-balances";
import { useActiveChain } from "@/features/chain/ChainProvider";
import { type SwapInput, swapSchema } from "@/features/swaps/schemas";
import { type QuoteRequest, useSwapQuote } from "@/features/swaps/use-swap-quote";
import { SyncErrorNotice } from "@/features/wallet/SyncErrorNotice";
import { formatAmountForAsset, parseAmountForAsset } from "@/shared/lib/format";

const SLIPPAGE_PRESETS_BPS = [10, 50, 100] as const;
const QUOTE_STALE_SECS = 30;
/// Any asset other than `DEFAULT_ASSET_ID`, so the pair starts valid: a swap
/// needs two distinct assets and `canQuote` rejects `assetIn === assetOut`.
const DEFAULT_SWAP_ASSET_OUT_ID = "2";
const DEFAULT_SLIPPAGE_BPS = 50;

export function SwapForm() {
  const { mutation: m, progress } = useSwap();
  const quoteM = useSwapQuote();
  const assets = useRegisteredAssets();
  const activeChain = useActiveChain();
  const clearFinished = useClearFinishedOp(m, progress);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<SwapInput>({
    resolver: zodResolver(swapSchema),
    defaultValues: {
      assetIn: DEFAULT_ASSET_ID,
      assetOut: DEFAULT_SWAP_ASSET_OUT_ID,
      amount: "",
      slippageBps: DEFAULT_SLIPPAGE_BPS,
    },
  });

  const wAssetIn = watch("assetIn");
  const wAssetOut = watch("assetOut");
  const wAmount = watch("amount");
  const wSlippage = watch("slippageBps");

  const inAsset = findAsset(assets, wAssetIn);
  const outAsset = findAsset(assets, wAssetOut);
  const inBalance = useAssetBalance(inAsset?.id)?.balance;

  const parsed = parseAmountSafe(wAmount, inAsset);
  const v = validateAmount(parsed, inAsset, inBalance);

  // Invalidate the quote whenever the (assetIn, assetOut, amount, slippage)
  // tuple changes — a stale quote would bind a wrong route to the proof.
  // Track the previous key in a ref so the effect doesn't re-fire on quote
  // arrival (which would reset the freshly-fetched data).
  const quoteKey = `${wAssetIn}|${wAssetOut}|${wAmount}|${wSlippage}`;
  const resetQuote = quoteM.reset;
  const prevKey = useRef(quoteKey);
  useEffect(() => {
    if (prevKey.current !== quoteKey) {
      prevKey.current = quoteKey;
      resetQuote();
    }
  }, [quoteKey, resetQuote]);

  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const id = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(id);
  }, []);

  const quote = quoteM.data;
  const quoteAge = quote ? quoteAgeSecs(quote, now) : undefined;
  const quoteStale = quoteAge !== undefined && quoteAge > QUOTE_STALE_SECS;

  const canQuote =
    !!inAsset && !!outAsset && wAssetIn !== wAssetOut && v.valid && !quoteM.isPending;

  const onGetQuote = () => {
    if (!inAsset || !outAsset) return;
    const amountInUnits = parseAmountForAsset(wAmount, inAsset.decimals, inAsset.scale);
    // MetaQuoter quotes against token base units. MASP skims its fee off
    // the gross publicOut before the wrapper sees the input, so the true
    // adapter-side input is slightly less; user's `slippageBps` floor
    // absorbs the difference.
    const req: QuoteRequest = {
      chainId: activeChain.chainId,
      tokenIn: inAsset.token,
      tokenOut: outAsset.token,
      amountIn: amountInUnits * inAsset.scale,
      slippageBps: wSlippage,
    };
    quoteM.mutate(req);
  };

  const submitDisabled = !v.valid || !quote || quoteStale || quoteM.isPending;

  const onSubmit = handleSubmit(async (values) => {
    if (!inAsset || !outAsset || !quote) return;
    const amount = parseAmountForAsset(values.amount, inAsset.decimals, inAsset.scale);
    await m.mutateAsync({ assetIn: inAsset.id, assetOut: outAsset.id, amount, quote });
    // The quote is bound to this exact amount and pair, so it cannot outlive
    // the submit — unlike the pair and slippage, which are the user's standing
    // choices. Amount only, as in the other forms.
    quoteM.reset();
    reset({ ...values, amount: "" });
  });

  return (
    <ActionForm
      submitLabel="swap"
      busy={m.isPending}
      error={m.error}
      onSubmit={onSubmit}
      submitDisabled={submitDisabled}
      progress={progress}
      txHash={m.data?.txHash}
    >
      <SyncErrorNotice />
      <AssetPicker
        label="from"
        value={wAssetIn}
        onChange={(next) => {
          clearFinished();
          setValue("assetIn", next, { shouldValidate: true });
        }}
        error={errors.assetIn?.message}
      />
      <input type="hidden" {...register("assetIn")} />
      <AssetPicker
        label="to"
        value={wAssetOut}
        onChange={(next) => {
          clearFinished();
          setValue("assetOut", next, { shouldValidate: true });
        }}
        error={errors.assetOut?.message}
      />
      <input type="hidden" {...register("assetOut")} />
      <AmountField
        inputProps={register("amount")}
        selected={inAsset}
        balance={inBalance}
        validation={v}
        formError={errors.amount?.message}
        hint={
          inBalance !== undefined && inAsset
            ? `balance ${formatAmountForAsset(inBalance, inAsset.decimals, inAsset.scale)} ${inAsset.symbol}`
            : undefined
        }
        onSetMax={(formatted) =>
          setValue("amount", formatted, { shouldDirty: true, shouldValidate: true })
        }
      />
      <SlippageField
        bps={wSlippage}
        onChange={(b) => setValue("slippageBps", b, { shouldValidate: true })}
        error={errors.slippageBps?.message}
      />
      <input type="hidden" {...register("slippageBps", { valueAsNumber: true })} />
      <div className="stack stack--sm">
        <button type="button" className="btn btn--ghost" onClick={onGetQuote} disabled={!canQuote}>
          {quoteM.isPending ? "fetching quote…" : quote ? "refresh quote" : "get quote"}
        </button>
        {quoteM.error ? <div className="err">{quoteM.error.message}</div> : null}
        {quote && outAsset ? (
          <QuoteCard
            quote={quote}
            outDecimals={outAsset.decimals}
            outScale={outAsset.scale}
            outSymbol={outAsset.symbol}
            ageSecs={quoteAge ?? 0}
            stale={quoteStale}
            slippageBps={wSlippage}
            onRefresh={onGetQuote}
            refreshing={quoteM.isPending}
          />
        ) : null}
      </div>
    </ActionForm>
  );
}

interface SlippageFieldProps {
  bps: number;
  onChange(bps: number): void;
  error?: string;
}

const SLIP_META: Record<number, { tag: string; tone: "ok" | "warn" }> = {
  10: { tag: "Tight", tone: "ok" },
  50: { tag: "Default", tone: "ok" },
  100: { tag: "Loose", tone: "warn" },
};

function SlippageField({ bps, onChange, error }: SlippageFieldProps) {
  const meta = SLIP_META[bps];
  return (
    <div className="fld slip">
      <div className="slip__hdr">
        <span className="fld__lbl">Max slippage</span>
        <span className={`slip__tag slip__tag--${meta?.tone ?? "ok"}`}>
          {meta?.tag ?? `${(bps / 100).toFixed(2)}%`}
        </span>
      </div>
      <div className="slip__opts" role="radiogroup" aria-label="slippage tolerance">
        {SLIPPAGE_PRESETS_BPS.map((b) => {
          const m = SLIP_META[b];
          const on = bps === b;
          return (
            // Native radios: the browser supplies arrow-key navigation and
            // roving focus that the equivalent ARIA pattern would have to
            // reimplement. The input is visually hidden; the label carries
            // the styling.
            <label key={b} className={`slip__opt ${on ? "slip__opt--on" : ""}`}>
              <input
                type="radio"
                name="slippage-preset"
                className="slip__radio"
                value={b}
                checked={on}
                onChange={() => onChange(b)}
              />
              <span className="slip__pct">{(b / 100).toFixed(b < 100 ? 2 : 1)}%</span>
              <span className="slip__sub">{m?.tag}</span>
            </label>
          );
        })}
      </div>
      <span className="slip__hint muted txt-xs">
        Trade reverts if price moves more than {(bps / 100).toFixed(2)}% before execution.
      </span>
      {error ? <span className="err txt-xs">{error}</span> : null}
    </div>
  );
}

interface QuoteCardProps {
  quote: SwapQuote;
  outDecimals: number;
  outScale: bigint;
  outSymbol: string;
  ageSecs: number;
  stale: boolean;
  slippageBps: number;
  onRefresh(): void;
  refreshing: boolean;
}

function QuoteCard({
  quote,
  outDecimals,
  outScale,
  outSymbol,
  ageSecs,
  stale,
  slippageBps,
  onRefresh,
  refreshing,
}: QuoteCardProps) {
  // Quote `expectedOut` / `minOut` are in token base units; convert to a
  // user-readable string by dividing by `scale * 10^decimals` — wrapper
  // semantics mean the B-note value is `minOut / scale` circuit units, so
  // the displayed value reflects what actually re-shields.
  const fmt = (v: bigint) => formatAmountForAsset(v / outScale, outDecimals, outScale);
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
        <span className="quote__num mono">{fmt(quote.expectedOut)}</span>
        <span className="quote__sym">{outSymbol}</span>
      </div>
      <div className="quote__rows">
        <div className="quote__row">
          <span className="muted">Minimum received</span>
          <span className="mono">
            {fmt(quote.minOut)} {outSymbol}
          </span>
        </div>
        <div className="quote__row">
          <span className="muted">Max slippage</span>
          <span>{slipPct}%</span>
        </div>
      </div>
      {stale ? <div className="quote__stale">Quote expired — refresh before swapping.</div> : null}
    </div>
  );
}
