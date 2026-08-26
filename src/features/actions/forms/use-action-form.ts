// The spine every action form shares, so the three of them differ only where
// they actually differ.
//
// Deposit, transfer and withdraw were each ~120 lines that opened with the same
// twenty: build the form against a zod schema, read the registered assets,
// resolve the selected one, wire the amount controls, clear a finished op, and
// wrap the submit so it parses the amount, calls the mutation and clears the
// field. Only the middle of that list is interesting per form, and a change to
// any of the rest — the submit guard, the reset semantics — meant three edits
// that could silently diverge.
//
// What stays in the forms: their fields, their hints, and whatever else is
// genuinely theirs (the ETH picker, the fee preview, the deposit setup flow).

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

/// Every action form is an amount against a chosen asset. Both are strings
/// because they are bound to inputs; `asset` is parsed by the schema.
export type ActionFormValues = FieldValues & { amount: string; asset: string };

export interface ActionFormOptions<T extends ActionFormValues, I, R> {
  /// Input is left open: `asset` carries a zod `.default()`, so the schema's
  /// input type has it optional while its output does not.
  schema: ZodType<T, ZodTypeDef, unknown>;
  defaultValues: DefaultValues<T>;
  action: ActionMutation<I, R>;
  /// Called with the validated values, the resolved asset, and the amount
  /// already converted to circuit units. Returning is what clears the amount,
  /// so a rejected submit leaves the user's entry in place.
  send(values: T, ctx: { asset: RegisteredAsset; amount: bigint }): Promise<unknown>;
}

export interface ActionFormApi<T extends ActionFormValues> {
  form: UseFormReturn<T>;
  register: UseFormRegister<T>;
  watch: UseFormWatch<T>;
  setValue: UseFormSetValue<T>;
  errors: FieldErrors<T>;
  /// The asset the picker currently names, or `undefined` before the registry
  /// has loaded or if it names one the chain does not have.
  selected: RegisteredAsset | undefined;
  /// Write an amount the user did not type (the "max" button).
  setAmount(formatted: string): void;
  /// Clear a finished op's stepper and inline result. Call from whatever the
  /// user touches first after a completed submit, usually the asset picker.
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
  // `watch` is keyed by `Path<T>`; the constraint above guarantees the field
  // exists, but the generic cannot see it — the same cast `useAmountControls`
  // makes for `amount`.
  const selected = findAsset(assets, watch("asset" as Path<T>) as string);
  const clearFinished = useClearFinishedOp(mutation, progress);

  const onSubmit = handleSubmit(
    useSubmitOnce(async (values: T) => {
      // No asset means the registry has not resolved the picker's value; there
      // is nothing to send and nothing worth reporting.
      if (!selected) return;
      const amount = parseAmountForAsset(values.amount, selected.decimals, selected.scale);
      await send(values, { asset: selected, amount });
      clearAmount();
    }),
  );

  return { form, register, watch, setValue, errors, selected, setAmount, clearFinished, onSubmit };
}
