import type {
  DepositResult,
  SwapResult,
  TransferResult,
  WalletApi,
  WithdrawResult,
} from "@lelantos-org/sdk";
import { env } from "@/config/env";
import type { ShieldedActions, WithAsset } from "@/features/actions/port";

/// Adapt the SDK's `WalletApi` to the webapp's `ShieldedActions` port. Pure
/// translation — no caching, no retries, no logging. Cross-cutting concerns
/// live above this layer (mutation hooks, instrumentation).
///
/// SDK results are returned as-is, tagged with an `asset: bigint` (the UI
/// needs it for pending overlays + lifecycle). The per-kind casts are safe:
/// `WalletApi` types every action as `Promise<TransactionResult>` (the union)
/// but each method only ever produces its corresponding variant at runtime.
/// Casting back to the variant gives call sites the narrowed shape without
/// a runtime guard.
export function createSdkActions(wallet: WalletApi): ShieldedActions {
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
        autoConsolidate: true,
        onPhase: r.onPhase,
      })) as TransferResult;
      return withAsset(res, r.asset ?? 1n);
    },
    withdraw: async (r) => {
      const res = (await wallet.withdraw({
        to: r.to,
        amount: r.amount,
        asset: r.asset,
        autoConsolidate: true,
        onPhase: r.onPhase,
      })) as WithdrawResult;
      return withAsset(res, r.asset ?? 1n);
    },
    withdrawEth: async (r) => {
      const res = (await wallet.withdrawEth({
        to: r.to,
        amount: r.amount,
        asset: r.asset,
        autoConsolidate: true,
        onPhase: r.onPhase,
      })) as WithdrawResult;
      return withAsset(res, r.asset);
    },
    swap: async (r) => {
      const wrapperAddress = env.swapWrapperAddress;
      if (!wrapperAddress) throw new Error("VITE_SWAP_WRAPPER_ADDRESS not configured");
      const res = (await wallet.swap({
        assetIn: r.assetIn,
        assetOut: r.assetOut,
        amount: r.amount,
        quote: r.quote,
        wrapperAddress,
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
