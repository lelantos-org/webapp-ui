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

import type { CircuitAmount } from "@lelantos-org/sdk/core";
import { useCallback, useState } from "react";
import type { Path } from "react-hook-form";
import { allPriced, crossAssetNote, FeeDetails } from "@/features/fees";
import type { ActionMutation } from "@/features/ops";
import { formatAssetAmount } from "@/shared/lib/format/asset";
import type { ActionFormProps } from "./ActionForm";
import type { AmountHeroProps } from "./AmountHero";
import type { ReviewPanelProps } from "./ReviewPanel";
import { reviewFigure } from "./review";
import { SpendBalance, SpendFeeSummary } from "./SpendParts";
import { type SpendBlockInput, spendSubmitBlock } from "./spend-block";
import type { TxCopy } from "./TxOutcome";
import { type ActionFormApi, type ActionFormValues, useActionSubmit } from "./use-action-form";
import { type SpendAmount, type SpendAmountInputs, useSpendAmount } from "./use-spend-amount";

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
  frame: Omit<ActionFormProps, "header" | "review" | "children">;
  hero: Omit<AmountHeroProps, "label" | "asset">;
  /// `ReviewPanel`'s share of props while the review is open with something to
  /// show; `undefined` otherwise.
  reviewPanel:
    | Pick<ReviewPanelProps, "busy" | "onCancel" | "figure" | "symbol" | "words" | "confirmBlocked">
    | undefined;
}

export function useSpendForm<T extends SpendFormValues, I, R extends { txHash: string }>(
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
    frame: {
      submitLabel: "Review",
      busy: m.isPending,
      error: m.error,
      onSubmit: onFormSubmit,
      submitDisabled: block.disabled,
      blockedReason: block.reason,
      details: <FeeDetails fees={fees} summary={<SpendFeeSummary model={fees.model} />} />,
      footnote: crossAssetNote(fees.model),
      progress,
      txHash: m.data?.txHash,
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

export interface Review {
  /// Showing the summary rather than the fields.
  open: boolean;
  /// Move to the summary. Call from the form's submit handler.
  enter(): void;
  /// Back to the fields, unchanged.
  cancel(): void;
}

/// The pause between filling a spend in and committing it.
///
/// A shielded transfer cannot be reversed, cannot be cancelled, and has no
/// recipient-side confirmation — a wrong address is simply gone. Every other
/// irreversible thing in this app gates itself too: the claim-link generator
/// behind a checkbox, the hard refresh behind an acknowledgement.
///
/// Kept as a hook rather than form state so the reset rules live in one place:
/// any edit to the form must drop the user back out of review, or they could
/// confirm figures they are no longer looking at.
///
/// `fingerprint` is whatever identifies the spend being reviewed — amount,
/// recipient, asset, fee asset. When it changes, review closes: the summary on
/// screen is no longer the thing that would be sent.
///
/// Closed during the render that sees the change, rather than in an effect
/// after it: an effect would let one commit paint the summary over figures it
/// was not opened for. Keyed on the change itself rather than on the fingerprint the
/// review was opened with, so an edit that returns to the reviewed values
/// (A → B → A, as `useFollowMax` can write) still leaves it closed.
export function useReview(fingerprint: string): Review {
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState(fingerprint);
  if (seen !== fingerprint) {
    setSeen(fingerprint);
    if (open) setOpen(false);
  }

  const enter = useCallback(() => setOpen(true), []);
  const cancel = useCallback(() => setOpen(false), []);

  return { open: open && seen === fingerprint, enter, cancel };
}
