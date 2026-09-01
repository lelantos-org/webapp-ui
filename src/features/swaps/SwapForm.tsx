import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
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
import { formatAmountForDisplay, parseAmountForAsset } from "@/shared/lib/format";
import { defaultSwapOut } from "./default-pair";
import { FlipIcon } from "./FlipIcon";
import { QuoteCard } from "./QuoteCard";
import { quoteRequest } from "./quote-request";
import { SlippageField } from "./SlippageField";
import { type SwapInput, swapSchema } from "./schemas";
import { swapSubmitBlock } from "./submit-block";
import { useQuoteAge } from "./use-quote-age";
import { useSwapQuote } from "./use-swap-quote";

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
      // Derived rather than hardcoded, and safe to compute here: the registry
      // resolves before anything below `ChainProvider` renders (see
      // `registered-assets.ts`), so there is nothing to reconcile afterwards.
      assetOut: defaultSwapOut(assets),
      amount: "",
      slippageBps: DEFAULT_SLIPPAGE_BPS,
    },
  });
  const {
    register,
    handleSubmit,
    setValue,
    trigger,
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
  // (pair, amount, slippage); see `quote-request.ts` for why `undefined` is the
  // load-bearing case.
  const request = quoteRequest({
    chainId: activeChain.chainId,
    inAsset,
    outAsset,
    amount: parsed,
    amountValid: v.valid,
    slippageBps: wSlippage,
  });
  const quoteQ = useSwapQuote(request);
  // Suppressed while the debounce catches up, since `data` then describes an
  // earlier amount and submitting against it would prove the wrong route.
  const quote = quoteQ.stale ? undefined : quoteQ.data;

  const { ageSecs: quoteAge, stale: quoteStale } = useQuoteAge(quote);
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
  const refreshQuote = () => void quoteQ.refetch();
  const quoting = quoteQ.isFetching || (request !== undefined && quoteQ.stale);

  const block = swapSubmitBlock({
    amountValid: v.valid,
    hasQuote: !!quote,
    quoteStale,
    quoting,
  });

  // Swapping the pair drops the amount. It is denominated in the *in* asset, so
  // carrying it across reinterprets "1.0" against a different token and a
  // different balance — the same digits, a trade orders of magnitude apart.
  // Clearing also retires the quote by construction, the mechanism the
  // post-submit path relies on: the request goes `undefined` and the query
  // idles.
  //
  // Both sides are written unvalidated and revalidated together afterwards.
  // Validating each `setValue` as it lands walks through a state where the two
  // sides are momentarily equal, and `swapSchema` reports that on *both* paths
  // by design (see the comment there). The second write then clears only the
  // field it names, leaving the first field's "tokenIn and tokenOut must differ"
  // latched on a pair that is now perfectly valid.
  const flip = () => {
    clearFinished();
    setValue("assetIn", wAssetOut);
    setValue("assetOut", wAssetIn);
    void trigger(["assetIn", "assetOut"]);
    clearAmount();
  };

  const onSubmit = handleSubmit(
    useSubmitOnce(async (values) => {
      if (!inAsset || !outAsset || !quote) return;
      const amount = parseAmountForAsset(
        values.amount,
        inAsset.decimals,
        inAsset.scale,
        inAsset.index,
      );
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
      submitDisabled={block.disabled}
      blockedReason={block.reason}
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
        // On this field's label row rather than floating in the gap above it.
        // Centring it in that gap looked wrong however it was measured: the gap
        // separates the two *field groups*, and the "to" group opens with a
        // label, so anything centred between them sits a label's height nearer
        // the "from" box than the "to" box. Here it needs no overlap, no
        // negative margin and no stacking order, and it sits with the value it
        // rewrites.
        action={
          <button
            type="button"
            className="swap-flip"
            onClick={flip}
            disabled={m.isPending}
            title="reverse the pair"
          >
            <FlipIcon />
            reverse
          </button>
        }
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
            ? `balance ${formatAmountForDisplay(inBalance, inAsset)} ${inAsset.symbol}`
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
            outIndex={outAsset.index}
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
