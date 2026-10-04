import { useEffect, useRef } from "react";
import type { Path, PathValue } from "react-hook-form";
import {
  askedAsset,
  heldAsset,
  useBalances,
  useLastUsedAsset,
  usePrices,
  useRegisteredAssets,
} from "@/features/assets";
import type { ActionFormApi, ActionFormValues } from "./use-action-form";

/// Writes `pick` to the asset field once, when `ready`, unless the user has already chosen an
/// asset or typed an amount.
function useOpenOn<T extends ActionFormValues>(
  { form }: ActionFormApi<T>,
  field: Path<T>,
  pick: string | undefined,
  ready: boolean,
): void {
  const settled = useRef(false);
  useEffect(() => {
    if (settled.current || !ready) return;
    settled.current = true;
    const untouched =
      !form.getFieldState(field).isDirty && form.getValues("amount" as Path<T>) === "";
    if (pick === undefined || !untouched || pick === form.getValues(field)) return;
    form.setValue(field, pick as PathValue<T, Path<T>>);
  }, [form, field, pick, ready]);
}

/// Opens a form on the asset the URL names (`?asset=<id>`).
export function useAskedAsset<T extends ActionFormValues>(
  api: ActionFormApi<T>,
  field = "asset" as Path<T>,
): void {
  const assets = useRegisteredAssets();
  useOpenOn(api, field, askedAsset(assets), assets.length > 0);
}

/// Opens a spend form on the asset the URL names, else the one last sent if still held, else the
/// largest holding. Decided once, when the balances are in.
export function useHeldAssetDefault<T extends ActionFormValues>(
  api: ActionFormApi<T>,
  field = "asset" as Path<T>,
): void {
  const assets = useRegisteredAssets();
  const balances = useBalances().data?.balances;
  const prices = usePrices();
  const lastUsed = useLastUsedAsset();

  const asked = askedAsset(assets);
  const held = balances ? heldAsset({ assets, balances, prices, lastUsed }) : undefined;
  const ready = assets.length > 0 && (asked !== undefined || balances !== undefined);
  useOpenOn(api, field, asked ?? held, ready);
}
