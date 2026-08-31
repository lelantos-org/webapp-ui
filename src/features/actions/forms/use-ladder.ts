// Everything `DenominationField` needs, assembled from the asset's ladder and
// the two figures the form already holds.
//
// The split mirrors `use-fee-panel.ts`: the query lives one level up in
// `use-asset-ladder.ts`, the copy and the chip states are decided by the pure
// `ladderModel`, and this joins them so a form states its inputs once.

import { useMemo } from "react";
import type { RegisteredAsset } from "@/features/assets";
import { useAssetLadder } from "../use-asset-ladder";
import { NO_META } from "./amount-field";
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
