// Reads Permit2 AllowanceTransfer setup state for the ERC-20s a deposit pulls.

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

/// The query both hooks register, spelled once.
///
/// They share one cache entry by construction — the point of keying by token —
/// so a `staleTime` or `refetchOnWindowFocus` changed in one place and not the
/// other would leave the deposit form and the modal disagreeing about whether
/// the same entry is fresh. The token keying exists to remove that class of bug,
/// so the options are not written twice.
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
  /// One entry per asset; `undefined` while its probe has not answered, and for
  /// a chain that cannot answer (see `readPermit2AllowanceState`).
  data: (Permit2AllowanceState | undefined)[];
  isLoading: boolean;
  isError: boolean;
  /// The first probe's failure, for the log.
  error: unknown;
  /// Re-read every probe.
  refetch(): Promise<unknown>;
}

/// Probe the AllowanceTransfer state for each of `assets` — the deposited token,
/// and the one paying the relayer where that is another. Disabled for the
/// native-ETH path, which needs no Permit2, and for adapters without
/// AllowanceTransfer.
export function useSetupStatus(
  assets: readonly RegisteredAsset[],
  opts: { asEth?: boolean } = {},
): SetupStatus {
  const wallet = useWalletInstance();
  const { chainId } = useActiveChain();
  // The records, not ids resolved back into them: the caller holds the
  // `RegisteredAsset`s already, and `useSetupNeedsByToken` takes records too.
  const enabled = !!wallet && !opts.asEth && supportsAllowanceTransfer(wallet.chain);

  const results = useQueries({
    queries: assets.map((a) =>
      setupStatusQuery(chainId, wallet as WalletApi | undefined, a.token, enabled),
    ),
  });
  // Stable, as a single query's `refetch` is: `useQueries` hands back a new
  // array each render, and the setup modal's auto-close is keyed on the callback
  // this ends up in.
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

/// Probe several assets' tokens at once, and say what each needs.
///
/// Per token, keyed by `tokenKey`: the pool registers a separate asset id per
/// yield variant over the same ERC-20, and both halves of setup — the ERC-20
/// approval and the `(owner, token, spender)` allowance — are keyed by token, so
/// six ids over three tokens are three probes and three answers.
///
/// `useQueries` rather than one aggregate query: each token keeps its own cache
/// entry under `queryKeys.setupStatus`, so {@link useInvalidateSetupStatus}
/// reaches it and the single-asset deposit form and the multi-token surfaces
/// share the same cached reads.
///
/// No totals: with no amount typed this is the existence check `evaluateSetup`
/// falls back to. A token whose probe has not settled has no entry, since
/// `evaluateSetup(undefined, …)` means the chain cannot answer and reporting a
/// pending row would read a still-loading probe as requiring no setup.
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

/// Invalidator hook used by the setup flow on success: drops `token`'s probe for
/// this (chain, payer), which every asset id over that token reads.
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
