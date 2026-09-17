import { zodResolver } from "@hookform/resolvers/zod";
import type { CircuitAmount } from "@lelantos-org/sdk";
import { useCallback, useLayoutEffect, useRef } from "react";
import {
  type DefaultValues,
  type FieldErrors,
  type FieldValues,
  type Path,
  type PathValue,
  type UseFormRegister,
  type UseFormReturn,
  type UseFormSetValue,
  type UseFormWatch,
  useForm,
} from "react-hook-form";
import type { ZodType, ZodTypeDef } from "zod";
import type { RegisteredAsset } from "@/config/chains";
import { findAsset, useRegisteredAssets } from "@/features/assets";
import type { ActionMutation } from "@/features/ops";
import type { ProgressView } from "@/features/tx";
import { parseAmountInput } from "@/shared/lib/format/asset";
import { createLogger } from "@/shared/lib/logger";

const log = createLogger("forms:submit");

/// Every action form is an amount, as a string, against a chosen asset.
export type ActionFormValues = FieldValues & { amount: string };

export interface ActionFormOptions<T extends ActionFormValues, I, R> {
  /// Input left open: an asset field's `.default()` makes it optional on input only.
  schema: ZodType<T, ZodTypeDef, unknown>;
  defaultValues: DefaultValues<T>;
  action: ActionMutation<I, R>;
  /// The field naming the asset the amount is in; Swap's is `assetIn`.
  assetField?: Path<T>;
}

export interface ActionFormApi<T extends ActionFormValues> {
  form: UseFormReturn<T>;
  register: UseFormRegister<T>;
  watch: UseFormWatch<T>;
  setValue: UseFormSetValue<T>;
  errors: FieldErrors<T>;
  /// `undefined` before the registry loads or for an asset the chain lacks.
  selected: RegisteredAsset | undefined;
  /// Write an amount the user did not type (Max).
  setAmount(formatted: string): void;
  /// Drop the amount, keeping every other field as the user left it.
  clearAmount(): void;
  /// Clear a finished op's stepper and result; call from the first control touched after it.
  clearFinished(): void;
}

/// Builds an action form against a zod schema and resolves its selected asset.
export function useActionForm<T extends ActionFormValues, I, R>({
  schema,
  defaultValues,
  action,
  assetField = "asset" as Path<T>,
}: ActionFormOptions<T, I, R>): ActionFormApi<T> {
  const { mutation, progress } = action;
  const assets = useRegisteredAssets();
  const form = useForm<T>({ resolver: zodResolver(schema), defaultValues });
  const {
    register,
    setValue,
    watch,
    formState: { errors },
  } = form;
  const { reset, getValues } = form;

  // Live values, not the submit snapshot: fields stay editable in flight, and a stale reset could flip `asEth`.
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

  const selected = findAsset(assets, watch(assetField) as string);
  const clearFinished = useClearFinishedOp(mutation, progress);

  return {
    form,
    register,
    watch,
    setValue,
    errors,
    selected,
    setAmount,
    clearAmount,
    clearFinished,
  };
}

/// A callback clearing a finished op's stepper, tx link and error. Gated on `done`, not `!isPending`.
export function useClearFinishedOp<I, R>(
  mutation: ActionMutation<I, R>["mutation"],
  progress: Pick<ProgressView, "done" | "reset">,
): () => void {
  const { done, reset: resetProgress } = progress;
  const { reset: resetMutation } = mutation;
  return useCallback(() => {
    if (!done) return;
    resetProgress();
    resetMutation();
  }, [done, resetProgress, resetMutation]);
}

/// Wraps a submit so it cannot re-enter (a held Enter would race two proofs) or leak a rejection.
function useSubmitOnce<T>(run: (values: T) => Promise<void>): (values: T) => Promise<void> {
  const busy = useRef(false);
  const latest = useRef(run);
  useLayoutEffect(() => {
    latest.current = run;
  });
  return useCallback(async (values: T) => {
    if (busy.current) return;
    busy.current = true;
    try {
      await latest.current(values);
    } catch (e) {
      // Already toasted and rendered by `ActionForm`; only kept out of `unhandledrejection`.
      log.debug("submit rejected", e);
    } finally {
      busy.current = false;
    }
  }, []);
}

/// Sends validated values with the amount in circuit units; resolving `false` means nothing was sent.
export type ActionSend<T> = (
  values: T,
  ctx: { asset: RegisteredAsset; amount: CircuitAmount },
) => Promise<unknown>;

/// Options for `useActionSubmit`.
export interface ActionSubmitOptions {
  /// Whatever else the send needs is in place; `false` makes the submit a no-op.
  ready?: boolean;
  /// Report an amount `parseAmountInput` refuses on the field instead of dropping the submit.
  onParseError?(error: unknown): void;
}

/// The form's submit handler: parse, send once, clear the amount on success.
export function useActionSubmit<T extends ActionFormValues>(
  api: ActionFormApi<T>,
  send: ActionSend<T>,
  { ready = true, onParseError }: ActionSubmitOptions = {},
): (e?: React.BaseSyntheticEvent) => Promise<void> {
  const { form, selected, clearAmount } = api;
  return form.handleSubmit(
    useSubmitOnce(async (values: T) => {
      if (!selected || !ready) return;
      let amount: CircuitAmount;
      try {
        amount = parseAmountInput(values.amount, selected);
      } catch (e) {
        if (!onParseError) throw e;
        onParseError(e);
        return;
      }
      if ((await send(values, { asset: selected, amount })) === false) return;
      clearAmount();
    }),
  );
}
