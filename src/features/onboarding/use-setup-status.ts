// Reads Permit2 AllowanceTransfer setup state for the selected ERC20 asset.

import { supportsAllowanceTransfer, type WalletApi } from "@lelantos-org/sdk";
import { type UseQueryResult, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { useWallet } from "@/features/wallet";
import { needsPermit2AllowanceRenewal } from "@/features/wallet/permit2";

export interface SetupStatus {
  /// True when ERC20 → Permit2 allowance is below `cap` (first time only).
  needsErc20Approve: boolean;
  /// True when Permit2 → MASP allowance window is missing or expired.
  needsAllowancePermit: boolean;
  /// Live read of the on-chain Permit2 allowance window for display.
  current: { amount: bigint; expiration: number; nonce: number };
}

export const setupStatusKey = (payer?: string, asset?: bigint, masp?: string) =>
  ["permit2-setup-status", payer ?? null, asset?.toString() ?? null, masp ?? null] as const;

// Existence probe: any nonzero, unexpired allowance counts as set up.
const SETUP_THRESHOLD = 1n;

/// Probe the AllowanceTransfer state for `asset`. Returns `undefined` for
/// the native-ETH path (no Permit2 needed) and adapters without AllowanceTransfer.
export function useSetupStatus(
  asset: bigint | undefined,
  opts: { asEth?: boolean } = {},
): UseQueryResult<SetupStatus | undefined> {
  const { wallet } = useWallet();
  const enabled =
    !!wallet && asset !== undefined && !opts.asEth && supportsAllowanceTransfer(wallet.chain);

  return useQuery<SetupStatus | undefined>({
    queryKey: setupStatusKey(
      wallet?.address,
      asset,
      // maspAddress is async — placeholder; (payer, asset) is unique enough per chain.
      undefined,
    ),
    enabled,
    queryFn: async () => {
      if (!wallet || asset === undefined) return undefined;
      const entry = await wallet.chain.fetchAsset(asset);
      const renewal = await needsPermit2AllowanceRenewal(
        wallet as WalletApi,
        entry.token,
        SETUP_THRESHOLD,
      );
      return renewal;
    },
    refetchOnWindowFocus: true,
    staleTime: 30_000,
  });
}

/// Invalidator hook used by the setup modal on success.
export function useInvalidateSetupStatus(): (asset?: bigint) => Promise<void> {
  const { wallet } = useWallet();
  const qc = useQueryClient();
  const payer = wallet?.address;
  return useCallback(
    async (asset?: bigint) => {
      await qc.invalidateQueries({
        queryKey: setupStatusKey(payer, asset, undefined),
      });
    },
    [qc, payer],
  );
}
