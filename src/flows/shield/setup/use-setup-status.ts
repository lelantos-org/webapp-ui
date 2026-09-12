// Reads Permit2 AllowanceTransfer setup state for the selected ERC-20 asset.

import { type EvmAddress, supportsAllowanceTransfer, type WalletApi } from "@lelantos-org/sdk";
import { type UseQueryResult, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import type { RegisteredAsset } from "@/config/chains";
import { useActiveChain } from "@/features/chain";
import { useWalletInstance } from "@/features/wallet";
import { queryKeys } from "@/shared/query/keys";
import { byDistinctToken } from "./by-token";
import {
  ALLOWANCE_CAP,
  type Permit2AllowanceState,
  readPermit2AllowanceState,
  SAFETY_BUFFER_SECS,
} from "./permit2-setup";

export type SetupStatus = Permit2AllowanceState;

export interface SetupNeeds {
  /// ERC-20 → Permit2 allowance cannot cover the deposit.
  needsErc20Approve: boolean;
  /// Whether a setup run would actually send an approval tx for this asset.
  ///
  /// Distinct from `needsErc20Approve`, which gates the deposit and so compares
  /// against the total. `ensurePermit2AuthorizedSetupBatch` compares against the
  /// cap it is about to grant, so an allowance covering this deposit but sitting
  /// below the cap is approved anyway. Predicting it with the gating comparison
  /// leaves the stepper without a row for a prompt the wallet does show, and the
  /// cost line one step short.
  willApproveErc20: boolean;
  /// Permit2 → MASP window is missing, too small, or about to expire.
  needsAllowancePermit: boolean;
  /// Either of the above: the deposit cannot proceed until setup runs.
  needsSetup: boolean;
}

export const NO_SETUP_NEEDS: SetupNeeds = {
  needsErc20Approve: false,
  willApproveErc20: false,
  needsAllowancePermit: false,
  needsSetup: false,
};

/// Decide what the user must authorize before depositing `total` (amount plus
/// protocol fee, in token base units).
///
/// Both allowances are compared against the real total, matching the SDK's
/// `pickDepositStrategy`: it takes the AllowanceTransfer path only when the
/// window covers `total`, otherwise falling back to the per-deposit witness
/// path, which needs an ERC-20 allowance of its own. A check against any lower
/// threshold passes here and then fails on-chain.
///
/// Before an amount is typed there is no total to compare against, but a token
/// with nothing approved still needs setup, since zero covers no amount. The
/// probe then acts as an existence check and tightens to the exact total once
/// the fee preview resolves.
///
/// An `undefined` status means the probe could not answer — this chain has no
/// Permit2 to authorize against — so there is nothing for setup to do. An
/// all-zero reading would instead mean nothing is approved yet, putting the
/// deposit behind a setup flow that cannot succeed.
export function evaluateSetup(
  status: SetupStatus | undefined,
  total: bigint | undefined,
  nowSecs: number = Math.floor(Date.now() / 1000),
): SetupNeeds {
  if (!status) return NO_SETUP_NEEDS;
  const target = total ?? 1n;
  const needsErc20Approve = status.erc20Allowance < target;
  const windowCovers =
    status.window.amount >= target && status.window.expiration > nowSecs + SAFETY_BUFFER_SECS;
  const needsAllowancePermit = !windowCovers;
  return {
    needsErc20Approve,
    // The cap the run grants, matching `ensurePermit2AuthorizedSetupBatch`'s own
    // `allowances[i] < e.cap` filter.
    willApproveErc20: status.erc20Allowance < ALLOWANCE_CAP,
    needsAllowancePermit,
    needsSetup: needsErc20Approve || needsAllowancePermit,
  };
}

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
    queryFn: async (): Promise<SetupStatus | undefined> =>
      wallet && token !== undefined ? readPermit2AllowanceState(wallet, token) : undefined,
    refetchOnWindowFocus: true,
    staleTime: 30_000,
  };
}

/// Probe the AllowanceTransfer state for `asset`. Returns `undefined` for the
/// native-ETH path, which needs no Permit2, and for adapters without
/// AllowanceTransfer.
export function useSetupStatus(
  asset: RegisteredAsset | undefined,
  opts: { asEth?: boolean } = {},
): UseQueryResult<SetupStatus | undefined> {
  const wallet = useWalletInstance();
  const { chainId } = useActiveChain();
  // The record, not an id resolved back into one: the caller holds the
  // `RegisteredAsset` already, and `useSetupNeedsByToken` takes records too.
  const enabled =
    !!wallet && asset !== undefined && !opts.asEth && supportsAllowanceTransfer(wallet.chain);

  return useQuery<SetupStatus | undefined>(
    setupStatusQuery(chainId, wallet as WalletApi | undefined, asset?.token, enabled),
  );
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
    if (r?.isSuccess) needs.set(token.toLowerCase(), evaluateSetup(r.data, undefined));
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
