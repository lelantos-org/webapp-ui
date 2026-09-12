// Swap. One card: "You pay" and "You receive" as two panels with the flip button
// overlapping the seam, the Details row (slippage and the relayer fee), and the
// Swap button with the revert threshold under it. No review step, on any width:
// the quote expires in seconds, and a summary screen would spend them.

import {
  DEFAULT_ASSET_ID,
  findAsset,
  useAssetSelectOptions,
  useRegisteredAssets,
} from "@/features/assets";
import { useActiveChain } from "@/features/chain";
import { FeeDetails, useAssetFeeBps, useDepositFee } from "@/features/fees";
import {
  ActionForm,
  AmountHero,
  AssetSelectPill,
  BoundaryLine,
  useActionForm,
  useActionSubmit,
  useSpendAmount,
} from "@/features/op-form";
import { SyncNotice } from "@/features/wallet";
import { formatAssetAmount } from "@/shared/lib/format/asset";
import { ArrowDownGlyph } from "@/shared/ui/glyphs";
import { ScreenHeader } from "@/shared/ui/ScreenHeader";
import { ReceiveLeg } from "./components/ReceiveLeg";
import { SlippageField } from "./components/SlippageField";
import { quoteRequest } from "./quote-request";
import { defaultSwapOut, flipPair, type SwapInput, swapSchema } from "./schema";
import { swapSubmitBlock } from "./swap-block";
import { revertFootnote, swapDetailsLine } from "./swap-copy";
import { useQuoteAge } from "./use-quote-age";
import { useSwap } from "./use-swap";
import { useSwapQuote } from "./use-swap-quote";
import "./swap.css";

const DEFAULT_SLIPPAGE_BPS = 50;

