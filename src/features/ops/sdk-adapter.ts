// The one boundary between the webapp's mutation hooks and the SDK's `WalletApi`.
//
// Results are the SDK's `TransactionResult` union plus an `asset: bigint` tag
// attached here. The tag and the tagged union are defined by `features/tx`, which
// is what consumes them — the lifecycle and the pending overlay.

import {
  type DepositResult,
  evmAddress,
  type SwapResult,
  type TransferResult,
  type WalletApi,
  type WithdrawResult,
} from "@lelantos-org/sdk";
import type { CircuitAmount } from "@lelantos-org/sdk/core";
import type { SwapQuote } from "@lelantos-org/sdk/quoter";
import type { DepositPhase, SpendPhase } from "@lelantos-org/sdk/wallet";
import type { ChainEntry } from "@/config/chains";
import { DEFAULT_ASSET } from "@/features/assets";
import type { WithAsset } from "@/features/tx";

/// Pre-parsed mutation inputs: `amount` in circuit units and `asset` as its
/// bigint id. Forms convert their string-shaped values into these before calling
/// mutate, using the registered asset's decimals and scale (see
/// `parseAmountForAsset`). `onPhase` is not part of a call: the mutation supplies
/// it from its own stepper.
export interface DepositCall {
  amount: CircuitAmount;
  asset: bigint;
  /// Native-ETH deposit: the SDK calls `submitDepositNative` (payable) rather
  /// than the Permit2-pull path. `asset` must resolve to the WETH registry id.
  asEth: boolean;
}

export interface TransferCall {
  to: string;
  amount: CircuitAmount;
  asset: bigint;
  /// Asset to pay the relayer in. Defaults to the asset being moved.
  ///
  /// A different asset costs two circuit slots — an input note of that asset and
  /// an output for its change — which the default 4x6 shape accommodates. The
  /// relayer must have quoted it, or the SDK rejects the spend before proving
  /// starts.
  feeAsset?: bigint | undefined;
}

/// A withdraw either way: `asEth` picks `withdrawEth`, which takes no `feeAsset`.
export interface WithdrawCall extends TransferCall {
  asEth: boolean;
}

/// A claim link is funded by a transfer to its ephemeral address, so its call is
/// a transfer's amount and asset; the recipient is generated.
export type GenerateLinkCall = Pick<TransferCall, "amount" | "asset">;

/// Atomic shielded swap. `quote` is the MetaQuoter route binding, passed through
/// to `wallet.swap`; the wrapper address is resolved here.
export interface SwapCall {
  assetIn: bigint;
  assetOut: bigint;
  /// Circuit units of `assetIn`: the gross `publicOut`, with the MASP fee
  /// deducted on top.
  amount: CircuitAmount;
  quote: SwapQuote;
  /// Asset to pay the relayer in. Defaults to the asset being moved; see
  /// `TransferCall.feeAsset`.
  feeAsset?: bigint | undefined;
}

/// A call as the adapter takes it: `asset` may be left to the SDK's default, and
/// the stepper's `onPhase` rides along.
type Request<C, P> = Omit<C, "asset"> & { asset?: bigint; onPhase?: (phase: P) => void };

export type ShieldedActions = ReturnType<typeof createSdkActions>;

/// Adapt the SDK's `WalletApi` for the mutation hooks. Pure translation: no
/// caching, retries or logging, which belong to the layers above (mutation
/// hooks, instrumentation).
///
/// SDK results are returned as-is, tagged with an `asset: bigint` that pending
/// overlays and the lifecycle require. The per-kind casts are sound:
/// `WalletApi` types every action as `Promise<TransactionResult>`, but each
/// method produces only its corresponding variant at runtime, so casting back
/// gives call sites the narrowed shape without a runtime guard.
export function createSdkActions(wallet: WalletApi, chain: ChainEntry) {
  return {
    deposit: async (
      r: Request<Omit<DepositCall, "asEth">, DepositPhase> & { asEth?: boolean },
    ): Promise<WithAsset<DepositResult>> => {
      const res = (await wallet.deposit({
        amount: r.amount,
        asset: r.asset,
        asEth: r.asEth,
        onPhase: r.onPhase,
      })) as DepositResult;
      return withAsset(res, r.asset ?? DEFAULT_ASSET);
    },
    transfer: async (r: Request<TransferCall, SpendPhase>): Promise<WithAsset<TransferResult>> => {
      const res = (await wallet.transfer({
        to: r.to,
        amount: r.amount,
        asset: r.asset,
        feeAsset: r.feeAsset,
        autoConsolidate: true,
        onPhase: r.onPhase,
      })) as TransferResult;
      return withAsset(res, r.asset ?? DEFAULT_ASSET);
    },
    withdraw: async (r: Request<TransferCall, SpendPhase>): Promise<WithAsset<WithdrawResult>> => {
      const res = (await wallet.withdraw({
        to: evmAddress(r.to),
        amount: r.amount,
        asset: r.asset,
        feeAsset: r.feeAsset,
        autoConsolidate: true,
        onPhase: r.onPhase,
      })) as WithdrawResult;
      return withAsset(res, r.asset ?? DEFAULT_ASSET);
    },
    /// Native-ETH withdraw via the MASP WETH bridge. The contract unwraps WETH and
    /// forwards raw ETH to `to`. `asset` must be the WETH registry id.
    withdrawEth: async (
      r: Omit<TransferCall, "feeAsset"> & { onPhase?: (phase: SpendPhase) => void },
    ): Promise<WithAsset<WithdrawResult>> => {
      const res = (await wallet.withdrawEth({
        to: evmAddress(r.to),
        amount: r.amount,
        asset: r.asset,
        // No `feeAsset`: `WithdrawEthOptions` has none. The native path binds
        // `NativeAdapter` as both relayer and recipient, so the fee is paid in
        // the asset being unwrapped.
        autoConsolidate: true,
        onPhase: r.onPhase,
      })) as WithdrawResult;
      return withAsset(res, r.asset);
    },
    swap: async (
      r: SwapCall & { onPhase?: (phase: SpendPhase) => void },
    ): Promise<WithAsset<SwapResult>> => {
      const wrapperAddress = chain.swapWrapperAddress;
      if (!wrapperAddress) {
        throw new Error(`swaps are not available on ${chain.chainName}: no swap wrapper deployed`);
      }
      const res = (await wallet.swap({
        assetIn: r.assetIn,
        assetOut: r.assetOut,
        amount: r.amount,
        quote: r.quote,
        wrapperAddress,
        feeAsset: r.feeAsset,
        autoConsolidate: true,
        onPhase: r.onPhase,
      })) as SwapResult;
      return withAsset(res, r.assetIn);
    },
  };
}

function withAsset<R>(res: R, asset: bigint): WithAsset<R> {
  return Object.assign(res as object, { asset }) as WithAsset<R>;
}
