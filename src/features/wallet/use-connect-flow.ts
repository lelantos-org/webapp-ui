// The connect flow: which wallet first, then the connection.
//
// Split from `use-connection` because "which of the announced wallets does the
// user want" is a question with its own state and its own lifetime, while the
// connection store is about the one provider that ended up latched. The store
// has always accepted an `rdns`; nothing ever passed one, so every connect fell
// through to `ProviderRegistry.pick`'s tiebreak and a user with two wallets
// installed had no say in which of them they were about to sign with.

import { useCallback, useState } from "react";
import { type Eip6963ProviderDetail, preferredRdns, walletStore } from "@/features/eip1193";

export interface ConnectFlow {
  /// The wallets to choose between, snapshotted when the picker opened;
  /// `null` while it is closed.
  ///
  /// A snapshot rather than a live subscription: a list that reorders under the
  /// cursor as a late extension announces is worse than one the modal's own
  /// copy already tells you to reopen for.
  choices: Eip6963ProviderDetail[] | null;
  /// What `useWallet().connect` becomes: choose, then connect.
  begin(): void;
  choose(rdns: string): void;
  cancel(): void;
}

export function useConnectFlow(): ConnectFlow {
  const [choices, setChoices] = useState<Eip6963ProviderDetail[] | null>(null);

  const begin = useCallback(() => {
    // Catches an extension installed after boot; `WalletBoot` covers the
    // normal case long before anyone can click.
    walletStore.startDiscovery();
    const discovered = walletStore.getState().discovered;
    if (discovered.length > 1) {
      setChoices(preferredFirst(discovered, preferredRdns()));
      return;
    }
    // One wallet, or none announced yet. `connect()` already waits out the
    // announce window and reports "no wallet detected" if it stays empty — a
    // picker with zero or one row says less and costs a click.
    void walletStore.connect();
  }, []);

  const choose = useCallback((rdns: string) => {
    setChoices(null);
    void walletStore.connect(rdns);
  }, []);

  // Dismiss closes the picker and nothing else: no provider was attached, so
  // there is nothing to disconnect and the store is still `idle`.
  const cancel = useCallback(() => setChoices(null), []);

  return { choices, begin, choose, cancel };
}

/// `preferred` to the front, announcement order preserved otherwise.
///
/// Reconnecting to the same wallet is the common case, and the stored rdns is
/// the only record of what that was.
function preferredFirst(
  list: Eip6963ProviderDetail[],
  preferred: string | undefined,
): Eip6963ProviderDetail[] {
  if (!preferred) return list;
  const wanted = preferred.toLowerCase();
  const isPreferred = (d: Eip6963ProviderDetail) => d.info.rdns.toLowerCase() === wanted;
  return [...list.filter(isPreferred), ...list.filter((d) => !isPreferred(d))];
}
