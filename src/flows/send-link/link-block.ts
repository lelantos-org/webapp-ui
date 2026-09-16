// What stops "Create link" from being pressed.
//
// The spend-block questions (`op-form/submit/spend-block.ts`) minus a recipient — the
// link is the recipient — plus two of this form's own: a vault with no room for
// the new record, and the private-channel acknowledgement.

import {
  type AmountReadiness,
  amountBlock,
  blockedBy,
  type FeeReadiness,
  feePendingBlock,
  feeProblemBlock,
  SUBMIT_OPEN,
  type SubmitBlock,
  type WalletReadiness,
  walletReadinessBlock,
} from "@/features/op-form";

export interface LinkBlockInput extends WalletReadiness, AmountReadiness, FeeReadiness {
  /// The network has an asset to send at all.
  hasAsset: boolean;
  /// The vault is full and the user has not saved a copy of the record the new
  /// link would drop.
  vaultFull: boolean;
  /// "I'll share this link only through a private channel" is ticked.
  acknowledged: boolean;
}

/// Why "Create link" is dead, and the sentence under it.
///
/// The wallet's state first, because it makes the amount unjudgeable; then the
/// user's input; then the vault, whose remedy is on screen right above the
/// button; then the fee. The acknowledgement comes after a fee problem, so the
/// box is not the thing the user is told to fix while something they cannot
/// tick their way out of stands behind it — and before a fee still being
/// priced, which resolves on its own.
///
/// An amount the field already flags — more than you hold, more than one
/// transaction allows — holds the button without a sentence, as Send and
/// Unshield do. Keyed off the sentence alone, the button once went live on an
/// over-balance amount and the link failed only after a full proof.
export function linkSubmitBlock(input: LinkBlockInput): SubmitBlock {
  return (
    walletReadinessBlock("sending", input) ??
    (input.hasAsset ? undefined : blockedBy("No assets on this network")) ??
    amountBlock(input) ??
    (input.vaultFull
      ? blockedBy("Export your links first — this one would drop the oldest")
      : undefined) ??
    feeProblemBlock(input.feeBlock) ??
    (input.acknowledged
      ? undefined
      : blockedBy("Tick the box to confirm you'll share it privately")) ??
    feePendingBlock(input.feePending) ??
    SUBMIT_OPEN
  );
}
