// The picker's native-coin entries, and the bridge between a picker's display
// value (`ethOption` sentinels + asset-id strings) and the form schema fields
// (`asset` + `asEth`).
//
// One per WETH-tagged asset id, not one overall. `NativeAdapter` pins the token
// it wraps, never the asset id — `depositNative` takes `publicAssetId` from the
// request and only requires the pull to measure against wrapped native, and
// `withdrawNative` measures the same delta on the way out. A chain that
// registers WETH twice, once as plain custody and once bound to a yield venue,
// therefore has two native paths that differ only in the id they name, and
// resolving "ETH" to whichever came first would silently deposit into one of
// them.

import { useCallback } from "react";
import type { FieldValues, Path, UseFormReturn } from "react-hook-form";

/// A picker value naming the WETH id to spend native coin through.
///
/// Prefixed rather than bare so it cannot collide with a plain asset id, which
/// is the same decimal string.
export function ethOption(assetId: string | bigint): string {
  return `eth:${assetId}`;
}

/// The asset id inside an `ethOption` value, or `undefined` for a plain one.
export function parseEthOption(value: string): string | undefined {
  return value.startsWith("eth:") ? value.slice("eth:".length) : undefined;
}

/// How a form names the asset it moves, on the native-coin path or off it.
///
/// "ETH (native)" is encoded as a WETH id plus `asEth`, so the registry entry
/// says WETH while the user chose, and the pill shows, ETH. Shield and Unshield
/// both relabel it — the pill, the words, the fee rows and the hints — and used
/// to spell the rule separately.
export interface NativeEthView {
  /// The symbol the screen shows: "ETH" on the native path, the asset's
  /// otherwise, `undefined` with no asset.
  symbol: string | undefined;
  /// For `FeePanelInputs.spendSymbol`: "ETH" on the native path only.
  spendSymbol: "ETH" | undefined;
  /// Token address for the pill's artwork. None on the native path, whose mark
  /// is the coin's rather than the wrapper's.
  address: string | undefined;
}

export function nativeEthView(
  selected: { symbol: string; token?: string } | undefined,
  asEth: boolean,
): NativeEthView {
  return asEth
    ? { symbol: "ETH", spendSymbol: "ETH", address: undefined }
    : { symbol: selected?.symbol, spendSymbol: undefined, address: selected?.token };
}

export interface AssetEthForm {
  asset: string;
  asEth: boolean;
}

export interface EthAssetField {
  /// The `asset` field's value.
  asset: string;
  /// The `asEth` field's value.
  asEth: boolean;
  pickerValue: string;
  /// Pass to the picker's `onChange`; updates `asset` and `asEth` in lockstep.
  onPickerChange(next: string): void;
}

/// The picker's display value over a form's `asset` and `asEth` fields, which
/// it watches itself so a form states them once.
export function useEthAssetField<T extends FieldValues & AssetEthForm>(
  form: Pick<UseFormReturn<T>, "watch" | "setValue">,
): EthAssetField {
  // `watch` is keyed by `Path<T>`. The constraint guarantees both fields exist
  // but the generic cannot express it, so the casts match `useActionForm`'s.
  const asset = form.watch("asset" as Path<T>) as string;
  const asEth = form.watch("asEth" as Path<T>) as boolean;
  const { setValue } = form;
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
  return { asset, asEth, pickerValue: asEth ? ethOption(asset) : asset, onPickerChange };
}
