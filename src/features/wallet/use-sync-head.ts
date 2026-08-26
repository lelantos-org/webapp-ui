// Cheap server-watermark poll that gates the expensive wallet sync.

import { FmdClient } from "@lelantos-org/sdk/fmd-server";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { env } from "@/config/env";
import { useActiveChain } from "@/features/chain";
import { HEAD_POLL_MS, usePolling } from "@/shared/lib/activity";

/// Server-side sync watermarks, collapsed to one comparable token.
///
/// A string rather than the object so equality is trivial and a consumer can
/// drop it straight into a dependency array. `null` means "not known yet" and
/// must never be read as "nothing has changed".
export type SyncHead = string | null;

export const syncHeadKey = (chainId?: bigint) =>
  ["sync-head", chainId?.toString() ?? null] as const;

/// Timeout for one watermark read.
///
/// Short on purpose: this runs six times as often as the sync it gates, and a
/// request still hanging when the next tick fires is of no use to anyone. The
/// caller degrades to the plain `BALANCE_POLL_MS` cadence on failure.
const TIMEOUT_MS = 3_000;

/// Client tuned for a poll rather than for a one-shot read.
///
/// Both options override SDK defaults that are wrong at this cadence:
/// `timeoutMs` would be 15s, three times the poll interval, and `retries`
/// would be 3 — which, multiplied by the `retry` below, is a dozen requests
/// per tick against an endpoint whose whole point is being cheap. Retrying is
/// left to React Query so there is exactly one place that decides it.
function headClient(chainId: bigint): FmdClient {
  return new FmdClient(env.fmdUrl, chainId, { timeoutMs: TIMEOUT_MS, retries: 0 });
}

/// Poll `/v1/head` — two indexed `MAX()`s — and return a token that changes
/// only when the server has something new.
///
/// Uses the shared `usePolling`, so the jitter and idle-widening that keep a
/// cadence from fingerprinting a client apply here unchanged.
///
/// A server predating this endpoint 404s and throws; so does one answering
/// with a body missing either watermark, because the SDK decodes the response
/// strictly. Both surface as no data, which leaves the token `null` and lets
/// the sync fall back to its own interval. Note that a *well-formed* `0:0` is
/// a real answer — an empty chain — and is deliberately not conflated with
/// either failure.
export function useSyncHead(): SyncHead {
  const { chainId } = useActiveChain();
  const fmd = useMemo(() => (chainId === undefined ? undefined : headClient(chainId)), [chainId]);
  const { data } = useQuery<SyncHead>({
    queryKey: syncHeadKey(chainId),
    enabled: fmd !== undefined,
    queryFn: async () => {
      if (fmd === undefined) throw new Error("chain not ready");
      const head = await fmd.fetchHead();
      return `${head.maxNoteId}:${head.maxNullifierSeq}`;
    },
    ...usePolling(HEAD_POLL_MS),
    // No `staleTime`: being current is the entire value of this query, and it
    // is cheap enough that a remount refetching costs nothing worth avoiding.
    staleTime: 0,
    // A failing head poll must not strand the wallet. `useWalletState` keeps
    // its own `BALANCE_POLL_MS` floor, so giving up here degrades to the old
    // behaviour rather than to no syncing at all.
    retry: 2,
  });
  return data ?? null;
}
