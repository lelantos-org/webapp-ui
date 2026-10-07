import {
  blockedBy,
  SUBMIT_OPEN,
  type SubmitBlock,
  type WalletReadiness,
  walletReadinessBlock,
} from "@/features/op-form";
import type { FeeReading } from "./fees";
import type { HandleStatus } from "./handle-status";

export interface NameBlockInput extends WalletReadiness {
  handle: HandleStatus;
  /// Where the read of the registrar's fee stands.
  fee: FeeReading["state"];
  /// Why the registration cannot be paid for; `undefined` when it can.
  fundingProblem: string | undefined;
  /// The address to publish has been derived and is on screen.
  addressShown: boolean;
  /// The publish confirmation is ticked for this handle.
  acknowledged: boolean;
}

function handleBlock(handle: HandleStatus): SubmitBlock | undefined {
  switch (handle.kind) {
    case "empty":
      return blockedBy("Enter the handle you want");
    case "invalid":
      // The field says what is wrong with it.
      return blockedBy();
    case "checking":
      return blockedBy("Checking that the handle is free");
    case "check-failed":
      return blockedBy("Couldn't check that the handle is free");
    case "taken":
      return blockedBy("That handle is taken");
    case "available":
      return undefined;
  }
}

function feeBlock(fee: NameBlockInput["fee"]): SubmitBlock | undefined {
  switch (fee) {
    case "loading":
      return blockedBy("Reading the registrar's fee");
    case "failed":
      return blockedBy("Couldn't read the registrar's fee");
    case "ready":
      return undefined;
  }
}

/// Why "Claim" is disabled, and the sentence under it.
export function nameSubmitBlock(input: NameBlockInput): SubmitBlock {
  return (
    walletReadinessBlock("claiming a handle", input) ??
    handleBlock(input.handle) ??
    feeBlock(input.fee) ??
    (input.fundingProblem === undefined ? undefined : blockedBy(input.fundingProblem)) ??
    (input.addressShown ? undefined : blockedBy("Working out the address to publish")) ??
    (input.acknowledged
      ? undefined
      : blockedBy("Tick the box to confirm you understand what becomes public")) ??
    SUBMIT_OPEN
  );
}
