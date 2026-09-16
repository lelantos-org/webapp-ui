// Swap. One card: "You pay" and "You receive" as two panels with the flip button
// overlapping the seam, the Details row (slippage and the relayer fee), and the
// Swap button with the revert threshold under it. No review step, on any width:
// the quote expires in seconds, and a summary screen would spend them.

import { isWalletError } from "@lelantos-org/sdk";
import { useEffect } from "react";
import {
  DEFAULT_ASSET_ID,
  findAsset,
  useAssetSelectOptions,
  useRegisteredAssets,
} from "@/features/assets";
import {
  ActionForm,
  AssetSelectPill,
  BoundaryLine,
  spendHeroProps,
  useActionForm,
  useActionSubmit,
  useSpendAmount,
} from "@/features/op-form";
import { operationOf } from "@/features/tx";
import { SyncNotice } from "@/features/wallet";
import { formatAssetAmount } from "@/shared/lib/format/asset";
import { ScreenHeader } from "@/shared/ui/ScreenHeader";
import { FlipButton } from "./components/FlipButton";
import { PayLeg } from "./components/PayLeg";
import { ReceiveLeg } from "./components/ReceiveLeg";
import { SwapDetails } from "./components/SwapDetails";
import { swapSubmitBlock } from "./swap-block";
import { revertFootnote } from "./swap-copy";
import {
  DEFAULT_SLIPPAGE_BPS,
  defaultSwapOut,
  flipPair,
  type SwapInput,
  swapSchema,
} from "./swap-schema";
import { useSwap } from "./use-swap";
import { useSwapQuoteState } from "./use-swap-quote-state";
import "./swap.css";

export function SwapForm() {
  const action = useSwap();
  const { mutation: m, progress } = action;
  const assets = useRegisteredAssets();

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
  // figure `ReceiveLeg` shows (`quote.credit`), so repeating it here would
  // double-count it.
  const spend = useSpendAmount({
    kind: "swap",
    selected: inAsset,
    amountText: wAmount,
    setAmount: form.setAmount,
  });
  const { parsed, validation: v, fees } = spend;

  const q = useSwapQuoteState({
    inAsset,
    outAsset,
    amount: parsed,
    amountValid: v.valid,
    slippageBps: wSlippage,
  });
  const { quote } = q;
  // A swap refused because the quote's figures moved — a yield index, the
  // relayer's flush fee — is retryable by re-quoting, so the form fetches a fresh
  // quote at once rather than leaving the user to press refresh; the failure's
  // message says the quote was refreshed.
  const staleQuote = isWalletError(m.error, "QUOTE_STALE");
  const { refresh } = q;
  useEffect(() => {
    if (staleQuote) refresh();
  }, [staleQuote, refresh]);

  const block = swapSubmitBlock({
    ...spend.readiness,
    hasPair: !!inAsset && !!outAsset && assets.length > 1,
    hasQuote: !!quote,
    quoteStale: q.stale,
    quoting: q.quoting,
    quoteFailed: q.failed,
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
    // The quote carries the pair and the gross it was priced for; it describes
    // the form's current trade by construction (`useSwapQuoteState`).
    if (!outAsset || !quote || quote.gross.amount !== ctx.amount) return false;
    return m.mutateAsync({ quote, feeAsset: spend.feeAsset });
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
      operation={operationOf(m.data)}
      onReset={clearFinished}
      tx={{
        progressTitle: "Swapping",
        settledTitle: "Swapped",
        amount: inAsset && parsed !== undefined ? formatAssetAmount(parsed, inAsset) : undefined,
      }}
      details={
        <SwapDetails
          fees={fees}
          slippageBps={wSlippage}
          onSlippageChange={(b) => setValue("slippageBps", b, { shouldValidate: true })}
          slippageError={errors.slippageBps?.message}
        />
      }
    >
      <SyncNotice />
      <div className="swap-pair">
        <PayLeg
          hero={spendHeroProps(form, spend, wAmount)}
          picker={
            <AssetSelectPill
              label="Asset to pay with"
              options={options}
              value={wAssetIn}
              invalid={!!pairError}
              disabled={m.isPending}
              onChange={pick("assetIn")}
            />
          }
          pairError={pairError}
        />

        <FlipButton onFlip={flip} disabled={m.isPending} />

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
          ageSecs={q.ageSecs}
          stale={q.stale}
          onRefresh={q.refresh}
          refreshing={q.refreshing}
          quoting={q.quoting}
          error={q.error}
        />
      </div>
      <input type="hidden" {...register("assetIn")} />
      <input type="hidden" {...register("assetOut")} />
      <input type="hidden" {...register("slippageBps", { valueAsNumber: true })} />
    </ActionForm>
  );
}
