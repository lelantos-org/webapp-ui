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

/// What a Send or Unshield submit block is judged from.
export interface SpendBlockInput extends WalletReadiness, AmountReadiness, FeeReadiness {
  recipient: string;
  recipientValid: (value: string) => boolean;
  /// Which kind of address the recipient must be, for the message naming it.
  recipientKind: "shielded" | "public";
}

/// Why a spend's submit is dead: wallet, amount, recipient, then fee.
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
