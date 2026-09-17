import type { EvmAddress, WalletApi } from "@lelantos-org/sdk";
import { supportsAllowanceTransfer } from "@lelantos-org/sdk/advanced";
import { useQueries, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useRef } from "react";
import type { RegisteredAsset } from "@/config/chains";
import { useActiveChain } from "@/features/chain";
import { useWalletInstance } from "@/features/wallet";
import { queryKeys } from "@/shared/query/keys";
import { byDistinctToken, tokenKey } from "./by-token";
import { evaluateSetup, type SetupNeeds } from "./evaluate-setup";
import { type Permit2AllowanceState, readPermit2AllowanceState } from "./permit2-setup";

function setupStatusQuery(
  chainId: bigint | undefined,
  wallet: WalletApi | undefined,
  token: EvmAddress | undefined,
  enabled: boolean,
) {
  return {
    queryKey: queryKeys.setupStatus(chainId, wallet?.address, token),
    enabled,
    queryFn: async (): Promise<Permit2AllowanceState | undefined> =>
      wallet && token !== undefined ? readPermit2AllowanceState(wallet, token) : undefined,
    refetchOnWindowFocus: true,
    staleTime: 30_000,
  };
}

/// The AllowanceTransfer state of each token a deposit pulls, in the order given.
export interface SetupStatus {
  /// One entry per asset; `undefined` while unanswered or on a chain that cannot answer.
  data: (Permit2AllowanceState | undefined)[];
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  refetch(): Promise<unknown>;
}

/// Probe the AllowanceTransfer state of each of `assets`; disabled for native ETH.
export function useSetupStatus(
  assets: readonly RegisteredAsset[],
  opts: { asEth?: boolean } = {},
): SetupStatus {
  const wallet = useWalletInstance();
  const { chainId } = useActiveChain();
  const enabled = !!wallet && !opts.asEth && supportsAllowanceTransfer(wallet.chain);

  const results = useQueries({
    queries: assets.map((a) =>
      setupStatusQuery(chainId, wallet as WalletApi | undefined, a.token, enabled),
    ),
  });
  const latest = useRef(results);
  latest.current = results;
  const refetch = useCallback(() => Promise.all(latest.current.map((r) => r.refetch())), []);

  return {
    data: results.map((r) => r.data),
    isLoading: results.some((r) => r.isLoading),
    isError: results.some((r) => r.isError),
    error: results.find((r) => r.error)?.error,
    refetch,
  };
}

/// What each distinct token of `assets` needs, keyed by `tokenKey`; unsettled probes have no entry.
export function useSetupNeedsByToken(assets: readonly RegisteredAsset[]): {
  needs: Map<string, SetupNeeds>;
  isLoading: boolean;
  isError: boolean;
} {
  const wallet = useWalletInstance();
  const { chainId } = useActiveChain();
  const enabled = !!wallet && supportsAllowanceTransfer(wallet.chain);
  const tokens = useMemo(() => byDistinctToken(assets).map((a) => a.token), [assets]);

  const results = useQueries({
    queries: tokens.map((token) =>
      setupStatusQuery(chainId, wallet as WalletApi | undefined, token, enabled),
    ),
  });

  const needs = new Map<string, SetupNeeds>();
  tokens.forEach((token, i) => {
    const r = results[i];
    if (r?.isSuccess) needs.set(tokenKey({ token }), evaluateSetup(r.data, undefined));
  });

  return {
    needs,
    isLoading: results.some((r) => r.isLoading),
    isError: results.some((r) => r.isError),
  };
}

/// Invalidates `token`'s setup probe for the active chain and payer.
export function useInvalidateSetupStatus(): (token: string) => Promise<void> {
  const wallet = useWalletInstance();
  const { chainId } = useActiveChain();
  const qc = useQueryClient();
  const payer = wallet?.address;
  return useCallback(
    (token: string) =>
      qc.invalidateQueries({ queryKey: queryKeys.setupStatus(chainId, payer, token) }),
    [qc, chainId, payer],
  );
}
