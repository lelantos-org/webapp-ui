// The connect flow: which wallet first, then the connection.
//
// Split from `session.ts`: choosing among the available wallets has its own
// state and lifetime, while the stores track whichever one ended up attached.
// The chosen row is dispatched to the store that owns it, so a user with
// several wallets installed selects which one holds their key rather than
// falling through to `ProviderRegistry.pick`'s tiebreak. Which rows are offered,
// and in what order, is `wallet-offerings.ts`.

import { useCallback, useMemo, useState } from "react";
import { eip1193Store, selectKind } from "@/features/wallet-kinds";
import { useStore } from "@/shared/lib/external-store";
import { offerings, type WalletChoice } from "./wallet-offerings";

export interface ConnectFlow {
  /// The wallets to choose between, snapshotted when the picker opened;
  /// `null` while it is closed.
  ///
  /// A snapshot rather than a live subscription, so the list does not reorder
  /// under the cursor when a late extension announces; the modal's copy directs
  /// the user to reopen it in that case.
  choices: WalletChoice[] | null;
  /// What `useWallet().connect` becomes: choose, then connect.
  begin(): void;
  choose(choice: WalletChoice): void;
  cancel(): void;
}

export function useConnectFlow(): ConnectFlow {
  const [choices, setChoices] = useState<WalletChoice[] | null>(null);

  const begin = useCallback(() => {
    // Catches an extension installed after boot; `WalletProvider`'s mount effect
    // covers the usual case well before a click is possible.
    eip1193Store.startDiscovery();
    const discovered = eip1193Store.getState().discovered;
    const offered = offerings(discovered);
    if (offered.length > 1) {
      setChoices(offered);
      return;
    }
    // One wallet, or none announced yet. `connect()` waits out the announce
    // window and reports "no wallet detected" if it stays empty, so a picker with
    // zero or one row would add a click without adding information.
    //
    // The single row decides the kind rather than being assumed an extension: on
    // a device with no wallet installed but passkeys available, it is the
    // passkey. An empty list is the injected kind, which is the branch that
    // waits. No id is passed either way — zero and one announced wallets are the
    // same case, and `connect()` waits out the announce window itself.
    selectKind(offered[0]?.kind ?? "eip1193");
  }, []);

  const choose = useCallback((choice: WalletChoice) => {
    setChoices(null);
    // `selectKind` detaches the kinds it is not choosing, which is what makes
    // the pick stick; see the invariant on `features/wallet-kinds`. The injected
    // row's `id` is an rdns, naming which of several installed extensions to
    // latch — every other kind has one instance and ignores it.
    selectKind(choice.kind, choice.id);
  }, []);

  // Dismiss closes the picker only: no provider was attached, so there is nothing
  // to disconnect and the store is still `idle`.
  const cancel = useCallback(() => setChoices(null), []);

  return { choices, begin, choose, cancel };
}

/// The same rows the picker would offer, live.
///
/// For the Welcome screen's inline wallet card, which is on screen before any
/// click and so cannot wait for `begin` to snapshot a list. Live rather than a
/// snapshot: nothing is under the cursor yet when an extension announces late,
/// and a card that missed it would tell the user their wallet is not there.
export function useWalletChoices(): WalletChoice[] {
  const discovered = useStore(eip1193Store, (s) => s.discovered);
  return useMemo(() => offerings(discovered), [discovered]);
}