export function SwapForm() {
  const action = useSwap();
  const { mutation: m, progress } = action;
  const assets = useRegisteredAssets();
  const activeChain = useActiveChain();

  const form = useActionForm({
    schema: swapSchema,
    defaultValues: {
      assetIn: DEFAULT_ASSET_ID,
      // Derived rather than hardcoded, and safe to compute here: the registry
      // resolves before anything below `ChainProvider` renders (see
      // `registered-assets.ts`), so there is nothing to reconcile afterwards.
      assetOut: defaultSwapOut(assets),
      amount: "",
      slippageBps: DEFAULT_SLIPPAGE_BPS,
    },
    action,
    // The amount is denominated in the asset paid with.
    assetField: "assetIn",
  });
  const { register, setValue, watch, errors, clearAmount, clearFinished } = form;
  const { trigger } = form.form;
  const options = useAssetSelectOptions({ rateTag: false });

  const wAssetIn = watch("assetIn");
  const wAssetOut = watch("assetOut");
  const wAmount = watch("amount");
  const wSlippage = watch("slippageBps");

  const inAsset = form.selected;
  const outAsset = findAsset(assets, wAssetOut);
  // Relayer fee only: the protocol fee on leg 2 is already inside the credited
  // figure `ReceiveLeg` shows (`sizeBNote`), so repeating it here would
  // double-count it.
  const spend = useSpendAmount({
    kind: "swap",
    selected: inAsset,
    amountText: wAmount,
    setAmount: form.setAmount,
  });
  const { balance: inBalance, parsed, validation: v, fees, spendable } = spend;

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
  // figure `ReceiveLeg` computes rather than to the Details row.
  const outDepositFee = useDepositFee(outAsset?.id);

  const refreshQuote = () => void quoteQ.refetch();
  const quoting = quoteQ.isFetching || (request !== undefined && quoteQ.stale);

  const block = swapSubmitBlock({
    ...spend.readiness,
    hasPair: !!inAsset && !!outAsset && assets.length > 1,
    hasQuote: !!quote,
    quoteStale,
    quoting,
    quoteFailed: !!quoteQ.error && !quoting,
  });

  // Swapping the pair drops the amount. It is denominated in the *in* asset, so
  // carrying it across reinterprets "1.0" against a different token and a
  // different balance — the same digits, a trade orders of magnitude apart.
  // Clearing also retires the quote by construction, the mechanism the
  // post-submit path relies on: the request goes `undefined` and the query
  // idles.
  const flip = () => {
    clearFinished();
    void flipPair({ setValue, trigger }, { assetIn: wAssetIn, assetOut: wAssetOut });
    clearAmount();
  };

  // The quote is bound to this exact amount, so the amount cleared on success
  // retires it: the request becomes `undefined` and the query goes idle, while
  // the pair and slippage are preserved.
  const onSubmit = useActionSubmit<SwapInput>(form, async (_values, ctx) => {
    if (!outAsset || !quote) return false;
    return m.mutateAsync({
      assetIn: ctx.asset.id,
      assetOut: outAsset.id,
      amount: ctx.amount,
      quote,
      feeAsset: spend.feeAsset,
    });
  });

  // Either leg's pick revalidates both: the schema rejects a pair of one asset.
  const pick = (field: "assetIn" | "assetOut") => (next: string) => {
    clearFinished();
    setValue(field, next);
    void trigger(["assetIn", "assetOut"]);
  };

  // The pair error is reported on both paths by `swapSchema`; one sentence
  // under the pay leg is enough.
  const pairError = errors.assetIn?.message ?? errors.assetOut?.message;

  return (
    <ActionForm
      header={
        <ScreenHeader
          title="Swap"
          subtitle={
            <BoundaryLine
              sentence="Both sides stay shielded — the trade is never linked to you"
              short="Both sides stay shielded"
            />
          }
        />
      }
      submitLabel="Swap"
      busy={m.isPending}
      error={m.error}
      onSubmit={onSubmit}
      submitDisabled={block.disabled}
      blockedReason={block.reason}
      footnote={revertFootnote(wSlippage)}
      progress={progress}
      txHash={m.data?.txHash}
      onReset={clearFinished}
      tx={{
        progressTitle: "Swapping",
        settledTitle: "Swapped",
        amount: inAsset && parsed !== undefined ? formatAssetAmount(parsed, inAsset) : undefined,
      }}
      details={
        <FeeDetails
          fees={fees}
          summary={
            <>
              <span className="only-wide">{swapDetailsLine(wSlippage, fees.model)}</span>
              <span className="only-narrow">
                {swapDetailsLine(wSlippage, fees.model, { short: true })}
              </span>
            </>
          }
        >
          <SlippageField
            bps={wSlippage}
            onChange={(b) => setValue("slippageBps", b, { shouldValidate: true })}
            error={errors.slippageBps?.message}
          />
        </FeeDetails>
      }
    >
      <SyncNotice />
      <div className="swap-pair">
        <div className="swap-leg swap-leg--pay">
          <AmountHero
            size="md"
            label="You pay"
            inputProps={register("amount")}
            selected={inAsset}
            value={wAmount}
            amount={parsed}
            asset={
              <AssetSelectPill
                label="Asset to pay with"
                options={options}
                value={wAssetIn}
                invalid={!!pairError}
                disabled={m.isPending}
                onChange={pick("assetIn")}
              />
            }
            balanceLabel="Shielded"
            balance={
              inBalance !== undefined && inAsset ? formatAssetAmount(inBalance, inAsset) : undefined
            }
            maxAmount={spendable?.max}
            onSetMax={spend.onSetMax}
            validation={v}
            formError={errors.amount?.message}
            hint={pairError ? <span className="swap-pair__err">{pairError}</span> : undefined}
          />
        </div>

        {/* Overlaps the seam between the two leg panels. */}
        <div className="swap-flip-row">
          <button
            type="button"
            className="swap-flip"
            onClick={flip}
            disabled={m.isPending}
            aria-label="Reverse the pair"
            title="Reverse the pair"
          >
            <ArrowDownGlyph size={17} />
          </button>
        </div>

        <ReceiveLeg
          outAsset={outAsset}
          picker={
            <AssetSelectPill
              label="Asset to receive"
              options={options}
              value={wAssetOut}
              invalid={!!pairError}
              disabled={m.isPending}
              onChange={pick("assetOut")}
            />
          }
          quote={quote}
          feeBps={feeBps}
          outDepositFee={outDepositFee}
          ageSecs={quoteAge}
          stale={quoteStale}
          onRefresh={refreshQuote}
          refreshing={quoteQ.isFetching}
          quoting={quoting}
          error={quoteQ.error}
        />
      </div>
      <input type="hidden" {...register("assetIn")} />
      <input type="hidden" {...register("assetOut")} />
      <input type="hidden" {...register("slippageBps", { valueAsNumber: true })} />
    </ActionForm>
  );
}
