import type { Ladder } from "@lelantos-org/sdk/protocol";
import { skipToken, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import type { RegisteredAsset } from "@/config/chains";
import { useActiveChain } from "@/features/chain";
import { NO_META } from "@/features/op-form";
import { useWalletInstance } from "@/features/wallet";
import { queryKeys } from "@/shared/query/keys";
import { type LadderModel, ladderModel } from "./ladder";

/// What `useLadder` reads.
export interface LadderPanelInputs {
  selected: RegisteredAsset | undefined;
  /// The entered gross, in circuit units.
  amount: bigint | undefined;
  max: bigint | undefined;
}

/// The denomination picker's model for the selected asset.
export function useLadder({ selected, amount, max }: LadderPanelInputs): LadderModel {
  const ladder = useAssetLadder(selected?.id);
  return useMemo(
    () => ladderModel({ ladder, meta: selected ?? NO_META, amount, max }),
    [ladder, selected, amount, max],
  );
}

/// Stable empty ladder, so dependent memos are not invalidated every render.
const NO_LADDER: Ladder = [];

/// The asset's withdrawal ladder as the wallet resolved it, in circuit units; empty while loading or when none.
function useAssetLadder(asset: bigint | undefined): Ladder {
  const wallet = useWalletInstance();
  const { chainId } = useActiveChain();

  const { data } = useQuery<Ladder>({
    queryKey: queryKeys.assetLadder(chainId, asset),
    queryFn:
      wallet && asset !== undefined ? async () => (await wallet.asset(asset)).ladder : skipToken,
    staleTime: Number.POSITIVE_INFINITY,
  });

  return data ?? NO_LADDER;
}
