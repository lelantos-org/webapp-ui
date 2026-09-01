// Bridge between the AssetPicker's display value (`ethOption` sentinels +
// asset-id strings) and the form schema fields (`asset` + `asEth`).

import { useCallback } from "react";
import type { UseFormSetValue } from "react-hook-form";
import { ethOption, parseEthOption } from "./eth-option";

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
  const onPickerChange = useCallback(
    (next: string) => {
      // biome-ignore lint/suspicious/noExplicitAny: setValue's path generic cannot express a field name shared across both form schemas
      const set = setValue as any;
      // The id travels inside the sentinel, so the registry is not consulted
      // here. Picking the WETH id by symbol would have to choose between a
      // plain and a yield-bound registration of the same token, which is the
      // choice the user just made.
      const eth = parseEthOption(next);
      set("asset", eth ?? next, { shouldDirty: true });
      set("asEth", eth !== undefined, { shouldDirty: true });
    },
    [setValue],
  );
  return {
    pickerValue: watchedAsEth ? ethOption(watchedAsset) : watchedAsset,
    onPickerChange,
  };
}
