import {
  type NameFee,
  type NameRecord,
  readNameAvailable,
  readNameFee,
  readNameRecord,
} from "@lelantos-org/sdk/advanced";
import { skipToken, type UseQueryResult, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import type { ChainEntry } from "@/config/chains";
import { queryKeys } from "@/shared/query/keys";
import { namesClient } from "./client";

/// What a registrar read needs of its chain.
type RegistrarChain = Pick<ChainEntry, "chainId" | "readRpcUrl" | "nameRegistrarAddress">;

const STALE_MS = 15_000;
const FEE_STALE_MS = 60_000;

/// The record of `label` on `chain`'s registrar. Idle without a registrar or a label.
export function useNameRecord(
  chain: RegistrarChain | undefined,
  label: string | undefined,
): UseQueryResult<NameRecord> {
  const registrar = chain?.nameRegistrarAddress;
  return useQuery<NameRecord>({
    queryKey: queryKeys.nameRecord(chain?.chainId, registrar, label ?? ""),
    queryFn:
      chain && registrar && label
        ? () => readNameRecord(namesClient(chain), registrar, label)
        : skipToken,
    staleTime: STALE_MS,
  });
}

/// Whether `label` can still be claimed on `chain`'s registrar. Idle without a registrar or a label.
export function useNameAvailable(
  chain: RegistrarChain | undefined,
  label: string | undefined,
): UseQueryResult<boolean> {
  const registrar = chain?.nameRegistrarAddress;
  return useQuery<boolean>({
    queryKey: queryKeys.nameAvailable(chain?.chainId, registrar, label ?? ""),
    queryFn:
      chain && registrar && label
        ? () => readNameAvailable(namesClient(chain), registrar, label)
        : skipToken,
    staleTime: STALE_MS,
  });
}

/// What `chain`'s registrar charges for a registration. Idle without a registrar.
export function useNameFee(chain: RegistrarChain | undefined): UseQueryResult<NameFee> {
  const registrar = chain?.nameRegistrarAddress;
  return useQuery<NameFee>({
    queryKey: queryKeys.nameFee(chain?.chainId, registrar),
    queryFn: chain && registrar ? () => readNameFee(namesClient(chain), registrar) : skipToken,
    staleTime: FEE_STALE_MS,
  });
}

/// Refetches every read of `chain`'s registrar, after a registration changed what it holds.
export function useInvalidateNames(chain: RegistrarChain | undefined): () => Promise<void> {
  const qc = useQueryClient();
  const chainId = chain?.chainId;
  const registrar = chain?.nameRegistrarAddress;
  return useCallback(
    () => qc.invalidateQueries({ queryKey: queryKeys.names(chainId, registrar) }),
    [qc, chainId, registrar],
  );
}
