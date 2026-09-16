// What stops a shielded spend from being submitted.
//
// Shared by transfer and withdraw, which ask the same questions in the same
// order. Pure and exported, so the ordering is testable without a form.

import {
  type AmountReadiness,
  amountBlock,
  blockedBy,
  type FeeReadiness,
  feeBlockTail,
  SUBMIT_OPEN,
  type SubmitBlock,
  type WalletReadiness,
  walletReadinessBlock,
} from "./submit-block";

/// Why the submit button is dead, in the order a user can act on it.
///
/// The swap form has carried a table like this for a while; transfer and
/// withdraw shipped `submitDisabled` with no reason at all, and never gated the
/// recipient — a malformed address was caught by zod only after the click. The
/// ordering follows the same argument `flows/swap/swap-block.ts` makes: the user's
/// own input first, because it is the only thing they can act on directly.
///
/// The wallet's own state comes before even that, though, because it makes the
/// input unjudgeable. Fee problems come last but do block.
///
/// A block without a reason means nothing useful can be said yet under the
/// button — an amount the field already flags.
export interface SpendBlockInput extends WalletReadiness, AmountReadiness, FeeReadiness {
  recipient: string;
  recipientValid: (value: string) => boolean;
  /// Which kind of address the recipient must be, for the message naming it: a
  /// transfer takes a shielded address, a withdraw a public one.
  recipientKind: "shielded" | "public";
}

export function spendSubmitBlock(input: SpendBlockInput): SubmitBlock {
  return (
    walletReadinessBlock("sending", input) ??
    amountBlock(input) ??
    recipientBlock(input) ??
    feeBlockTail(input) ??
    SUBMIT_OPEN
  );
}

function recipientBlock(input: SpendBlockInput): SubmitBlock | undefined {
  if (input.recipient.trim() === "") return blockedBy("Enter a recipient address");
  if (input.recipientValid(input.recipient)) return undefined;
  return blockedBy(
    input.recipientKind === "shielded"
      ? "That is not a shielded address"
      : "That is not a valid public address",
  );
}
