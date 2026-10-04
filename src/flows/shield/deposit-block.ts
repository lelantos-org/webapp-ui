import { FEE_PENDING_REASON, type FeeBlock } from "@/features/fees";
import { amountTextReason, type SubmitBlock } from "@/features/op-form";
import { joinNames, uncheckedApprovalsLine } from "./setup/setup-copy";
import type { DepositAmount } from "./use-deposit-amount";

export interface DepositBlockInput {
  /// The asset being shielded, or `undefined` with an empty registry.
  symbol: string | undefined;
  amountText: string;
  amount: Pick<
    DepositAmount,
    "parsed" | "validation" | "feeFailed" | "relayerProblem" | "separateFee"
  >;
  /// From `useDepositSetup`; `symbols` names the tokens setup is for.
  setup: {
    applicable: boolean;
    needsSetup: boolean;
    unknown: boolean;
    blocked: boolean;
    symbols: readonly string[];
  };
  /// What stops the relayer being paid (`FeePanel.block`).
  feeBlock: FeeBlock | undefined;
}

function depositBlockedReason(input: DepositBlockInput): string | undefined {
  const { symbol, amount } = input;
  if (!symbol) return "No assets to shield on this network";
  const v = amount.validation;
  if (v.tooLarge || v.insufficient) return undefined;
  const textReason = amountTextReason(input.amountText, amount.parsed, symbol);
  if (textReason) return textReason;
  if (amount.relayerProblem === "quote-failed") return "Couldn't get the relayer's fee — try again";
  if (amount.relayerProblem === "not-accepted") {
    return amount.separateFee
      ? `The relayer doesn't take ${amount.separateFee.symbol} for its fee right now`
      : `The relayer doesn't take ${symbol} deposits right now`;
  }
  if (input.feeBlock?.kind === "shortfall") {
    return `Not enough ${input.feeBlock.symbol} in your wallet for the relayer fee`;
  }
  if (amount.feeFailed) return "Couldn't read the network fee — try again";
  const setup = input.setup.applicable ? input.setup : undefined;
  const setupNames = setup?.symbols.length ? setup.symbols : [symbol];
  if (setup?.unknown) return `${uncheckedApprovalsLine(setupNames)} — run setup`;
  if (setup?.needsSetup) return `Set up ${joinNames(setupNames)} first`;
  if (v.feeUnknown) return FEE_PENDING_REASON;
  if (setup?.blocked) return `Checking ${symbol}'s approval…`;
  return undefined;
}

export interface DepositSubmitBlock extends SubmitBlock {
  /// Only the one-time setup stands between the form and the deposit: the button runs it, then
  /// shields, instead of sending the user to a second control and back.
  setupFirst: boolean;
}

const SETUP_DONE = { needsSetup: false, unknown: false, blocked: false } as const;

/// Shield's submit state and the reason under it; `disabled` is not derived from the reason.
export function depositSubmitBlock(input: DepositBlockInput): DepositSubmitBlock {
  const { setup } = input;
  const valid = input.amount.validation.valid && !input.feeBlock;
  const setupPending = setup.applicable && (setup.needsSetup || setup.unknown);
  // Ready but for setup: nothing else would hold the form with setup out of the picture.
  const readyButForSetup =
    valid && depositBlockedReason({ ...input, setup: { ...setup, ...SETUP_DONE } }) === undefined;
  if (setupPending && readyButForSetup) return { disabled: false, setupFirst: true };

  const reason = depositBlockedReason(input);
  const disabled = !valid || setup.blocked;
  return reason === undefined
    ? { disabled, setupFirst: false }
    : { disabled, reason, setupFirst: false };
}
