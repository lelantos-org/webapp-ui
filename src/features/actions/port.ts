/// Webapp-owned port for shielded actions. Decouples UI/mutation hooks from
/// the SDK's `WalletApi` shape; adapters live in sdk-adapter.ts, tests can
/// supply fakes.
///
/// Results are the SDK's `TransactionResult` union plus an `asset: bigint`
/// tag attached by the adapter — SDK results don't carry the asset id and
/// the UI needs it for pending-tx overlays + lifecycle.

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

/// Tag any SDK result with the asset id the action operated on. The
/// intersection preserves the `kind` discriminator so UI code can narrow
/// `(r: WithAsset<TransactionResult>) => r.kind === "deposit"` and TS will
/// gate `r.depositId` correctly.
export type WithAsset<R> = R & { asset: bigint };

/// Webapp-facing result type. Discriminated union over op kinds + asset tag.
/// Switch on `kind` to read variant-specific fields (depositId, change, ...).
export type TxResult = WithAsset<TransactionResult>;

/// Composite phase union covering both deposit and spend ops.
export type ActionPhase = DepositPhase | SpendPhase;

export interface DepositRequest {
  amount: bigint;
  asset?: bigint;
  /// Native-ETH deposit. The SDK calls `submitDepositNative` (payable)
  /// rather than the Permit2-pull path. Asset must resolve to the WETH
  /// registry id.
  asEth?: boolean;
  onPhase?: (phase: DepositPhase) => void;
}

export interface TransferRequest {
  to: string;
  amount: bigint;
  asset?: bigint;
  onPhase?: (phase: SpendPhase) => void;
}

export interface WithdrawRequest {
  to: string;
  amount: bigint;
  asset?: bigint;
  onPhase?: (phase: SpendPhase) => void;
}

/// Native-ETH withdraw via the MASP WETH bridge. The contract unwraps
/// WETH and forwards raw ETH to `to`. `asset` MUST be the WETH registry id.
export interface WithdrawEthRequest {
  to: string;
  amount: bigint;
  asset: bigint;
  onPhase?: (phase: SpendPhase) => void;
}

/// Atomic shielded swap. `quote` is the MetaQuoter route binding (passed
/// straight through to `wallet.swap`). The wrapperAddress is read from
/// env at the adapter boundary.
export interface SwapRequest {
  assetIn: bigint;
  assetOut: bigint;
  /// Circuit units of `assetIn` (gross publicOut — MASP fee deducted on top).
  amount: bigint;
  quote: SwapQuote;
  onPhase?: (phase: SpendPhase) => void;
}

export interface ShieldedActions {
  deposit(req: DepositRequest): Promise<WithAsset<DepositResult>>;
  transfer(req: TransferRequest): Promise<WithAsset<TransferResult>>;
  withdraw(req: WithdrawRequest): Promise<WithAsset<WithdrawResult>>;
  withdrawEth(req: WithdrawEthRequest): Promise<WithAsset<WithdrawResult>>;
  swap(req: SwapRequest): Promise<WithAsset<SwapResult>>;
}

/// Pre-parsed mutation inputs: `amount` is a circuit-units bigint, asset
/// is its bigint id. Forms convert their string-shaped form values into
/// these before calling mutate, using the registered asset's decimals +
/// scale (see `parseAmountForAsset`).
export interface DepositCall {
  amount: bigint;
  asset: bigint;
  asEth: boolean;
}

export interface TransferCall {
  amount: bigint;
  asset: bigint;
  to: string;
}

export interface WithdrawCall {
  amount: bigint;
  asset: bigint;
  to: string;
  asEth: boolean;
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
}
