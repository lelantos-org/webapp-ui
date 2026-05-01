// "ETH (native)" is encoded as `asset = WETH.id` plus an `asEth` flag by
// the Deposit/Withdraw forms.

import { type RegisteredAsset, useRegisteredAssets } from "@/features/assets/registered-assets";
import { Field } from "@/shared/ui/Field";

export const ETH_OPTION = "eth";

export interface AssetPickerProps {
  /// Either `ETH_OPTION` or the asset id as decimal string.
  value: string;
  onChange(value: string): void;
  /// Prepend an "ETH (native)" option when a WETH-tagged asset exists in the registry.
  showEth?: boolean;
  error?: string;
  label?: string;
}

export function AssetPicker({
  value,
  onChange,
  showEth = false,
  error,
  label = "asset",
}: AssetPickerProps) {
  const q = useRegisteredAssets();
  const list = q.data ?? [];
  const fallback = list.length === 0;
  const weth = showEth ? list.find((a) => a.isWeth) : undefined;

  return (
    <Field label={label} error={error}>
      {({ inputId, descId }) => (
        <select
          id={inputId}
          aria-describedby={descId}
          className="fld__inp"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        >
          {fallback ? <option value="1">asset 1</option> : renderOptions(list, weth)}
        </select>
      )}
    </Field>
  );
}

function renderOptions(list: RegisteredAsset[], weth?: RegisteredAsset) {
  return (
    <>
      {weth ? <option value={ETH_OPTION}>ETH (native)</option> : null}
      {list.map((a) => (
        <option key={a.id.toString()} value={a.id.toString()}>
          {a.symbol}
        </option>
      ))}
    </>
  );
}
