// The two operations every action form performs on its amount field.

import { useCallback, useMemo } from "react";
import type { DefaultValues, FieldValues, Path, PathValue, UseFormReturn } from "react-hook-form";

/// Any form whose amount field is the one the user retypes per submit.
type AmountForm = FieldValues & { amount: string };

export interface AmountControls {
  /// Drop the amount and keep everything else exactly as the user left it.
  ///
  /// Not a bare `reset()`, which restores `defaultValues` and would snap the
  /// asset picker back to its first entry and blank the recipient the moment the
  /// tx is broadcast, while the stepper is still advancing. The asset, `asEth`,
  /// the recipient and the slippage are standing choices; only the amount is
  /// dropped, so a completed op is never one click from being repeated.
  ///
  /// Reads live values rather than the submitted snapshot. Nothing disables these
  /// fields while the tx is in flight, and that window covers proof generation
  /// and the post-submit bookkeeping, so resetting from the submit-time snapshot
  /// would roll back an asset — or `asEth`, which decides whether native ETH
  /// moves — that the user changed in the meantime.
  clearAmount(): void;
  /// Write an amount the user did not type, as the "max" button does. Validates
  /// immediately, since the value written sits exactly on the boundary the
  /// validation concerns.
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
