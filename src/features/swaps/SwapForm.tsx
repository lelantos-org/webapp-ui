import { zodResolver } from "@hookform/resolvers/zod";
import { quoteAgeSecs } from "@lelantos-org/sdk/quoter";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { ActionForm } from "@/features/actions/forms/ActionForm";
import { AmountField } from "@/features/actions/forms/AmountField";
import { parseAmountSafe, validateAmount } from "@/features/actions/forms/amount-field";
import { useClearFinishedOp } from "@/features/actions/forms/use-clear-finished-op";
import { useSubmitOnce } from "@/features/actions/forms/use-submit-once";
import { useSwap } from "@/features/actions/mutations";
import { useFeeBps } from "@/features/actions/use-fee-preview";
import { AssetPicker } from "@/features/assets/AssetPicker";
import {
  DEFAULT_ASSET_ID,
  findAsset,
  useRegisteredAssets,
} from "@/features/assets/registered-assets";
import { useAssetBalance } from "@/features/assets/use-balances";
import { useActiveChain } from "@/features/chain/ChainProvider";
import { QuoteCard } from "@/features/swaps/QuoteCard";
import { SlippageField } from "@/features/swaps/SlippageField";
import { type SwapInput, swapSchema } from "@/features/swaps/schemas";
import { type QuoteRequest, useSwapQuote } from "@/features/swaps/use-swap-quote";
import { SyncErrorNotice } from "@/features/wallet/SyncErrorNotice";
import { formatAmountForAsset, parseAmountForAsset } from "@/shared/lib/format";

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
    getValues,
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

  const quote = quoteM.data;
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  const quoteAge = quote ? quoteAgeSecs(quote, now) : undefined;
  const feeBps = useFeeBps();
  const quoteStale = quoteAge !== undefined && quoteAge > QUOTE_STALE_SECS;

  // `now` drives the quote's age counter only, so it ticks only while a quote
  // exists and is under QUOTE_STALE_SECS. Ungated, this re-renders the whole
  // form subtree once a second for the lifetime of the route. Resynced on
  // entry, so a quote arriving after a pause is not measured against a stale
  // clock.
  useEffect(() => {
    if (!quote || quoteStale) return;
    setNow(Math.floor(Date.now() / 1000));
    const id = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(id);
  }, [quote, quoteStale]);

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

  const onSubmit = handleSubmit(
    useSubmitOnce(async (values) => {
      if (!inAsset || !outAsset || !quote) return;
      const amount = parseAmountForAsset(values.amount, inAsset.decimals, inAsset.scale);
      await m.mutateAsync({ assetIn: inAsset.id, assetOut: outAsset.id, amount, quote });
      // The quote is bound to this exact amount and pair, so it cannot outlive
      // the submit — unlike the pair and slippage, which are the user's standing
      // choices. Amount only, as in the other forms.
      quoteM.reset();
      // Live values, not the submit-time snapshot: the pair and slippage are
      // editable throughout the tx, and rolling them back is not something the
      // user asked for.
      reset({ ...getValues(), amount: "" });
    }),
  );

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
            feeBps={feeBps}
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
