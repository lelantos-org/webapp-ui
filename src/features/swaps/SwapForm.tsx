import { zodResolver } from "@hookform/resolvers/zod";
import { quoteAgeSecs } from "@lelantos-org/sdk/quoter";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import {
  ActionForm,
  AmountField,
  FeeSummary,
  parseAmountSafe,
  useAmountControls,
  useAssetFeeBps,
  useClearFinishedOp,
  useDepositFee,
  useFeePanel,
  useSubmitOnce,
  useSwap,
  validateAmount,
} from "@/features/actions";
import {
  AssetPicker,
  DEFAULT_ASSET_ID,
  findAsset,
  useAssetBalance,
  useAssetBalanceLabel,
  useRegisteredAssets,
} from "@/features/assets";
import { useActiveChain } from "@/features/chain";
import { SyncErrorNotice } from "@/features/wallet";
import { formatAmountForAsset, parseAmountForAsset } from "@/shared/lib/format";
import { QuoteCard } from "./QuoteCard";
import { SlippageField } from "./SlippageField";
import { type SwapInput, swapSchema } from "./schemas";
import { QUOTE_STALE_SECS, useSwapQuote } from "./use-swap-quote";

/// Any asset other than `DEFAULT_ASSET_ID`, so the pair starts valid. A swap
/// needs two distinct assets; a matching pair leaves the quote request
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
  // (pair, amount, slippage). Passing `undefined` until every part is present
  // keeps the query off, and because the request is the cache key, changing any
  // part invalidates the previous quote by construction.
  //
  // MetaQuoter quotes against token base units. MASP skims its fee off the gross
  // publicOut before the wrapper sees the input, so the adapter-side input is
  // slightly lower; the user's `slippageBps` floor absorbs the difference.
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
  // Suppressed while the debounce catches up, since `data` then describes an
  // earlier amount and submitting against it would prove the wrong route.
  const quote = quoteQ.stale ? undefined : quoteQ.data;

  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  const quoteAge = quote ? quoteAgeSecs(quote, now) : undefined;
  // The **out** asset's **deposit** rate, because that is what it prices: leg 2
  // mints the B-note as a deposit of `outAsset`, and `sizeBNote` solves for the
  // value whose Permit2 pull clears `minOut`. The in-asset's rate, or the
  // withdraw leg's, sizes the note against the wrong percentage and the pull
  // lands under `minOut` — which the wrapper reverts as `MaspPullBelowMinOut`.
  const feeBps = useAssetFeeBps(outAsset?.id, "deposit");
  // Leg 2 is a deposit, and the relayer's charge for flushing it comes out of the
  // B-note rather than being billed separately, so it belongs to the credited
  // figure `QuoteCard` computes rather than to the fee panel below.
  const outDepositFee = useDepositFee(outAsset?.id);
  // Relayer fee only: the protocol fee on leg 2 is already inside the credited
  // figure `QuoteCard` shows (`sizeBNote`), so repeating it here would
  // double-count it.
  const [feeAsset, setFeeAsset] = useState<bigint | undefined>(undefined);
  const fees = useFeePanel({
    kind: "swap",
    selected: inAsset,
    amount: parsed,
    protocol: undefined,
    feeAsset,
    onFeeAsset: setFeeAsset,
  });
  const quoteStale = quoteAge !== undefined && quoteAge > QUOTE_STALE_SECS;

  // `now` drives the quote's age counter only, so it ticks only while a quote
  // exists and is under `QUOTE_STALE_SECS`; ungated, it would re-render the whole
  // form subtree once a second for the life of the route. Resynced on entry, so a
  // quote arriving after a pause is not measured against a stale clock.
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
      await m.mutateAsync({ assetIn: inAsset.id, assetOut: outAsset.id, amount, quote, feeAsset });
      // The quote is bound to this exact amount, so clearing the amount retires
      // it: the request becomes `undefined` and the query goes idle, while the
      // pair and slippage are preserved.
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
        {/* No "get quote" button: the query fetches as soon as the pair and
            amount are valid and refreshes before the quote expires. This covers
            the interval before the first card arrives; `QuoteCard` carries its
            own refresh control thereafter. */}
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
            outDepositFee={outDepositFee}
            ageSecs={quoteAge ?? 0}
            stale={quoteStale}
            slippageBps={wSlippage}
            onRefresh={refreshQuote}
            refreshing={quoteQ.isFetching}
          />
        ) : null}
        <FeeSummary model={fees.model} refreshing={fees.refreshing} feeAsset={fees.feeAsset} />
      </div>
    </ActionForm>
  );
}
