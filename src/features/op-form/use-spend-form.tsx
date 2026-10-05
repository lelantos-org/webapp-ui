import type { CircuitAmount } from "@lelantos-org/sdk";
import type { Path, PathValue } from "react-hook-form";
import { allPriced, crossAssetNote, FeeDetails, FeeLineSummary } from "@/features/fees";
import type { ActionMutation } from "@/features/ops";
import { type OperationResult, operationOf } from "@/features/tx";
import type { RelayerFeeTerms } from "@/shared/domain/relayer-fee";
import { formatAssetAmount, formatAssetFixed } from "@/shared/lib/format/asset";
import type { AmountHeroProps } from "./amount/AmountHero";
import type { AssetMeta } from "./amount/amount-validation";
import {
  type SpendAmount,
  type SpendAmountInputs,
  useSpendAmount,
} from "./amount/use-spend-amount";
import type { ActionFormProps } from "./frame/ActionForm";
import {
  type ActionFormApi,
  type ActionFormValues,
  useActionSubmit,
} from "./frame/use-action-form";
import { useHeldAssetDefault } from "./frame/use-opening-asset";
import type { TxCopy } from "./frame/use-tx-view";
import type { ReviewPanelProps } from "./review/ReviewPanel";
import { reviewFigure } from "./review/review";
import { type Review, useReview } from "./review/use-review";
import type { RecipientRule } from "./schemas";
import { spendSubmitBlock } from "./submit/spend-block";
import { reviewBlockReason } from "./submit/submit-block";

export type SpendFormValues = ActionFormValues & { to: string; asset: string };

export interface SpendFormOptions<T>
  extends Omit<SpendAmountInputs, "selected" | "amountText" | "setAmount"> {
  recipient: RecipientRule;
  /// The memo field's text, on a form that sends one.
  memo?: string | undefined;
  titles: Pick<TxCopy, "progressTitle" | "settledTitle">;
  /// Sends validated values, with the amount in circuit units.
  send(
    values: T,
    ctx: { amount: CircuitAmount; asset: bigint; relayerFee: RelayerFeeTerms },
  ): Promise<unknown>;
}

export interface SpendForm {
  spend: SpendAmount;
  amountText: string;
  to: string;
  /// The asset as the screen names it: "ETH" on the native path.
  symbol: string;
  review: Review;
  /// Writes a pasted recipient, dirty and validated at once.
  onPasteTo(next: string): void;
  frame: Omit<ActionFormProps, "header" | "review" | "children">;
  hero: Omit<AmountHeroProps, "label" | "asset">;
  /// `ReviewPanel`'s props; `undefined` unless the review is open with figures to show.
  reviewPanel:
    | Pick<
        ReviewPanelProps,
        "busy" | "onCancel" | "figure" | "symbol" | "words" | "confirmBlocked" | "mergeFirst"
      >
    | undefined;
}

/// The two-stage spend shared by Send and Unshield: the first submit opens the review, the second sends.
export function useSpendForm<T extends SpendFormValues, I, R extends OperationResult>(
  form: ActionFormApi<T>,
  { mutation: m, progress }: ActionMutation<I, R>,
  { recipient, memo, titles, send, ...amountInputs }: SpendFormOptions<T>,
): SpendForm {
  const { selected, register, errors } = form;
  const amountText = form.watch("amount" as Path<T>) as string;
  const to = form.watch("to" as Path<T>) as string;
  const asset = form.watch("asset" as Path<T>) as string;
  useHeldAssetDefault(form);

  const spend = useSpendAmount({
    ...amountInputs,
    selected,
    amountText,
    setAmount: form.setAmount,
  });
  const { parsed, fees, display } = spend;
  const symbol = display?.symbol ?? "";

  const block = spendSubmitBlock({
    ...spend.readiness,
    recipient: to,
    recipientRule: recipient,
    memo,
  });

  const onSubmit = useActionSubmit<T>(
    form,
    (values, ctx) =>
      send(values, { amount: ctx.amount, asset: ctx.asset.id, relayerFee: spend.relayerFee }),
    { ready: !block.disabled },
  );

  // Covers every field that changes what is sent, so an edit closes the review before stale figures are confirmed.
  const review = useReview(
    [asset, amountText, to, spend.feeAsset, memo].map((p) => p ?? "").join("|"),
  );
  const figures =
    selected && parsed !== undefined ? reviewFigure(parsed, selected, symbol) : undefined;

  // `figures` is required too: a registry reload mid-review shows the bare form, whose submit must not send.
  const onFormSubmit = (e: React.FormEvent) => {
    // `requestSubmit` (Enter in a field, "Try again") does not go through the disabled button.
    if (block.disabled) {
      e.preventDefault();
      return;
    }
    if (!review.open || !figures) {
      e.preventDefault();
      review.enter();
      return;
    }
    void onSubmit(e);
  };

  return {
    spend,
    amountText,
    to,
    symbol,
    review,
    onPasteTo: (next) =>
      form.setValue("to" as Path<T>, next as PathValue<T, Path<T>>, {
        shouldDirty: true,
        shouldValidate: true,
      }),
    frame: {
      submitLabel: "Review",
      busy: m.isPending,
      error: m.error,
      onSubmit: onFormSubmit,
      submitDisabled: block.disabled,
      blockedReason: block.reason,
      details: <FeeDetails fees={fees} summary={<FeeLineSummary model={fees.model} />} />,
      footnote: crossAssetNote(fees.model),
      progress,
      txHash: m.data?.txHash,
      operation: operationOf(m.data),
      onReset: form.clearFinished,
      tx: {
        ...titles,
        amount: display && parsed !== undefined ? formatAssetAmount(parsed, display) : undefined,
      },
    },
    hero: {
      inputProps: register("amount" as Path<T>),
      selected,
      value: amountText,
      amount: parsed,
      wordsSymbol: symbol,
      balanceLabel: "Shielded",
      balance:
        selected && spend.balance !== undefined ? (
          <SpendBalance value={spend.balance} meta={selected} symbol={symbol} />
        ) : undefined,
      maxAmount: spend.spendable?.max,
      onSetMax: spend.onSetMax,
      validation: spend.validation,
      formError: errors.amount?.message as string | undefined,
      hint: spend.hint,
    },
    reviewPanel:
      review.open && figures
        ? {
            busy: m.isPending,
            onCancel: review.cancel,
            figure: figures.figure,
            symbol,
            words: figures.words,
            mergeFirst: spend.needsMerge,
            confirmBlocked: reviewBlockReason(block, allPriced(fees.model)),
          }
        : undefined,
  };
}

/// `AmountHero`'s props for a shielded spend assembled outside `useSpendForm`.
export function spendHeroProps<T extends ActionFormValues>(
  form: ActionFormApi<T>,
  spend: SpendAmount,
  amountText: string,
): Omit<AmountHeroProps, "label" | "asset"> {
  const { selected } = form;
  return {
    inputProps: form.register("amount" as Path<T>),
    selected,
    value: amountText,
    amount: spend.parsed,
    balanceLabel: "Shielded",
    balance:
      spend.balance !== undefined && selected
        ? formatAssetAmount(spend.balance, selected)
        : undefined,
    maxAmount: spend.spendable?.max,
    onSetMax: spend.onSetMax,
    validation: spend.validation,
    formError: form.errors.amount?.message as string | undefined,
  };
}

function SpendBalance({ value, meta, symbol }: { value: bigint; meta: AssetMeta; symbol: string }) {
  const figure = formatAssetFixed(value, meta, 6);
  return (
    <>
      {figure}
      {symbol ? <span className="only-wide"> {symbol}</span> : null}
    </>
  );
}
