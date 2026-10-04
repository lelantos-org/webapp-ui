import type { RecipientRule } from "../schemas";
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

export interface SpendBlockInput extends WalletReadiness, AmountReadiness, FeeReadiness {
  recipient: string;
  recipientRule: RecipientRule;
}

/// The first block on a spend's submit, checked in order: wallet, amount, recipient, fee.
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
  const problem = input.recipientRule.problem(input.recipient);
  return problem === undefined ? undefined : blockedBy(problem);
}
