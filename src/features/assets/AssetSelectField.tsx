import { forwardRef, type SelectHTMLAttributes } from "react";
import { Field } from "@/shared/ui/Field";
import { type AssetBalanceLabel, assetOptionLabel, assetYieldTag } from "./asset-option";
import { DEFAULT_ASSET_ID, useRegisteredAssets } from "./registered-assets";

export type AssetSelectFieldProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, "className"> & {
  label?: string;
  error?: string;
  /// Balance to show beside each symbol. See `AssetBalanceLabel`.
  balanceOf?: AssetBalanceLabel;
};

/// Asset picker bound to the on-chain registry. Falls back to a single
/// "asset 1" option while the registry is empty or still loading.
export const AssetSelectField = forwardRef<HTMLSelectElement, AssetSelectFieldProps>(
  function AssetSelectField({ label = "asset", error, balanceOf, ...selectProps }, ref) {
    const assets = useRegisteredAssets();
    const fallback = assets.length === 0;

    return (
      <Field label={label} error={error}>
        {({ inputId, descId }) => (
          <select
            {...selectProps}
            ref={ref}
            id={inputId}
            aria-describedby={descId}
            className="fld__inp"
          >
            {fallback ? (
              <option value={DEFAULT_ASSET_ID}>asset {DEFAULT_ASSET_ID}</option>
            ) : (
              assets.map((a) => (
                <option key={a.id.toString()} value={a.id.toString()}>
                  {assetOptionLabel(a.symbol, balanceOf?.(a), assetYieldTag(a))}
                </option>
              ))
            )}
          </select>
        )}
      </Field>
    );
  },
);
