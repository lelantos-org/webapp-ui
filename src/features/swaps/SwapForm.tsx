import { zodResolver } from "@hookform/resolvers/zod";
import { quoteAgeSecs } from "@lelantos-org/sdk/quoter";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { ActionForm } from "@/features/actions/forms/ActionForm";
import { AmountField } from "@/features/actions/forms/AmountField";
import { parseAmountSafe, validateAmount } from "@/features/actions/forms/amount-field";
import { useAmountControls } from "@/features/actions/forms/use-amount-controls";
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
import { useAssetBalance, useAssetBalanceLabel } from "@/features/assets/use-balances";
import { useActiveChain } from "@/features/chain/ChainProvider";
import { QuoteCard } from "@/features/swaps/QuoteCard";
import { SlippageField } from "@/features/swaps/SlippageField";
import { type SwapInput, swapSchema } from "@/features/swaps/schemas";
import { QUOTE_STALE_SECS, useSwapQuote } from "@/features/swaps/use-swap-quote";
import { SyncErrorNotice } from "@/features/wallet/SyncErrorNotice";
import { formatAmountForAsset, parseAmountForAsset } from "@/shared/lib/format";

/// Any asset other than `DEFAULT_ASSET_ID`, so the pair starts valid: a swap
/// needs two distinct assets, and a matching pair leaves the quote request
/// `undefined`.
const DEFAULT_SWAP_ASSET_OUT_ID = "2";
const DEFAULT_SLIPPAGE_BPS = 50;

export function SwapForm() {
  const { mutation: m, progress } = useSwap();
  const assets = useRegisteredAssets();
  const activeChain = useActiveChain();
  const clearFinished = useClearFinishedOp(m, progress);

  const form = useForm<SwapInput>({
    resolver: zodResolver(swapSchema),
    defaultValues: {
      assetIn: DEFAULT_ASSET_ID,
      assetOut: DEFAULT_SWAP_ASSET_OUT_ID,
      amount: "",
      slippageBps: DEFAULT_SLIPPAGE_BPS,
    },
  });
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = form;
  const { clearAmount, setAmount } = useAmountControls(form);

  const wAssetIn = watch("assetIn");
  const wAssetOut = watch("assetOut");
  const wAmount = watch("amount");
  const wSlippage = watch("slippageBps");

  const inAsset = findAsset(assets, wAssetIn);
  const outAsset = findAsset(assets, wAssetOut);
  const inBalance = useAssetBalance(inAsset?.id)?.balance;
  const balanceOf = useAssetBalanceLabel();

  const parsed = parseAmountSafe(wAmount, inAsset);
  const v = validateAmount(parsed, inAsset, inBalance);

  // The quote binds a route into the proof, so it is fetched for one exact
  // (pair, amount, slippage) and nothing else. Passing `undefined` until every
  // part is present is what keeps the query off — and because the request *is*
  // the cache key, changing any part invalidates the old quote by construction.
  // This used to be a ref tracking the previous tuple and calling `reset()`.
  //
  // MetaQuoter quotes against token base units. MASP skims its fee off the
  // gross publicOut before the wrapper sees the input, so the true adapter-side
  // input is slightly less; the user's `slippageBps` floor absorbs it.
  const request =
    inAsset && outAsset && wAssetIn !== wAssetOut && v.valid && parsed !== undefined
      ? {
          chainId: activeChain.chainId,
          tokenIn: inAsset.token,
          tokenOut: outAsset.token,
          amountIn: parsed * inAsset.scale,
          slippageBps: wSlippage,
        }
      : undefined;
  const quoteQ = useSwapQuote(request);
  // Suppressed while the debounce catches up: `data` then describes an earlier
  // amount, and submitting against it would prove the wrong route.
  const quote = quoteQ.stale ? undefined : quoteQ.data;

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

  const refreshQuote = () => void quoteQ.refetch();
  const quoting = quoteQ.isFetching || (request !== undefined && quoteQ.stale);

  const submitDisabled = !v.valid || !quote || quoteStale || quoting;

  const onSubmit = handleSubmit(
    useSubmitOnce(async (values) => {
      if (!inAsset || !outAsset || !quote) return;
      const amount = parseAmountForAsset(values.amount, inAsset.decimals, inAsset.scale);
      await m.mutateAsync({ assetIn: inAsset.id, assetOut: outAsset.id, amount, quote });
      // The quote is bound to this exact amount, so clearing the amount is also
      // what retires it: the request goes `undefined`, the query goes idle, and
      // the pair and slippage — the user's standing choices — survive.
      clearAmount();
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
        balanceOf={balanceOf}
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
        balanceOf={balanceOf}
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
        maxAmount={inBalance}
        validation={v}
        formError={errors.amount?.message}
        hint={
          inBalance !== undefined && inAsset
            ? `balance ${formatAmountForAsset(inBalance, inAsset.decimals, inAsset.scale)} ${inAsset.symbol}`
            : undefined
        }
        onSetMax={setAmount}
      />
      <SlippageField
        bps={wSlippage}
        onChange={(b) => setValue("slippageBps", b, { shouldValidate: true })}
        error={errors.slippageBps?.message}
      />
      <input type="hidden" {...register("slippageBps", { valueAsNumber: true })} />
      <div className="stack stack--sm">
        {/* No "get quote" button any more — the query fetches as soon as the
            pair and amount are valid, and refreshes itself before the quote
            expires. What is left is the state in between, which used to be the
            button's label and would otherwise be a blank gap under the form.
            `QuoteCard` carries its own refresh once there is a card to put it
            on. */}
        {quoting && !quote ? (
          <div className="muted txt-sm">
            <span className="spinner" aria-hidden /> fetching quote…
          </div>
        ) : null}
        {quoteQ.error ? (
          <div className="row row--center">
            <span className="err grow">{quoteQ.error.message}</span>
            <button type="button" className="btn btn--ghost" onClick={refreshQuote}>
              retry
            </button>
          </div>
        ) : null}
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
            onRefresh={refreshQuote}
            refreshing={quoteQ.isFetching}
          />
        ) : null}
      </div>
    </ActionForm>
  );
}
