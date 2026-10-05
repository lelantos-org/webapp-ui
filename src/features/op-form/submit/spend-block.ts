import { memoProblem } from "@/shared/domain/memo";
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
  /// The memo sent with the spend, on a form that takes one.
  memo?: string | undefined;
}

/// The first block on a spend's submit, checked in order: wallet, amount, recipient, memo, fee.
export function spendSubmitBlock(input: SpendBlockInput): SubmitBlock {
  return (
    walletReadinessBlock("sending", input) ??
    amountBlock(input) ??
    recipientBlock(input) ??
    memoBlock(input) ??
    feeBlockTail(input) ??
    SUBMIT_OPEN
  );
}

function recipientBlock(input: SpendBlockInput): SubmitBlock | undefined {
  if (input.recipient.trim() === "") return blockedBy("Enter a recipient address");
  const problem = input.recipientRule.problem(input.recipient);
  return problem === undefined ? undefined : blockedBy(problem);
}

/// No reason: the memo field shows its own problem as it is typed.
function memoBlock({ memo = "" }: SpendBlockInput): SubmitBlock | undefined {
  return memoProblem(memo) === undefined ? undefined : blockedBy();
}
