// One native entry per WETH id: resolving "ETH" to the first one deposits into the wrong asset.

import { useCallback } from "react";
import type { FieldValues, Path, UseFormReturn } from "react-hook-form";

/// A picker value naming the WETH id to spend native coin through (`eth:<id>`).
export function ethOption(assetId: string | bigint): string {
  return `eth:${assetId}`;
}

function parseEthOption(value: string): string | undefined {
  return value.startsWith("eth:") ? value.slice("eth:".length) : undefined;
}

/// How a form names the asset it moves: native ETH is a WETH id plus `asEth`, shown as ETH.
export interface NativeEthView {
  /// The symbol shown: "ETH" on the native path, else the asset's.
  symbol: string | undefined;
  /// For `FeePanelInputs.spendSymbol`: "ETH" on the native path only.
  spendSymbol: "ETH" | undefined;
  /// Token address for the pill's artwork; none on the native path.
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

/// The picker value over a form's `asset` and `asEth` fields, which it watches itself.
export function useEthAssetField<T extends FieldValues & AssetEthForm>(
  form: Pick<UseFormReturn<T>, "watch" | "setValue">,
): EthAssetField {
  const asset = form.watch("asset" as Path<T>) as string;
  const asEth = form.watch("asEth" as Path<T>) as boolean;
  const { setValue } = form;
  const onPickerChange = useCallback(
    (next: string) => {
      // biome-ignore lint/suspicious/noExplicitAny: setValue's path generic cannot express a field name shared across both form schemas
      const set = setValue as any;
      // The id travels in the sentinel. Never look WETH up by symbol: its yield twin shares it.
      const eth = parseEthOption(next);
      set("asset", eth ?? next, { shouldDirty: true });
      set("asEth", eth !== undefined, { shouldDirty: true });
    },
    [setValue],
  );
  return { asset, asEth, pickerValue: asEth ? ethOption(asset) : asset, onPickerChange };
}
