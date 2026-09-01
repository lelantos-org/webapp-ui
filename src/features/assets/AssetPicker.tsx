// "ETH (native)" is encoded by the deposit and withdraw forms as
// `asset = <a WETH id>` plus an `asEth` flag.

import type { ReactNode } from "react";
import { useActiveChain } from "@/features/chain";
import { Field } from "@/shared/ui/Field";
import { type AssetBalanceLabel, assetOptionLabel, assetYieldTag } from "./asset-option";
import { ethOption } from "./eth-option";
import { DEFAULT_ASSET_ID, useRegisteredAssets } from "./registered-assets";

export interface AssetPickerProps {
  /// Either an `ethOption` value or the asset id as a decimal string.
  value: string;
  onChange(value: string): void;
  /// Prepend an "ETH (native)" option for each WETH-tagged asset.
  showEth?: boolean;
  /// Balance to show beside each symbol. See `AssetBalanceLabel`.
  balanceOf?: AssetBalanceLabel;
  error?: string;
  label?: string;
  /// Control belonging to this field, rendered on the trailing edge of its
  /// label row — the same slot `AmountField` puts its balance and MAX in.
  action?: ReactNode;
}

export function AssetPicker({
  value,
  onChange,
  showEth = false,
  balanceOf,
  error,
  label = "asset",
  action,
}: AssetPickerProps) {
  const list = useRegisteredAssets();
  // Native-ETH deposit and withdraw both run through `NativeAdapter`. A chain
  // with no adapter deployed has no entry point for them, so the option is
  // withheld rather than offered and rejected at submit. Read per render, since
  // the active chain can change.
  const nativeEthSupported = useActiveChain().nativeAdapterAddress !== undefined;
  const fallback = list.length === 0;
  // Every WETH id, not the first: a plain and a yield-bound registration of the
  // same token are both reachable as native coin, and they are different
  // assets. See `eth-option.ts`.
  const weths = showEth && nativeEthSupported ? list.filter((a) => a.isWeth) : [];

  return (
    <Field label={label} error={error} hint={action}>
      {({ inputId, descId, invalid }) => (
        <select
          id={inputId}
          aria-describedby={descId}
          aria-invalid={invalid || undefined}
          className="fld__inp"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        >
          {fallback ? (
            <option value={DEFAULT_ASSET_ID}>asset {DEFAULT_ASSET_ID}</option>
          ) : (
            <>
              {/* A native option spends the shielded notes of the WETH id it
                  names, so it carries that id's balance and yield state rather
                  than ones of its own. Where there are several, the yield tag
                  is what tells them apart — they share the "ETH (native)"
                  name. */}
              {weths.map((a) => (
                <option key={`eth-${a.id}`} value={ethOption(a.id)}>
                  {assetOptionLabel("ETH (native)", balanceOf?.(a), assetYieldTag(a))}
                </option>
              ))}
              {list.map((a) => (
                <option key={a.id.toString()} value={a.id.toString()}>
                  {assetOptionLabel(a.symbol, balanceOf?.(a), assetYieldTag(a))}
                </option>
              ))}
            </>
          )}
        </select>
      )}
    </Field>
  );
}
