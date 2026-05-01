import { useSyncExternalStore } from "react";
import { walletStore, type WalletState } from "@/features/wallet/wallet-store";

/// React-bound view of the wallet store. Selectors should be referentially
/// stable — return primitives or memoised tuples to avoid extra renders.
export function useWalletStore<T>(selector: (s: WalletState) => T): T {
  return useSyncExternalStore(
    walletStore.subscribe,
    () => selector(walletStore.getState()),
    () => selector(walletStore.getState()),
  );
}
