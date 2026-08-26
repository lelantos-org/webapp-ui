import {
  type DepositResult,
  evmAddress,
  type SwapResult,
  type TransferResult,
  type WalletApi,
  type WithdrawResult,
} from "@lelantos-org/sdk";
import type { ChainEntry } from "@/config/chains";
import type { ShieldedActions, WithAsset } from "./port";

/// Adapt the SDK's `WalletApi` to the webapp's `ShieldedActions` port. Pure
/// translation: no caching, retries or logging, which belong to the layers above
/// (mutation hooks, instrumentation).
///
/// SDK results are returned as-is, tagged with an `asset: bigint` that pending
/// overlays and the lifecycle require. The per-kind casts are sound:
/// `WalletApi` types every action as `Promise<TransactionResult>`, but each
/// method produces only its corresponding variant at runtime, so casting back
/// gives call sites the narrowed shape without a runtime guard.
export function createSdkActions(wallet: WalletApi, chain: ChainEntry): ShieldedActions {
  return {
    deposit: async (r) => {
      const res = (await wallet.deposit({
        amount: r.amount,
        asset: r.asset,
        asEth: r.asEth,
        onPhase: r.onPhase,
      })) as DepositResult;
      return withAsset(res, r.asset ?? 1n);
    },
    transfer: async (r) => {
      const res = (await wallet.transfer({
        to: r.to,
        amount: r.amount,
        asset: r.asset,
        feeAsset: r.feeAsset,
        autoConsolidate: true,
        onPhase: r.onPhase,
      })) as TransferResult;
      return withAsset(res, r.asset ?? 1n);
    },
    withdraw: async (r) => {
      const res = (await wallet.withdraw({
        to: evmAddress(r.to),
        amount: r.amount,
        asset: r.asset,
        feeAsset: r.feeAsset,
        autoConsolidate: true,
        onPhase: r.onPhase,
      })) as WithdrawResult;
      return withAsset(res, r.asset ?? 1n);
    },
    withdrawEth: async (r) => {
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
    swap: async (r) => {
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
