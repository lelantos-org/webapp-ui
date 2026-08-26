// The connect flow: which wallet first, then the connection.
//
// Split from `use-connection`: choosing among the announced wallets has its own
// state and lifetime, while the connection store tracks the one provider that
// ended up latched. The chosen `rdns` is passed to `walletStore.connect`, so a
// user with several wallets installed selects which one signs rather than
// falling through to `ProviderRegistry.pick`'s tiebreak.

import { useCallback, useState } from "react";
import { type Eip6963ProviderDetail, preferredRdns, walletStore } from "@/features/eip1193";

export interface ConnectFlow {
  /// The wallets to choose between, snapshotted when the picker opened;
  /// `null` while it is closed.
  ///
  /// A snapshot rather than a live subscription, so the list does not reorder
  /// under the cursor when a late extension announces; the modal's copy directs
  /// the user to reopen it in that case.
  choices: Eip6963ProviderDetail[] | null;
  /// What `useWallet().connect` becomes: choose, then connect.
  begin(): void;
  choose(rdns: string): void;
  cancel(): void;
}

export function useConnectFlow(): ConnectFlow {
  const [choices, setChoices] = useState<Eip6963ProviderDetail[] | null>(null);

  const begin = useCallback(() => {
    // Catches an extension installed after boot; `WalletBoot` covers the usual
    // case well before a click is possible.
    walletStore.startDiscovery();
    const discovered = walletStore.getState().discovered;
    if (discovered.length > 1) {
      setChoices(preferredFirst(discovered, preferredRdns()));
      return;
    }
    // One wallet, or none announced yet. `connect()` waits out the announce
    // window and reports "no wallet detected" if it stays empty, so a picker with
    // zero or one row would add a click without adding information.
    void walletStore.connect();
  }, []);

  const choose = useCallback((rdns: string) => {
    setChoices(null);
    void walletStore.connect(rdns);
  }, []);

  // Dismiss closes the picker only: no provider was attached, so there is nothing
  // to disconnect and the store is still `idle`.
  const cancel = useCallback(() => setChoices(null), []);

  return { choices, begin, choose, cancel };
}

/// `preferred` to the front, announcement order preserved otherwise.
///
/// Reconnecting to the same wallet is the common case, and the stored rdns is the
/// only record of which one that was.
function preferredFirst(
  list: Eip6963ProviderDetail[],
  preferred: string | undefined,
): Eip6963ProviderDetail[] {
  if (!preferred) return list;
  const wanted = preferred.toLowerCase();
  const isPreferred = (d: Eip6963ProviderDetail) => d.info.rdns.toLowerCase() === wanted;
  return [...list.filter(isPreferred), ...list.filter((d) => !isPreferred(d))];
}
