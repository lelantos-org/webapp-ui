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
import type { TxPhase } from "@/features/tx";

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

export interface TransferCall {
  /// Shielded address receiving the note.
  recipient: string;
  /// The recipient note's value.
  amount: CircuitAmount;
  asset: bigint;
  /// Asset to pay the relayer in, which the relayer must have quoted. Defaults to the moved asset.
  feeAsset?: bigint | undefined;
}

export interface WithdrawCall {
  /// EVM account the funds are paid out to.
  recipient: string;
  /// The `publicOut` leaving the pool. The protocol fee comes out of it; the relayer fee is on top.
  gross: CircuitAmount;
  asset: bigint;
  /// Pay out native coin via `NativeAdapter`; `asset` must be the wrapped coin's id.
  native: boolean;
  /// Asset to pay the relayer in; see `TransferCall.feeAsset`.
  feeAsset?: bigint | undefined;
}

/// A claim link: a transfer to a generated ephemeral address.
export type GenerateLinkCall = Pick<TransferCall, "amount" | "asset">;

/// Atomic shielded swap. The quote fixes assets and route; a quote that has moved is rejected.
export interface SwapCall {
  quote: SwapQuote;
  /// Asset to pay the relayer in; see `TransferCall.feeAsset`.
  feeAsset?: bigint | undefined;
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
        onPhase: forward(r.onPhase, depositStep),
      }),
    transfer: (r: WithPhase<TransferCall>): Promise<TransferResult> =>
      wallet.transfer({
        recipient: r.recipient,
        amount: r.amount,
        asset: r.asset,
        feeAsset: r.feeAsset,
        autoConsolidate: true,
        onPhase: forward(r.onPhase, spendStep),
      }),
    withdraw: (r: WithPhase<WithdrawCall>): Promise<WithdrawResult> =>
      wallet.withdraw({
        recipient: evmAddress(r.recipient),
        gross: r.gross,
        asset: r.asset,
        native: r.native,
        feeAsset: r.feeAsset,
        autoConsolidate: true,
        onPhase: forward(r.onPhase, spendStep),
      }),
    swap: (r: WithPhase<SwapCall>): Promise<SwapResult> =>
      wallet.swap({
        quote: r.quote,
        feeAsset: r.feeAsset,
        autoConsolidate: true,
        onPhase: forward(r.onPhase, spendStep),
      }),
  };
}

/// The stepper phase for a spend's SDK phase. `confirmed` is left to the lifecycle,
/// since reaching `mined` before the mutation resolves would finish the form with no tx.
export function spendStep(phase: SpendPhase): TxPhase | undefined {
  switch (phase) {
    case "preparing":
    case "consolidating":
      return "preparing";
    case "proving":
    case "submitting":
      return phase;
    case "confirmed":
      return undefined;
  }
}

/// The stepper phase for a deposit's SDK phase.
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

function forward<P>(
  onPhase: ((phase: TxPhase) => void) | undefined,
  step: (phase: P) => TxPhase | undefined,
): ((phase: P) => void) | undefined {
  if (!onPhase) return undefined;
  return (phase) => {
    const s = step(phase);
    if (s !== undefined) onPhase(s);
  };
}
