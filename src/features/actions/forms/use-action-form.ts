// The spine shared by every action form.
//
// Deposit, transfer and withdraw all build a form against a zod schema, read the
// registered assets, resolve the selected one, wire the amount controls, clear a
// finished op, and wrap the submit so it parses the amount, calls the mutation
// and clears the field. Stating that once keeps the submit guard and reset
// semantics identical across the three.
//
// The forms keep their own fields, hints, and anything specific to them: the ETH
// picker, the fee preview, the deposit setup flow.

import { zodResolver } from "@hookform/resolvers/zod";
import {
  type DefaultValues,
  type FieldErrors,
  type FieldValues,
  type Path,
  type UseFormRegister,
  type UseFormReturn,
  type UseFormSetValue,
  type UseFormWatch,
  useForm,
} from "react-hook-form";
import type { ZodType, ZodTypeDef } from "zod";
import { findAsset, type RegisteredAsset, useRegisteredAssets } from "@/features/assets";
import { parseAmountForAsset } from "@/shared/lib/format";
import type { ActionMutation } from "../mutations";
import { useAmountControls } from "./use-amount-controls";
import { useClearFinishedOp } from "./use-clear-finished-op";
import { useSubmitOnce } from "./use-submit-once";

/// Every action form is an amount against a chosen asset. Both are strings, being
/// bound to inputs; `asset` is parsed by the schema.
export type ActionFormValues = FieldValues & { amount: string; asset: string };

export interface ActionFormOptions<T extends ActionFormValues, I, R> {
  /// The input type is left open: `asset` carries a zod `.default()`, so the
  /// schema's input has it optional while its output does not.
  schema: ZodType<T, ZodTypeDef, unknown>;
  defaultValues: DefaultValues<T>;
  action: ActionMutation<I, R>;
  /// Called with the validated values, the resolved asset, and the amount
  /// converted to circuit units. Returning clears the amount, so a rejected
  /// submit leaves the user's entry in place.
  send(values: T, ctx: { asset: RegisteredAsset; amount: bigint }): Promise<unknown>;
}

export interface ActionFormApi<T extends ActionFormValues> {
  form: UseFormReturn<T>;
  register: UseFormRegister<T>;
  watch: UseFormWatch<T>;
  setValue: UseFormSetValue<T>;
  errors: FieldErrors<T>;
  /// The asset the picker names, or `undefined` before the registry has loaded or
  /// when it names one the chain does not have.
  selected: RegisteredAsset | undefined;
  /// Write an amount the user did not type (the "max" button).
  setAmount(formatted: string): void;
  /// Clear a finished op's stepper and inline result. Call from the first control
  /// the user touches after a completed submit, usually the asset picker.
  clearFinished(): void;
  onSubmit(e?: React.BaseSyntheticEvent): Promise<void>;
}

export function useActionForm<T extends ActionFormValues, I, R>({
  schema,
  defaultValues,
  action,
  send,
}: ActionFormOptions<T, I, R>): ActionFormApi<T> {
  const { mutation, progress } = action;
  const assets = useRegisteredAssets();
  const form = useForm<T>({ resolver: zodResolver(schema), defaultValues });
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = form;
  const { clearAmount, setAmount } = useAmountControls(form);
  // `watch` is keyed by `Path<T>`. The constraint above guarantees the field
  // exists but the generic cannot express it, so the cast matches the one
  // `useAmountControls` makes for `amount`.
  const selected = findAsset(assets, watch("asset" as Path<T>) as string);
  const clearFinished = useClearFinishedOp(mutation, progress);

  const onSubmit = handleSubmit(
    useSubmitOnce(async (values: T) => {
      // No asset means the registry has not resolved the picker's value, so
      // there is nothing to send.
      if (!selected) return;
      const amount = parseAmountForAsset(
        values.amount,
        selected.decimals,
        selected.scale,
        selected.index,
      );
      await send(values, { asset: selected, amount });
      clearAmount();
    }),
  );

  return { form, register, watch, setValue, errors, selected, setAmount, clearFinished, onSubmit };
}
