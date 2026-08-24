// The two things every action form does to its amount field, in one place.

import { useCallback, useMemo } from "react";
import type { DefaultValues, FieldValues, Path, PathValue, UseFormReturn } from "react-hook-form";

/// Any form whose amount field is the one the user retypes per submit.
type AmountForm = FieldValues & { amount: string };

export interface AmountControls {
  /// Drop the amount and keep everything else exactly as the user left it.
  ///
  /// Not a bare `reset()`: that restores `defaultValues`, snapping the asset
  /// picker back to its first entry and blanking the recipient the moment the
  /// tx is broadcast — while the stepper is still advancing, so it reads as the
  /// form clearing itself. The asset, `asEth`, the recipient and the slippage
  /// are standing choices rather than per-submit entries; only the amount is
  /// dropped, so a completed op is never one click from being repeated.
  ///
  /// Reads live values rather than the submitted snapshot: nothing disables
  /// these fields while the tx is in flight, and that window is long (proof
  /// generation, then the post-submit bookkeeping). Resetting from the
  /// submit-time snapshot silently rolled back an asset — or `asEth`, which
  /// decides whether native ETH moves — that the user had changed in the
  /// meantime.
  clearAmount(): void;
  /// Write an amount the user did not type, as the "max" button does.
  /// Validates immediately: the value it writes is exactly the balance, which
  /// is the boundary the validation is about.
  setAmount(formatted: string): void;
}

export function useAmountControls<T extends AmountForm>(
  form: Pick<UseFormReturn<T>, "reset" | "getValues" | "setValue">,
): AmountControls {
  const { reset, getValues, setValue } = form;

  const clearAmount = useCallback(() => {
    reset({ ...getValues(), amount: "" } as DefaultValues<T>);
  }, [reset, getValues]);

  const setAmount = useCallback(
    (formatted: string) => {
      setValue("amount" as Path<T>, formatted as PathValue<T, Path<T>>, {
        shouldDirty: true,
        shouldValidate: true,
      });
    },
    [setValue],
  );

  return useMemo(() => ({ clearAmount, setAmount }), [clearAmount, setAmount]);
}
