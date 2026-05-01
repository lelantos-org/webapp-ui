// Bridge between the AssetPicker's display value (`"eth"` sentinel +
// asset-id strings) and the form schema fields (`asset` + `asEth`).

import { useCallback } from "react";
import type { UseFormSetValue } from "react-hook-form";
import { ETH_OPTION } from "@/features/assets/AssetPicker";
import { useRegisteredAssets } from "@/features/assets/registered-assets";

export interface AssetEthForm {
  asset: string;
  asEth: boolean;
}

export interface UseEthAssetPickerResult {
  /// Value to feed into `<AssetPicker value={…} />`.
  pickerValue: string;
  /// Pass to `<AssetPicker onChange={…} />`; updates `asset` and `asEth` in lockstep.
  onPickerChange(next: string): void;
}

export function useEthAssetPicker<T extends AssetEthForm>(
  setValue: UseFormSetValue<T>,
  watchedAsset: string,
  watchedAsEth: boolean,
): UseEthAssetPickerResult {
  const assets = useRegisteredAssets();
  const weth = assets.data?.find((a) => a.isWeth);
  const onPickerChange = useCallback(
    (next: string) => {
      // biome-ignore lint/suspicious/noExplicitAny: react-hook-form generic narrowing isn't worth ceremony here
      const set = setValue as any;
      if (next === ETH_OPTION && weth) {
        set("asset", weth.id.toString(), { shouldDirty: true });
        set("asEth", true, { shouldDirty: true });
      } else {
        set("asset", next, { shouldDirty: true });
        set("asEth", false, { shouldDirty: true });
      }
    },
    [setValue, weth],
  );
  return {
    pickerValue: watchedAsEth ? ETH_OPTION : watchedAsset,
    onPickerChange,
  };
}
