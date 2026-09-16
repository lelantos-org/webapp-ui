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
  /// The unspent notes the balances total, for folds that need each note's
  /// block (yield basis).
  notes: HeldNote[];
  syncedAt: number;
}

const SYNC_LIMIT = 500;

/// Invalidate the wallet state whenever the server's watermark moves.
///
/// This is what makes the sync event-driven: the cheap `/v1/head` poll runs six
/// times as often as `BALANCE_POLL_MS`, and only an actual change triggers the
/// expensive notes sync.
///
/// An effect rather than the head in the query key, since a changing key mints a
/// fresh cache entry per watermark, accumulating entries and blanking `data`
/// while the new key loads, which would flicker the balances to empty on every
/// arriving note.
///
/// The ref keeps the first observed head from counting as a change; without it
/// the initial `null -> "0:0"` transition would invalidate on mount and
/// duplicate the sync the query has just started.
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

/// Sync the wallet and derive confirmed balances, polling while the tab is
/// visible. Mutations should call `useInvalidateWalletState()` after a successful
/// submit.
///
/// Returns only what the wallet has decrypted. Callers wanting the display
/// balance — confirmed plus in-flight — use `useBalances`.
export function useWalletState(): UseQueryResult<WalletState> {
  const wallet = useWalletInstance();
  const { chainId } = useActiveChain();
  useRefetchOnNewHead();
  return useQuery<WalletState>({
    queryKey: queryKeys.walletState(chainId, wallet?.address),
    queryFn: !wallet
      ? skipToken
      : async () => {
          // Notes and the spent set, not the Merkle tree: enough for balances, and a
          // spend syncs the tree itself. `SYNC_LIMIT` is the page size, not a cap:
          // the sync pages the feed to exhaustion from its persisted cursor.
          //
          // The token names this sync, so a superseded run finishing late releases
          // the counter only if it still owns it.
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
            // Also on failure: a stalled counter would read as a sync still
            // running.
            syncProgress.finished(token);
          }
          const notes = heldNotes(await wallet.notes({ spent: false }));
          return { balances: computeBalances(notes), notes, syncedAt: Date.now() };
        },
    // The most expensive poll in the app: a full notes sync plus a balance
    // recompute over every unspent note, on the main thread. Slowed on an
    // unattended tab, which `refetchIntervalInBackground: false` does not cover
    // because that tab is still visible.
    //
    // Retained as a floor even though `head` drives the timely path: the
    // watermark covers `notes` and `spent_nullifiers`, so a balance change that
    // moves neither — or a period where the head poll is failing — still
    // resolves within this interval.
    ...usePolling(BALANCE_POLL_MS),
    // Several components read this query. At `staleTime: 0` every mount — and
    // so every route change into a form — refetches, firing a redundant
    // sync. Mutations still appear immediately, since they invalidate the
    // query explicitly via `useInvalidateWalletState`, which ignores staleTime.
    staleTime: BALANCE_STALE_MS,
  });
}

/// Returns a callback that invalidates the wallet-state query, triggering a sync
/// and balance recompute. Call after successful mutations.
///
/// Also re-prices the relayer fee quote, whose options carry this wallet's
/// balances (`quoteFee` reads the local notes). Only once the sync has landed,
/// since a quote refetched alongside it would read the notes it is replacing;
/// and not awaited, so a caller waiting on the balance — the tracker splicing
/// the pending overlay — does not wait on a relayer round trip as well.
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
