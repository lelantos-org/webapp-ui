// Reads Permit2 AllowanceTransfer setup state for the selected ERC20 asset.

import { supportsAllowanceTransfer, type WalletApi } from "@lelantos-org/sdk";
import { type UseQueryResult, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { fetchAssetEntry } from "@/features/assets/asset-entry";
import { useActiveChain } from "@/features/chain/ChainProvider";
import { useWallet } from "@/features/wallet";
import {
  type Permit2AllowanceState,
  readPermit2AllowanceState,
  SAFETY_BUFFER_SECS,
} from "@/features/wallet/permit2";

export type SetupStatus = Permit2AllowanceState;

/// Keyed by chain, not by MASP address. The allowance window is a fact about
/// (chain, payer, asset): Permit2 and the pool are deployed per chain, and the
/// payer address is the same on all of them, so the chainId is what keeps one
/// chain's "setup complete" from being read as another's.
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
  /// Either of the above; the deposit cannot proceed until setup runs.
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
/// Both allowances are compared against the real total, matching
/// `pickDepositStrategy` in the SDK: it takes the AllowanceTransfer path only
/// when the window covers `total`, and otherwise falls back to the per-deposit
/// witness path, which needs an ERC-20 allowance of its own. A check against
/// any lower threshold passes here and then fails on-chain.
///
/// Before an amount is typed there is no total to compare against, but a token
/// with nothing approved at all still needs setup — zero covers no amount. The
/// probe then behaves as an existence check and tightens to the exact total as
/// soon as the fee preview resolves.
/// `undefined` status means the probe could not answer — this chain has no
/// Permit2 to authorize against — so there is nothing for setup to do. That is
/// the opposite of the all-zero reading it used to receive in that case, which
/// says "nothing is approved yet" and puts the deposit behind a setup flow that
/// cannot succeed.
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

/// Probe the AllowanceTransfer state for `asset`. Returns `undefined` for
/// the native-ETH path (no Permit2 needed) and adapters without AllowanceTransfer.
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
      const entry = await fetchAssetEntry(wallet, asset);
      return readPermit2AllowanceState(wallet as WalletApi, entry.token);
    },
    refetchOnWindowFocus: true,
    staleTime: 30_000,
  });
}

/// Invalidator hook used by the setup modal on success.
///
/// With no asset, invalidates every asset for this (chain, payer). The key is
/// always four elements, so passing `undefined` produced `[…, null]` — which is
/// not a *prefix* of `[…, "5"]`, so React Query matched nothing and the call
/// silently did no work. Dropping the trailing element makes the no-asset form
/// a real prefix, which is what the optional parameter implies.
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
