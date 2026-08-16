import { forwardRef, type SelectHTMLAttributes } from "react";
import { DEFAULT_ASSET_ID, useRegisteredAssets } from "@/features/assets/registered-assets";
import { Field } from "@/shared/ui/Field";

export type AssetSelectFieldProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, "className"> & {
  label?: string;
  error?: string;
};

/// Asset picker bound to the on-chain registry. Falls back to a single
/// "asset 1" option while the registry is empty or still loading.
export const AssetSelectField = forwardRef<HTMLSelectElement, AssetSelectFieldProps>(
  function AssetSelectField({ label = "asset", error, ...selectProps }, ref) {
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
                  {a.symbol}
                </option>
              ))
            )}
          </select>
        )}
      </Field>
    );
  },
);
