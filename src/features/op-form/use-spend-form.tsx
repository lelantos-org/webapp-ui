// The two-stage spend Send and Unshield share: an amount against the shielded
// balance, a recipient, the first press reviewing and the second sending.
//
// Both forms assembled the same chain — the amount and fee reads, the submit
// block with its recipient gate, the parse-and-send submit, the review gate —
// and handed `ActionForm`, `AmountHero` and `ReviewPanel` the same props from
// it. Stated once, each form keeps only what is its own: its schema and send,
// its copy, and what it adds around the card.
//
// The review gate has two conditions that are easy to get subtly wrong apart:
// review closes on any edit to what would be sent (`useReview`), and the send
// waits on a review that has something to show.

import type { CircuitAmount } from "@lelantos-org/sdk";
import type { Path, PathValue } from "react-hook-form";
import { allPriced, crossAssetNote, FeeDetails, FeeLineSummary } from "@/features/fees";
import type { ActionMutation } from "@/features/ops";
import { type OperationResult, operationOf } from "@/features/tx";
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
import type { TxCopy } from "./frame/use-tx-view";
import type { ReviewPanelProps } from "./review/ReviewPanel";
import { reviewFigure } from "./review/review";
import { type Review, useReview } from "./review/use-review";
import { type SpendBlockInput, spendSubmitBlock } from "./submit/spend-block";

/// A spend's fields: an amount of an asset, to a recipient.
export type SpendFormValues = ActionFormValues & { to: string; asset: string };

export interface SpendFormOptions<T>
  extends Omit<SpendAmountInputs, "selected" | "amountText" | "setAmount"> {
  /// The recipient's shape check, and which kind of address it names.
  recipient: Pick<SpendBlockInput, "recipientValid" | "recipientKind">;
  titles: Pick<TxCopy, "progressTitle" | "settledTitle">;
  /// The mutation call for validated values: the amount in circuit units, the
  /// asset's id, and the fee asset as it applies to this spend.
  send(
    values: T,
    ctx: { amount: CircuitAmount; asset: bigint; feeAsset: bigint | undefined },
  ): Promise<unknown>;
}

export interface SpendForm {
  spend: SpendAmount;
  /// The amount field's and the recipient field's live text.
  amountText: string;
  to: string;
  /// The asset as the screen names it: "ETH" on the native path.
  symbol: string;
  review: Review;
  /// The recipient field's paste: written dirty and validated at once, since a
  /// pasted address is a finished one.
  onPasteTo(next: string): void;
  frame: Omit<ActionFormProps, "header" | "review" | "children">;
  hero: Omit<AmountHeroProps, "label" | "asset">;
  /// `ReviewPanel`'s share of props while the review is open with something to
  /// show; `undefined` otherwise.
  reviewPanel:
    | Pick<ReviewPanelProps, "busy" | "onCancel" | "figure" | "symbol" | "words" | "confirmBlocked">
    | undefined;
}

export function useSpendForm<T extends SpendFormValues, I, R extends OperationResult>(
  form: ActionFormApi<T>,
  { mutation: m, progress }: ActionMutation<I, R>,
  { recipient, titles, send, ...amountInputs }: SpendFormOptions<T>,
): SpendForm {
  const { selected, register, errors } = form;
  const amountText = form.watch("amount" as Path<T>) as string;
  const to = form.watch("to" as Path<T>) as string;
  const asset = form.watch("asset" as Path<T>) as string;

  const spend = useSpendAmount({
    ...amountInputs,
    selected,
    amountText,
    setAmount: form.setAmount,
  });
  const { parsed, fees, display } = spend;
  const symbol = display?.symbol ?? "";

  // Both the dead-button reason and the recipient gate live here: the fee
  // shortfall is only knowable once the quote lands, and a spend that cannot pay
  // its relayer must not reach the prover.
  const block = spendSubmitBlock({ ...spend.readiness, recipient: to, ...recipient });

  const onSubmit = useActionSubmit<T>(form, (values, ctx) =>
    send(values, { amount: ctx.amount, asset: ctx.asset.id, feeAsset: spend.feeAsset }),
  );

  // Every field that changes what gets sent — asset, amount, recipient, fee
  // asset — so editing any of them drops back out of the summary rather than
  // letting stale figures be confirmed.
  const review = useReview([asset, amountText, to, spend.feeAsset].map((p) => p ?? "").join("|"));
  const figures =
    selected && parsed !== undefined ? reviewFigure(parsed, selected, symbol) : undefined;

  // First press reviews, second sends. `submitDisabled` already stops an
  // unfilled form reaching here, so entering review implies the fields are good.
  // A review with nothing to show is not a review, so the send also waits on
  // `figures` — otherwise a registry reload mid-review would drop the summary
  // and leave the next press sending from the bare form.
  const onFormSubmit = (e: React.FormEvent) => {
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
            // Confirm waits for every fee to have a figure:
            // confirming a cost still drawn as "—" is agreeing to a number nobody
            // has seen.
            confirmBlocked:
              block.reason ?? (allPriced(fees.model) ? undefined : "Working out the fee…"),
          }
        : undefined,
  };
}

/// `AmountHero`'s props for an amount against the shielded balance, for the
/// forms that assemble their own spend rather than `useSpendForm`'s: Swap's pay
/// leg and Send by link. The balance is the plain asset figure, where
/// `useSpendForm`'s hero pins six decimals and drops the symbol on phones.
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

/// The balance on `AmountHero`'s right: "8,420.00 USDC", and "8,420.00" on
/// phones, where the pill beside it already states the symbol.
function SpendBalance({
  value,
  meta,
  symbol,
}: {
  /// Circuit units, as the shielded balance is held.
  value: bigint;
  meta: AssetMeta;
  symbol: string;
}) {
  const figure = formatAssetFixed(value, meta, 6);
  return (
    <>
      {figure}
      {symbol ? <span className="only-wide"> {symbol}</span> : null}
    </>
  );
}
