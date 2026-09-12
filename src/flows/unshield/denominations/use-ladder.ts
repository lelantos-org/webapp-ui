// Everything `DenominationField` needs, assembled from the asset's ladder and
// the two figures the form already holds.
//
// The split mirrors `use-fee-panel.ts`: the query is `useAssetLadder` below, the
// copy and the chip states are decided by the pure `ladderModel`, and
// `useLadder` joins them so a form states its inputs once.

import type { Ladder } from "@lelantos-org/sdk/core";
import { skipToken, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import type { RegisteredAsset } from "@/config/chains";
import { useActiveChain } from "@/features/chain";
import { NO_META } from "@/features/op-form";
import { useWalletInstance } from "@/features/wallet";
import { queryKeys } from "@/shared/query/keys";
import { type LadderModel, ladderModel } from "./ladder";

export interface LadderPanelInputs {
  /// The asset being withdrawn.
  selected: RegisteredAsset | undefined;
  /// The entered amount, in circuit units — the gross the withdrawal publishes.
  amount: bigint | undefined;
  /// What a single spend can cover, from `useSpendableMax`.
  max: bigint | undefined;
}

export function useLadder({ selected, amount, max }: LadderPanelInputs): LadderModel {
  const ladder = useAssetLadder(selected?.id);
  return useMemo(
    // `NO_META` never formats anything in practice: no selected asset means no
    // asset id, which means an empty ladder and so no options and no notice. It
    // is here to keep the model total rather than to be used.
    () => ladderModel({ ladder, meta: selected ?? NO_META, amount, max }),
    [ladder, selected, amount, max],
  );
}

/// Shared empty result. A literal `[]` would hand out a fresh array identity on
/// every render while the query is unresolved, invalidating any `useMemo`
/// downstream that lists the ladder as a dependency.
const NO_LADDER: Ladder = [];

/// The withdrawal ladder for one asset.
///
/// Read through `wallet.asset` rather than from the SDK's built-in table. The
/// ladder an amount is judged against is whatever `WalletConfig.denominations`
/// resolved to, and reading the table here would keep offering "10, 20, 50…" to
/// a wallet that opted out or supplied its own, steering users onto a ladder the
/// spend path does not know about. `AssetInfo.ladder` is that resolution, which
/// is what makes the round trip worth more than a pure lookup.
///
/// Fixed for the life of the asset: the denominations are circuit-unit integers
/// keyed on the ERC-20 address, and unlike the human labels drawn for them they
/// do not move with the pool's yield index. Hence the infinite `staleTime` —
/// nothing invalidates this short of a chain or asset switch, and both are in the
/// key.
///
/// Withdrawal denominations for `asset`, ascending, in circuit units.
///
/// Empty while the read is in flight, and empty for good on an asset with no
/// ladder. The two are not distinguished: both mean there is nothing to offer,
/// and a form rendering a "loading denominations" placeholder would flash it on
/// every asset with none.
function useAssetLadder(asset: bigint | undefined): Ladder {
  const wallet = useWalletInstance();
  // Asset ids are unique only within a chain, so the same id names a different
  // token — and a different ladder — elsewhere.
  const { chainId } = useActiveChain();

  const { data } = useQuery<Ladder>({
    queryKey: queryKeys.assetLadder(chainId, asset),
    // `AssetRef` accepts a plain bigint id, so nothing needs branding here:
    // `asset` is already the registry id the picker holds.
    queryFn:
      wallet && asset !== undefined ? async () => (await wallet.asset(asset)).ladder : skipToken,
    staleTime: Number.POSITIVE_INFINITY,
  });

  return data ?? NO_LADDER;
}
