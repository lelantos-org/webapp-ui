import { skipToken, type UseQueryResult, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef } from "react";
import { useActiveChain } from "@/features/chain";
import { BALANCE_POLL_MS, BALANCE_STALE_MS, usePolling } from "@/shared/query/cadence";
import { queryKeys } from "@/shared/query/keys";
import { useWalletInstance } from "../session/context";
import { type AssetBalance, computeBalances, type HeldNote, heldNotes } from "./balances";
import { syncProgress } from "./sync-progress-store";
import { useSyncHead } from "./use-sync-head";

export interface WalletState {
  balances: AssetBalance[];
  /// The unspent notes behind `balances`.
  notes: HeldNote[];
  syncedAt: number;
}

const SYNC_LIMIT = 500;

// Invalidate on a watermark change. Not in the query key: a new key blanks `data` and flickers balances.
function useRefetchOnNewHead(): void {
  const head = useSyncHead();
  const invalidate = useInvalidateWalletState();
  const seen = useRef<string | null>(null);
  useEffect(() => {
    if (head === null) return;
    const previous = seen.current;
    seen.current = head;
    if (previous === null || previous === head) return;
    void invalidate();
  }, [head, invalidate]);
}

/// Sync the wallet and derive confirmed balances, polling while the tab is visible.
export function useWalletState(): UseQueryResult<WalletState> {
  const wallet = useWalletInstance();
  const { chainId } = useActiveChain();
  useRefetchOnNewHead();
  return useQuery<WalletState>({
    queryKey: queryKeys.walletState(chainId, wallet?.address),
    queryFn: !wallet
      ? skipToken
      : async () => {
          const token = `${chainId}:${wallet.address}`;
          try {
            await wallet.sync({
              scope: "notes",
              pageSize: SYNC_LIMIT,
              onProgress: (p) => {
                if (p.stream === "notes") syncProgress.scanning(token, p.fetched, p.hits);
              },
            });
          } finally {
            syncProgress.finished(token);
          }
          const notes = heldNotes(await wallet.notes({ spent: false }));
          return { balances: computeBalances(notes), notes, syncedAt: Date.now() };
        },
    ...usePolling(BALANCE_POLL_MS),
    staleTime: BALANCE_STALE_MS,
  });
}

/// A callback that re-syncs wallet state, then re-prices the fee quote. Call after a mutation.
export function useInvalidateWalletState(): () => Promise<void> {
  const wallet = useWalletInstance();
  const { chainId } = useActiveChain();
  const qc = useQueryClient();
  const address = wallet?.address;
  return useCallback(async () => {
    try {
      await qc.invalidateQueries({ queryKey: queryKeys.walletState(chainId, address) });
    } finally {
      void qc.invalidateQueries({ queryKey: queryKeys.feeQuote(chainId, address) });
    }
  }, [qc, chainId, address]);
}
