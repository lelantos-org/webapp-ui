// Reads Permit2 AllowanceTransfer setup state for the selected ERC-20 asset.

import { type EvmAddress, supportsAllowanceTransfer, type WalletApi } from "@lelantos-org/sdk";
import { type UseQueryResult, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { findAsset, type RegisteredAsset, useRegisteredAssets } from "@/features/assets";
import { useActiveChain } from "@/features/chain";
import {
  defaultAllowanceCap,
  type Permit2AllowanceState,
  readPermit2AllowanceState,
  SAFETY_BUFFER_SECS,
  useWallet,
} from "@/features/wallet";
import { byDistinctToken, tokenKey } from "./by-token";

export type SetupStatus = Permit2AllowanceState;

/// Keyed by chain rather than by MASP address. The allowance window is a fact
/// about (chain, payer, token): Permit2 and the pool are deployed per chain and
/// the payer address is the same on all of them, so the chainId keeps one
/// chain's completed setup from being read as another's.
///
/// By **token**, not by asset id. Permit2 keys both halves of setup — the ERC-20
/// approval and the `(owner, token, spender)` allowance — by token, and the pool
/// registers a separate id per yield variant over the same ERC-20. Keyed by id,
/// every variant re-probes its shared token: six ids over three tokens cost six
/// probes on every modal mount and window focus, about five RPC round trips
/// each, for three distinct answers, growing with every yield variant added.
/// Keyed by token the duplication cannot be expressed.
///
/// Lowercased for the reason `by-token.ts` gives: `/chains` sends lowercase and
/// the SDK hands back checksummed, so two spellings would be two cache entries.
const setupStatusKey = (chainId?: bigint, payer?: string, token?: string) =>
  [
    "permit2-setup-status",
    chainId?.toString() ?? null,
    payer ?? null,
    token?.toLowerCase() ?? null,
  ] as const;

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
    willApproveErc20: status.erc20Allowance < defaultAllowanceCap(),
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
    queryKey: setupStatusKey(chainId, wallet?.address, token),
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
  const { wallet } = useWallet();
  const { chainId } = useActiveChain();
  // The record, not an id resolved back into one: the caller holds the
  // `RegisteredAsset` already, and `useSetupStatusMany` takes records too.
  const enabled =
    !!wallet && asset !== undefined && !opts.asEth && supportsAllowanceTransfer(wallet.chain);

  return useQuery<SetupStatus | undefined>(
    setupStatusQuery(chainId, wallet as WalletApi | undefined, asset?.token, enabled),
  );
}

/// Probe several assets at once.
///
/// `useQueries` rather than one aggregate query: each *token* keeps its own
/// cache entry under `setupStatusKey`, so the prefix invalidation in
/// {@link useInvalidateSetupStatus} reaches them and the single-asset deposit
/// form and the multi-token modal share the same cached reads. Assets over a
/// shared token share the entry, which is why six ids cost three probes.
export function useSetupStatusMany(assets: readonly RegisteredAsset[]): {
  statuses: Map<bigint, SetupStatus | undefined>;
  isLoading: boolean;
  isError: boolean;
} {
  const { wallet } = useWallet();
  const { chainId } = useActiveChain();
  const enabled = !!wallet && supportsAllowanceTransfer(wallet.chain);

  // One probe per distinct token, not per asset id. Six ids over three tokens
  // are three reads, and the answer is fanned back out below — the result is
  // still keyed by id, so nothing downstream has to know this happened.
  const tokens = useMemo(() => byDistinctToken(assets).map((a) => a.token), [assets]);

  const results = useQueries({
    queries: tokens.map((token) =>
      setupStatusQuery(chainId, wallet as WalletApi | undefined, token, enabled),
    ),
  });

  const byToken = new Map<string, SetupStatus | undefined>();
  tokens.forEach((token, i) => {
    const r = results[i];
    // Only settled rows are reported. `evaluateSetup(undefined, …)` means the
    // chain cannot answer, so reporting a pending row would read a still-loading
    // probe as requiring no setup.
    if (r?.isSuccess) byToken.set(token.toLowerCase(), r.data);
  });

  const statuses = new Map<bigint, SetupStatus | undefined>();
  for (const asset of assets) {
    const key = tokenKey(asset);
    if (byToken.has(key)) statuses.set(asset.id, byToken.get(key));
  }

  return {
    statuses,
    isLoading: results.some((r) => r.isLoading),
    isError: results.some((r) => r.isError),
  };
}

/// Invalidator hook used by the setup modal on success.
///
/// With no asset, invalidates every token for this (chain, payer). The key is
/// always four elements, so passing `undefined` yields `[…, null]`, which is not
/// a prefix of `[…, "0xabc"]` and would match nothing. Dropping the trailing
/// element makes the no-asset form an actual prefix.
///
/// Callers name an asset id, which is what they have, and it is resolved to its
/// token here. Every id over one token therefore invalidates that token's single
/// entry, so setting up one yield variant clears the others rather than leaving
/// each to re-probe state it already shares.
export function useInvalidateSetupStatus(): (asset?: bigint) => Promise<void> {
  const { wallet } = useWallet();
  const { chainId } = useActiveChain();
  const qc = useQueryClient();
  const registry = useRegisteredAssets();
  const payer = wallet?.address;
  return useCallback(
    async (asset?: bigint) => {
      const token = findAsset(registry, asset)?.token;
      const key = setupStatusKey(chainId, payer, token);
      await qc.invalidateQueries({
        queryKey: asset === undefined ? key.slice(0, -1) : key,
      });
    },
    [qc, chainId, payer, registry],
  );
}
