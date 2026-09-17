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

/// The swap screen: pay and receive legs, Details row, and Swap.
export function SwapForm() {
  const action = useSwap();
  const { mutation: m, progress } = action;
  const assets = useRegisteredAssets();

  const form = useActionForm({
    schema: swapSchema,
    defaultValues: {
      assetIn: DEFAULT_ASSET_ID,
      assetOut: defaultSwapOut(assets),
      amount: "",
      slippageBps: DEFAULT_SLIPPAGE_BPS,
    },
    action,
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

  // Flipping must clear the amount: the same digits in the other token are a different trade.
  const flip = () => {
    clearFinished();
    void flipPair({ setValue, trigger }, { assetIn: wAssetIn, assetOut: wAssetOut });
    clearAmount();
  };

  const onSubmit = useActionSubmit<SwapInput>(form, async (_values, ctx) => {
    if (!outAsset || !quote || quote.gross.amount !== ctx.amount) return false;
    return m.mutateAsync({ quote, feeAsset: spend.feeAsset });
  });

  const pick = (field: "assetIn" | "assetOut") => (next: string) => {
    clearFinished();
    setValue(field, next);
    void trigger(["assetIn", "assetOut"]);
  };

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
