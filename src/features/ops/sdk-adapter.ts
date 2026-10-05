import {
  type CircuitAmount,
  type DepositPhase,
  type DepositResult,
  evmAddress,
  type SpendPhase,
  type SwapQuote,
  type SwapResult,
  type TransferResult,
  type WalletApi,
  type WithdrawResult,
} from "@lelantos-org/sdk";
import { type Step, stepsFor, type TxPhase } from "@/features/tx";
import { isProverLoaded, whenProverLoaded } from "@/features/wallet";
import type { OpKind } from "@/shared/domain/op-kind";
import type { RelayerFeeTerms } from "@/shared/domain/relayer-fee";

/// Pre-parsed deposit inputs: amounts in circuit units, assets as bigint ids.
export interface DepositCall {
  /// The principal: the new note's value. Fees are charged on top.
  amount: CircuitAmount;
  asset: bigint;
  /// Native-coin deposit via `NativeAdapter`; `asset` must be the wrapped coin's id.
  native: boolean;
  /// Asset to pay the relayer in. Defaults to the deposited asset.
  feeAsset?: bigint | undefined;
}

export interface TransferCall extends RelayerFeeTerms {
  /// Shielded address receiving the note.
  recipient: string;
  /// The recipient note's value.
  amount: CircuitAmount;
  asset: bigint;
  /// Text encrypted to the recipient with the note.
  memo?: string | undefined;
}

export interface WithdrawCall extends RelayerFeeTerms {
  /// EVM account the funds are paid out to.
  recipient: string;
  /// The `publicOut` leaving the pool. The protocol fee comes out of it; the relayer fee is on top.
  gross: CircuitAmount;
  asset: bigint;
  /// Pay out native coin via `NativeAdapter`; `asset` must be the wrapped coin's id.
  native: boolean;
}

/// A claim link: a transfer to a generated ephemeral address.
export type GenerateLinkCall = Pick<TransferCall, "amount" | "asset">;

/// Atomic shielded swap. The quote fixes assets and route; a quote that has moved is rejected.
export interface SwapCall extends RelayerFeeTerms {
  quote: SwapQuote;
}

type WithPhase<C> = C & { onPhase?: ((phase: TxPhase) => void) | undefined };

export type ShieldedActions = ReturnType<typeof createSdkActions>;

/// Adapt the SDK's `WalletApi` for the mutation hooks. Spends auto-consolidate.
export function createSdkActions(wallet: WalletApi) {
  return {
    deposit: (r: WithPhase<DepositCall>): Promise<DepositResult> =>
      wallet.deposit({
        amount: r.amount,
        asset: r.asset,
        native: r.native,
        ...(!r.native && r.feeAsset !== undefined ? { feeAsset: r.feeAsset } : {}),
        onPhase: forwardDeposit(r.onPhase),
      }),
    transfer: (r: WithPhase<TransferCall>): Promise<TransferResult> =>
      wallet.transfer({
        recipient: r.recipient,
        amount: r.amount,
        asset: r.asset,
        memo: r.memo,
        feeAsset: r.feeAsset,
        maxFee: r.maxFee,
        autoConsolidate: true,
        onPhase: r.onPhase && spendPhases(r.onPhase),
      }),
    withdraw: (r: WithPhase<WithdrawCall>): Promise<WithdrawResult> =>
      wallet.withdraw({
        recipient: evmAddress(r.recipient),
        gross: r.gross,
        asset: r.asset,
        native: r.native,
        feeAsset: r.feeAsset,
        maxFee: r.maxFee,
        autoConsolidate: true,
        onPhase: r.onPhase && spendPhases(r.onPhase),
      }),
    swap: (r: WithPhase<SwapCall>): Promise<SwapResult> =>
      wallet.swap({
        quote: r.quote,
        feeAsset: r.feeAsset,
        maxFee: r.maxFee,
        autoConsolidate: true,
        onPhase: r.onPhase && spendPhases(r.onPhase),
      }),
  };
}

/// `confirmed` is left to the lifecycle: reaching `mined` before the mutation resolves would
/// finish the form with no tx.
export function spendStep(phase: SpendPhase): TxPhase | undefined {
  switch (phase) {
    case "preparing":
    case "consolidating":
    case "proving":
    case "submitting":
      return phase;
    case "confirmed":
      return undefined;
  }
}

/// A spend's steps, with the prover download where the prover has not been fetched yet.
export function spendSteps(kind: Exclude<OpKind, "deposit">): Step[] {
  return stepsFor(kind, { coldProver: !isProverLoaded() });
}

/// The SDK's spend phases as stepper phases, for `onPhase`. The SDK reports `proving` when it
/// calls the prover; while the prover is still being fetched, that wait is its own step, so it is
/// neither shown nor timed as proving.
export function spendPhases(onPhase: (phase: TxPhase) => void): (phase: SpendPhase) => void {
  let merged = false;
  return (phase) => {
    const step = spendStep(phase);
    if (step === undefined) return;
    // After a merge the SDK picks funds again; the stepper stays on the merge until the proof.
    if (step === "consolidating") merged = true;
    else if (step === "preparing" && merged) return;
    if (step !== "proving" || isProverLoaded()) {
      onPhase(step);
      return;
    }
    onPhase("fetching-prover");
    void whenProverLoaded().then(() => onPhase("proving"));
  };
}

export function depositStep(phase: DepositPhase): TxPhase | undefined {
  switch (phase) {
    case "preparing":
      return undefined;
    case "signing":
    case "submitting":
    case "broadcast":
      return phase;
    case "confirmed":
      return "mined";
  }
}

function forwardDeposit(
  onPhase: ((phase: TxPhase) => void) | undefined,
): ((phase: DepositPhase) => void) | undefined {
  if (!onPhase) return undefined;
  return (phase) => {
    const step = depositStep(phase);
    if (step !== undefined) onPhase(step);
  };
}
