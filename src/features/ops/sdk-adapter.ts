// The one boundary between the webapp's mutation hooks and the SDK's `WalletApi`.
//
// A thin mapper: the SDK names every figure and asset on its results, so what is
// left here is the call shapes the forms produce and the translation of the SDK's
// phases into the stepper's.

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

/// Pre-parsed mutation inputs: amounts in circuit units and assets as bigint ids.
/// Forms convert their string-shaped values into these before calling mutate,
/// using the registered asset's decimals and scale (see `parseAmountSafe`).
/// `onPhase` is not part of a call: the mutation supplies it from its own stepper.
export interface DepositCall {
  /// The principal: the new note's value. Fees are charged on top.
  amount: CircuitAmount;
  asset: bigint;
  /// Native-coin deposit through `NativeAdapter`: a single payable transaction
  /// rather than the Permit2 pull. `asset` must be the wrapped coin's id.
  native: boolean;
  /// Asset to pay the relayer in. Defaults to the asset being deposited.
  ///
  /// A different asset is a second pull from the public wallet, in its own
  /// token. The SDK refuses one on a native deposit, and a yield asset other than
  /// the deposited one (`INVALID_ARGUMENT`, `argument: "feeAsset"`).
  feeAsset?: bigint | undefined;
}

export interface TransferCall {
  /// Shielded address receiving the note.
  recipient: string;
  /// The recipient note's value.
  amount: CircuitAmount;
  asset: bigint;
  /// Asset to pay the relayer in. Defaults to the asset being moved.
  ///
  /// A different asset costs two circuit slots — an input note of that asset and
  /// an output for its change — which the default 4x6 shape accommodates. The
  /// relayer must have quoted it, or the SDK rejects the spend
  /// (`FEE_ASSET_NOT_QUOTED`) before proving starts.
  feeAsset?: bigint | undefined;
}

export interface WithdrawCall {
  /// EVM account the funds are paid out to.
  recipient: string;
  /// The `publicOut` leaving the pool, as the form's amount field states it. The
  /// protocol fee comes out of it, so the recipient receives a little less; the
  /// relayer fee is paid from notes on top.
  gross: CircuitAmount;
  asset: bigint;
  /// Unwrap through `NativeAdapter` and pay out native coin. `asset` must be the
  /// wrapped coin's id.
  native: boolean;
  /// Asset to pay the relayer in; see `TransferCall.feeAsset`.
  feeAsset?: bigint | undefined;
}

/// A claim link is funded by a transfer to its ephemeral address, so its call is
/// a transfer's amount and asset; the recipient is generated.
export type GenerateLinkCall = Pick<TransferCall, "amount" | "asset">;

/// Atomic shielded swap. The quote fixes both assets, the gross amount and the
/// route the proof binds; `swap` re-derives every figure from it and rejects a
/// quote whose figures have moved since (`QUOTE_STALE`).
export interface SwapCall {
  quote: SwapQuote;
  /// Asset to pay the relayer in. Defaults to the asset being moved; see
  /// `TransferCall.feeAsset`.
  feeAsset?: bigint | undefined;
}

type WithPhase<C> = C & { onPhase?: ((phase: TxPhase) => void) | undefined };

export type ShieldedActions = ReturnType<typeof createSdkActions>;

/// Adapt the SDK's `WalletApi` for the mutation hooks. Pure translation: no
/// caching, retries or logging, which belong to the layers above (mutation
/// hooks, instrumentation).
///
/// Spends consolidate on their own when the notes do not fit the circuit's
/// inputs: the forms offer the balance `spendableMax` reports, which may span
/// more notes than one spend can take.
export function createSdkActions(wallet: WalletApi) {
  return {
    deposit: (r: WithPhase<DepositCall>): Promise<DepositResult> =>
      wallet.deposit({
        amount: r.amount,
        asset: r.asset,
        native: r.native,
        // Only a real choice: on the native path the SDK refuses any other asset.
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

/// The stepper phase a spend's SDK phase advances, or `undefined` for one the
/// step list does not show. A nested consolidation is part of picking the funds.
///
/// `confirmed` — the relayer answering once the spend is mined — is left to the
/// lifecycle, which reports `mined` from the receipt after the mutation resolves:
/// `mined` is a spend's terminal step, and reaching it before the mutation has
/// its result would finish the form with no transaction to link to.
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

/// `spendStep` for a deposit. `preparing` precedes every step the list shows, and
/// `confirmed` is block inclusion — the deposit then waits on the relayer's
/// flush, which the lifecycle reports.
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
