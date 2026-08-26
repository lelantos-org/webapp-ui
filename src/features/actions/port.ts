/// Webapp-owned port for shielded actions, decoupling the UI and mutation hooks
/// from the SDK's `WalletApi` shape. Adapters live in sdk-adapter.ts; tests can
/// supply fakes.
///
/// Results are the SDK's `TransactionResult` union plus an `asset: bigint` tag
/// attached by the adapter, since SDK results do not carry the asset id that
/// pending-tx overlays and the lifecycle require.

import type { SwapQuote } from "@lelantos-org/sdk/quoter";
import type {
  DepositPhase,
  DepositResult,
  OnPhase,
  SpendPhase,
  SwapResult,
  TransactionResult,
  TransferResult,
  WithdrawResult,
} from "@lelantos-org/sdk/wallet";

export type { DepositPhase, OnPhase, SpendPhase };

/// Tag any SDK result with the asset id the action operated on. The intersection
/// preserves the `kind` discriminator, so narrowing on `kind` still gates the
/// variant-specific fields.
export type WithAsset<R> = R & { asset: bigint };

/// Webapp-facing result type: a discriminated union over op kinds, plus the
/// asset tag. Switch on `kind` to read variant-specific fields.
export type TxResult = WithAsset<TransactionResult>;

export interface DepositRequest {
  amount: bigint;
  asset?: bigint;
  /// Native-ETH deposit: the SDK calls `submitDepositNative` (payable) rather
  /// than the Permit2-pull path. `asset` must resolve to the WETH registry id.
  asEth?: boolean;
  onPhase?: (phase: DepositPhase) => void;
}

export interface TransferRequest {
  to: string;
  amount: bigint;
  asset?: bigint;
  /// Asset to pay the relayer in. Defaults to the asset being moved.
  ///
  /// A different asset costs two circuit slots — an input note of that asset and
  /// an output for its change — which the default 4x4 shape accommodates. The
  /// relayer must have quoted it, or the SDK rejects the spend before proving
  /// starts.
  feeAsset?: bigint;
  onPhase?: (phase: SpendPhase) => void;
}

export interface WithdrawRequest {
  to: string;
  amount: bigint;
  asset?: bigint;
  /// Asset to pay the relayer in. Defaults to the asset being moved.
  ///
  /// A different asset costs two circuit slots — an input note of that asset and
  /// an output for its change — which the default 4x4 shape accommodates. The
  /// relayer must have quoted it, or the SDK rejects the spend before proving
  /// starts.
  feeAsset?: bigint;
  onPhase?: (phase: SpendPhase) => void;
}

/// Native-ETH withdraw via the MASP WETH bridge. The contract unwraps WETH and
/// forwards raw ETH to `to`. `asset` must be the WETH registry id.
export interface WithdrawEthRequest {
  to: string;
  amount: bigint;
  asset: bigint;
  /// No `feeAsset`, unlike other spends: `WithdrawEthOptions` has none. The
  /// native path binds `NativeAdapter` as both relayer and recipient, so the fee
  /// is paid in the asset being unwrapped.
  onPhase?: (phase: SpendPhase) => void;
}

/// Atomic shielded swap. `quote` is the MetaQuoter route binding, passed through
/// to `wallet.swap`; the wrapper address is resolved at the adapter boundary.
export interface SwapRequest {
  assetIn: bigint;
  assetOut: bigint;
  /// Circuit units of `assetIn`: the gross `publicOut`, with the MASP fee
  /// deducted on top.
  amount: bigint;
  quote: SwapQuote;
  /// Asset to pay the relayer in. Defaults to the asset being moved.
  ///
  /// A different asset costs two circuit slots — an input note of that asset and
  /// an output for its change — which the default 4x4 shape accommodates. The
  /// relayer must have quoted it, or the SDK rejects the spend before proving
  /// starts.
  feeAsset?: bigint;
  onPhase?: (phase: SpendPhase) => void;
}

export interface ShieldedActions {
  deposit(req: DepositRequest): Promise<WithAsset<DepositResult>>;
  transfer(req: TransferRequest): Promise<WithAsset<TransferResult>>;
  withdraw(req: WithdrawRequest): Promise<WithAsset<WithdrawResult>>;
  withdrawEth(req: WithdrawEthRequest): Promise<WithAsset<WithdrawResult>>;
  swap(req: SwapRequest): Promise<WithAsset<SwapResult>>;
}

/// Pre-parsed mutation inputs: `amount` in circuit units and `asset` as its
/// bigint id. Forms convert their string-shaped values into these before calling
/// mutate, using the registered asset's decimals and scale (see
/// `parseAmountForAsset`).
export interface DepositCall {
  amount: bigint;
  asset: bigint;
  asEth: boolean;
}

export interface TransferCall {
  amount: bigint;
  asset: bigint;
  to: string;
  /// Asset to pay the relayer in. Defaults to the asset being moved.
  ///
  /// A different asset costs two circuit slots — an input note of that asset and
  /// an output for its change — which the default 4x4 shape accommodates. The
  /// relayer must have quoted it, or the SDK rejects the spend before proving
  /// starts.
  feeAsset?: bigint;
}

export interface WithdrawCall {
  amount: bigint;
  asset: bigint;
  to: string;
  asEth: boolean;
  /// Asset to pay the relayer in. Defaults to the asset being moved.
  ///
  /// A different asset costs two circuit slots — an input note of that asset and
  /// an output for its change — which the default 4x4 shape accommodates. The
  /// relayer must have quoted it, or the SDK rejects the spend before proving
  /// starts.
  feeAsset?: bigint;
}

export interface GenerateLinkCall {
  amount: bigint;
  asset: bigint;
}

export interface SwapCall {
  assetIn: bigint;
  assetOut: bigint;
  amount: bigint;
  quote: SwapQuote;
  /// Asset to pay the relayer in. Defaults to the asset being moved.
  ///
  /// A different asset costs two circuit slots — an input note of that asset and
  /// an output for its change — which the default 4x4 shape accommodates. The
  /// relayer must have quoted it, or the SDK rejects the spend before proving
  /// starts.
  feeAsset?: bigint;
}
