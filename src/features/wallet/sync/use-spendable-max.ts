import type { SpendableMax } from "@lelantos-org/sdk";
import { skipToken, useQuery } from "@tanstack/react-query";
import { useActiveChain } from "@/features/chain";
import type { FeeKind } from "@/shared/domain/op-kind";
import { queryKeys } from "@/shared/query/keys";
import { useWalletInstance } from "../session/context";
import { useWalletState } from "./use-wallet-state";

export type { SpendableMax };

export interface SpendableMaxOpts {
  /// The spend the max is for; decides how the relayer fee is reserved.
  kind: Exclude<FeeKind, "deposit">;
  /// The asset paying the relayer; `undefined` for the asset being spent.
  feeAsset?: bigint | undefined;
  /// A native-coin withdrawal, priced on its own relayer estimate.
  native?: boolean;
  /// The fee the form shows. Not sent; it only keys the read.
  quotedFee?: bigint | undefined;
}

/// The largest amount of `asset` a spend can cover now (via `wallet.spendableMax`); `undefined` while unknown.
export function useSpendableMax(
  asset: bigint | undefined,
  { kind, feeAsset, native = false, quotedFee = 0n }: SpendableMaxOpts,
): SpendableMax | undefined {
  const wallet = useWalletInstance();
  const { chainId } = useActiveChain();
  // Keyed on holdings, not `syncedAt`, which changes every poll and would blank the max.
  const held = useWalletState().data?.balances.find((b) => b.asset === asset);
  const holdings = held ? `${held.notes}:${held.balance}` : "none";

  const { data } = useQuery<SpendableMax>({
    queryKey: queryKeys.spendableMax(chainId, wallet?.address, asset, holdings, {
      kind,
      feeAsset,
      native,
      quotedFee,
    }),
    queryFn:
      wallet && asset !== undefined
        ? () => wallet.spendableMax(asset, { kind, feeAsset, native })
        : skipToken,
    staleTime: Number.POSITIVE_INFINITY,
    placeholderData: (prev) => prev,
  });

  return data;
}
