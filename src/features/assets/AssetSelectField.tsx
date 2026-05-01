import { forwardRef, type SelectHTMLAttributes } from "react";
import { useRegisteredAssets } from "@/features/assets/registered-assets";
import { Field } from "@/shared/ui/Field";

export type AssetSelectFieldProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, "className"> & {
  label?: string;
  error?: string;
};

/// Asset picker bound to the on-chain registry. Falls back to a single
/// "asset 1" option while the registry is empty or still loading.
export const AssetSelectField = forwardRef<HTMLSelectElement, AssetSelectFieldProps>(
  function AssetSelectField({ label = "asset", error, ...selectProps }, ref) {
    const q = useRegisteredAssets();
    const assets = q.data ?? [];
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
              <option value="1">asset 1</option>
            ) : (
              assets.map((a) => (
                <option key={a.id.toString()} value={a.id.toString()}>
                  {a.symbol} (id {a.id.toString()})
                </option>
              ))
            )}
          </select>
        )}
      </Field>
    );
  },
);
