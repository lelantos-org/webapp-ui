import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { useActiveChain } from "@/features/chain";
import { queryKeys } from "@/shared/query/keys";
import { useWalletInstance } from "../session/context";
import { emptyNotesFile, noteStoreOf } from "../stores/note-store";
import { useInvalidateWalletState } from "../sync/use-wallet-state";

/// Wipe the local note store and resync from the start of the feed.
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
      // Cancel in-flight syncs first, or one would re-save the pre-wipe notes over this.
      await qc.cancelQueries({ queryKey: queryKeys.walletState(chainId, address) });
      await store.save(emptyNotesFile());
      await wallet.sync({ scope: "notes", reload: true });
      await invalidate();
    } finally {
      setBusy(false);
    }
  }, [wallet, invalidate, qc, chainId, address]);
  return { run, busy };
}

/// Drop spent notes from the local note store; the balance is unchanged.
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
