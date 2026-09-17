import { FmdClient } from "@lelantos-org/sdk/services";
import { skipToken, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { env } from "@/config/env";
import { useActiveChain } from "@/features/chain";
import { HEAD_POLL_MS, usePolling } from "@/shared/query/cadence";
import { queryKeys } from "@/shared/query/keys";

/// Server sync watermarks as one comparable token; `null` means unknown, never "unchanged".
export type SyncHead = string | null;

const TIMEOUT_MS = 3_000;

function headClient(chainId: bigint): FmdClient {
  return new FmdClient(env.fmdUrl, chainId, { timeoutMs: TIMEOUT_MS, retries: 0 });
}

/// Poll `/v1/head` for a token that changes only when the server has something new.
export function useSyncHead(): SyncHead {
  const { chainId } = useActiveChain();
  const fmd = useMemo(() => (chainId === undefined ? undefined : headClient(chainId)), [chainId]);
  const { data } = useQuery<SyncHead>({
    queryKey: queryKeys.syncHead(chainId),
    queryFn:
      fmd === undefined
        ? skipToken
        : async () => {
            const head = await fmd.fetchHead();
            return `${head.maxNoteId}:${head.maxNullifierSeq}`;
          },
    ...usePolling(HEAD_POLL_MS),
    staleTime: 0,
    retry: 2,
  });
  return data ?? null;
}
