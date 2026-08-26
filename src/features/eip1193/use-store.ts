import { useSyncExternalStore } from "react";
import { type ConnectionState, walletStore } from "./store";

/// React-bound view of the wallet store. Selectors should be referentially
/// stable — return primitives or memoised tuples to avoid extra renders.
export function useWalletStore<T>(selector: (s: ConnectionState) => T): T {
  return useSyncExternalStore(
    walletStore.subscribe,
    () => selector(walletStore.getState()),
    () => selector(walletStore.getState()),
  );
}
