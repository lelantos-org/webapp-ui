// The local note store's two maintenance actions, behind `WalletDataModal`.

import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { useActiveChain } from "@/features/chain";
import { queryKeys } from "@/shared/query/keys";
import { useWalletInstance } from "../session/context";
import { emptyNotesFile, noteStoreOf } from "../stores/note-store";
import { useInvalidateWalletState } from "../sync/use-wallet-state";

/// Wipe the local note store and resync from scratch.
///
/// Saving a file with no `cursor` is what makes this a hard refresh: the sync
/// that reloads it restarts from the beginning of the feed rather than resuming.
export function useHardRefresh(): { run(): Promise<void>; busy: boolean } {
  const wallet = useWalletInstance();
  const { chainId } = useActiveChain();
  const qc = useQueryClient();
  const invalidate = useInvalidateWalletState();
  const [busy, setBusy] = useState(false);
  const address = wallet?.address;
  const run = useCallback(async () => {
    const store = wallet && noteStoreOf(wallet);
    if (!wallet || !store) return;
    setBusy(true);
    try {
      // The wipe must be serialised against any sync already running.
      // A sync loads the notes file once at entry, mutates it for the whole run
      // and re-saves it in a `finally`, so an in-flight poll would write the
      // pre-wipe notes and its stale cursor back over this and report success
      // having changed nothing. The `disabled={syncing}` guard in the UI does
      // not cover it, reflecting `isFetching` at render time rather than a
      // refetch starting a tick later.
      await qc.cancelQueries({ queryKey: queryKeys.walletState(chainId, address) });
      await store.save(emptyNotesFile());
      // `reload` drops the wallet's in-memory notes for the emptied file before
      // syncing, which is the rescan; the invalidate then refreshes the balances.
      await wallet.sync({ scope: "notes", reload: true });
      await invalidate();
    } finally {
      setBusy(false);
    }
  }, [wallet, invalidate, qc, chainId, address]);
  return { run, busy };
}

/// Drop spent notes from the local note store. Leaves the balance unchanged
/// while shrinking the persisted file and lowering scan cost.
export function useCompactNotes(): { run(): Promise<number>; busy: boolean } {
  const wallet = useWalletInstance();
  const invalidate = useInvalidateWalletState();
  const [busy, setBusy] = useState(false);
  const run = useCallback(async () => {
    if (!wallet) return 0;
    setBusy(true);
    try {
      const { removed } = await wallet.compact();
      if (removed > 0) await invalidate();
      return removed;
    } finally {
      setBusy(false);
    }
  }, [wallet, invalidate]);
  return { run, busy };
}
