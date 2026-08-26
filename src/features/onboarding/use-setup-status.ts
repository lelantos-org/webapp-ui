// Reads Permit2 AllowanceTransfer setup state for the selected ERC-20 asset.

import { supportsAllowanceTransfer, type WalletApi } from "@lelantos-org/sdk";
import { type UseQueryResult, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { fetchAssetEntry } from "@/features/assets";
import { useActiveChain } from "@/features/chain";
import {
  type Permit2AllowanceState,
  readPermit2AllowanceState,
  SAFETY_BUFFER_SECS,
  useWallet,
} from "@/features/wallet";

export type SetupStatus = Permit2AllowanceState;

/// Keyed by chain rather than by MASP address. The allowance window is a fact
/// about (chain, payer, asset): Permit2 and the pool are deployed per chain and
/// the payer address is the same on all of them, so the chainId keeps one
/// chain's completed setup from being read as another's.
export const setupStatusKey = (chainId?: bigint, payer?: string, asset?: bigint) =>
  [
    "permit2-setup-status",
    chainId?.toString() ?? null,
    payer ?? null,
    asset?.toString() ?? null,
  ] as const;

export interface SetupNeeds {
  /// ERC-20 → Permit2 allowance cannot cover the deposit.
  needsErc20Approve: boolean;
  /// Permit2 → MASP window is missing, too small, or about to expire.
  needsAllowancePermit: boolean;
  /// Either of the above: the deposit cannot proceed until setup runs.
  needsSetup: boolean;
}

export const NO_SETUP_NEEDS: SetupNeeds = {
  needsErc20Approve: false,
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
    needsAllowancePermit,
    needsSetup: needsErc20Approve || needsAllowancePermit,
  };
}

/// Per-asset {@link evaluateSetup}. `totals` is optional and keyed by asset id;
/// an asset with no entry is evaluated as though no amount had been typed, which
/// is an existence check rather than a comparison against a real total.
export function evaluateSetupMany(
  statuses: ReadonlyMap<bigint, SetupStatus | undefined>,
  totals?: ReadonlyMap<bigint, bigint | undefined>,
  nowSecs: number = Math.floor(Date.now() / 1000),
): Map<bigint, SetupNeeds> {
  const out = new Map<bigint, SetupNeeds>();
  for (const [asset, status] of statuses) {
    out.set(asset, evaluateSetup(status, totals?.get(asset), nowSecs));
  }
  return out;
}

/// The single definition of the probe. Both `useSetupStatus` and
/// `useSetupStatusMany` call it, so a change to what setup state means applies to
/// both.
async function fetchSetupStatus(
  wallet: WalletApi,
  asset: bigint,
): Promise<SetupStatus | undefined> {
  const entry = await fetchAssetEntry(wallet, asset);
  return readPermit2AllowanceState(wallet, entry.token);
}

/// Probe the AllowanceTransfer state for `asset`. Returns `undefined` for the
/// native-ETH path, which needs no Permit2, and for adapters without
/// AllowanceTransfer.
export function useSetupStatus(
  asset: bigint | undefined,
  opts: { asEth?: boolean } = {},
): UseQueryResult<SetupStatus | undefined> {
  const { wallet } = useWallet();
  const { chainId } = useActiveChain();
  const enabled =
    !!wallet && asset !== undefined && !opts.asEth && supportsAllowanceTransfer(wallet.chain);

  return useQuery<SetupStatus | undefined>({
    queryKey: setupStatusKey(chainId, wallet?.address, asset),
    enabled,
    queryFn: async () => {
      if (!wallet || asset === undefined) return undefined;
      return fetchSetupStatus(wallet as WalletApi, asset);
    },
    refetchOnWindowFocus: true,
    staleTime: 30_000,
  });
}

/// Probe several assets at once.
///
/// `useQueries` rather than one aggregate query: each asset keeps its own cache
/// entry under `setupStatusKey`, so the prefix invalidation in
/// {@link useInvalidateSetupStatus} reaches them and the single-asset deposit
/// form and the multi-token modal share the same cached reads.
export function useSetupStatusMany(assets: readonly bigint[]): {
  statuses: Map<bigint, SetupStatus | undefined>;
  isLoading: boolean;
  isError: boolean;
} {
  const { wallet } = useWallet();
  const { chainId } = useActiveChain();
  const enabled = !!wallet && supportsAllowanceTransfer(wallet.chain);

  const results = useQueries({
    queries: assets.map((asset) => ({
      queryKey: setupStatusKey(chainId, wallet?.address, asset),
      enabled,
      queryFn: async () => {
        if (!wallet) return undefined;
        return fetchSetupStatus(wallet as WalletApi, asset);
      },
      refetchOnWindowFocus: true,
      staleTime: 30_000,
    })),
  });

  const statuses = new Map<bigint, SetupStatus | undefined>();
  assets.forEach((asset, i) => {
    const r = results[i];
    // Only settled rows are reported. `evaluateSetup(undefined, …)` means the
    // chain cannot answer, so reporting a pending row would read a still-loading
    // probe as requiring no setup.
    if (r?.isSuccess) statuses.set(asset, r.data);
  });

  return {
    statuses,
    isLoading: results.some((r) => r.isLoading),
    isError: results.some((r) => r.isError),
  };
}

/// Invalidator hook used by the setup modal on success.
///
/// With no asset, invalidates every asset for this (chain, payer). The key is
/// always four elements, so passing `undefined` yields `[…, null]`, which is not
/// a prefix of `[…, "5"]` and would match nothing. Dropping the trailing element
/// makes the no-asset form an actual prefix.
export function useInvalidateSetupStatus(): (asset?: bigint) => Promise<void> {
  const { wallet } = useWallet();
  const { chainId } = useActiveChain();
  const qc = useQueryClient();
  const payer = wallet?.address;
  return useCallback(
    async (asset?: bigint) => {
      const key = setupStatusKey(chainId, payer, asset);
      await qc.invalidateQueries({
        queryKey: asset === undefined ? key.slice(0, -1) : key,
      });
    },
    [qc, chainId, payer],
  );
}
