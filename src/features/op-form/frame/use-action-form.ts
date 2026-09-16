// The spine shared by every action form.
//
// Shield, Send, Unshield, Swap and Send by link all build a form against a zod
// schema, read the registered assets, resolve the asset the amount is
// denominated in, wire the amount controls, clear a finished op, and wrap the
// submit so it parses the amount, calls the mutation and clears the field.
// Stating that once keeps the submit guard and reset semantics identical across
// all five.
//
// Two hooks rather than one: `useActionForm` builds the form at the top of a
// component, and `useActionSubmit` wraps the send once everything it reads — the
// fee asset, the quote, the acknowledgement — has been derived from it. A single
// hook taking `send` up front made the form's own types depend on a closure
// over values derived from the form, which the compiler cannot order.
//
// The forms keep their own fields, hints, and anything specific to them: the ETH
// picker, the fee preview, the deposit setup flow.

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

/// Every action form is an amount against a chosen asset. The amount is a
/// string, being bound to an input; the asset field is named per form.
export type ActionFormValues = FieldValues & { amount: string };

export interface ActionFormOptions<T extends ActionFormValues, I, R> {
  /// The input type is left open: an asset field carries a zod `.default()`, so
  /// the schema's input has it optional while its output does not.
  schema: ZodType<T, ZodTypeDef, unknown>;
  defaultValues: DefaultValues<T>;
  action: ActionMutation<I, R>;
  /// The field naming the asset the amount is denominated in. `asset` unless
  /// the form has two — Swap's is `assetIn`.
  assetField?: Path<T>;
}

export interface ActionFormApi<T extends ActionFormValues> {
  form: UseFormReturn<T>;
  register: UseFormRegister<T>;
  watch: UseFormWatch<T>;
  setValue: UseFormSetValue<T>;
  errors: FieldErrors<T>;
  /// The asset the amount is denominated in, or `undefined` before the registry
  /// has loaded or when the field names one the chain does not have.
  selected: RegisteredAsset | undefined;
  /// Write an amount the user did not type (the "max" button).
  setAmount(formatted: string): void;
  /// Drop the amount, keeping every other field as the user left it.
  clearAmount(): void;
  /// Clear a finished op's stepper and inline result. Call from the first control
  /// the user touches after a completed submit, usually the asset picker.
  clearFinished(): void;
}

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
  const clearAmount = useCallback(() => {
    reset({ ...getValues(), amount: "" } as DefaultValues<T>);
  }, [reset, getValues]);

  /// Validates immediately, since the value written sits exactly on the boundary
  /// the validation concerns.
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

/// Returns a callback clearing what a finished op left on the form: the
/// stepper, the tx link and the inline error.
///
/// That residue outlives the submit by design. `onSubmit` empties the fields as
/// soon as the mutation resolves, so a stepper reading "completed" and the tx
/// hash beneath it are the user's only record that anything happened.
///
/// It stops being a record once the form is pointed at a different token: a
/// settled stepper above a freshly picked asset reads as a completed transfer of
/// that asset. The asset picker therefore calls this, rather than a timer or the
/// next submit, which comes too late.
///
/// Gated on `done` rather than `!isPending`. A mutation resolves once the tx is
/// broadcast, while `useTxTracker` keeps advancing the stepper through block
/// inclusion, so keying off `isPending` would clear a stepper still in motion.
/// `done` marks the op's terminal phase, which `useTxProgress` also sets on
/// `failed`, so a failed op's error clears on the same gesture.
export function useClearFinishedOp<I, R>(
  mutation: ActionMutation<I, R>["mutation"],
  progress: Pick<ProgressView, "done" | "reset">,
): () => void {
  const { done, reset: resetProgress } = progress;
  const { reset: resetMutation } = mutation;
  return useCallback(() => {
    if (!done) return;
    resetProgress();
    // Drops `data` (the tx hash) and `error` (the inline message) together.
    resetMutation();
  }, [done, resetProgress, resetMutation]);
}

/// Wrap a form submit handler so it cannot re-enter and cannot leak a rejection.
///
/// `handleSubmit` awaits the zod resolver before reaching the callback, so
/// several microtasks pass between the click and the first render with
/// `isPending: true`. Since `busy={m.isPending}` is the only thing disabling the
/// button, holding Enter in the amount field (auto-repeat, ~30ms) lands more
/// than one submit: two on-chain deposits, or two proofs racing the same notes,
/// where the loser returns the relayer 409 that `useSpendFailed` reports as a
/// failure on a session whose first tx succeeded.
///
/// `mutateAsync` also rejects on failure while react-hook-form's `handleSubmit`
/// rethrows out of its callback. `<form onSubmit>` discards the promise it is
/// handed and nothing listens for `unhandledrejection`, so every cancelled
/// wallet prompt and relayer 409 would raise one.
///
/// The returned handler is stable, and always runs the latest `run`. A form's
/// submit closes over the render it was written in — the selected asset, the
/// quote, the fee asset — so the handler reads it through a ref updated after
/// each commit rather than being rebuilt around it, which would also rebuild
/// every `handleSubmit` wrapping it.
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
      // The mutation's `onError` has already toasted this and `ActionForm`
      // renders `m.error`, so swallowing here only keeps it out of the
      // unhandled-rejection channel.
      log.debug("submit rejected", e);
    } finally {
      busy.current = false;
    }
  }, []);
}

/// Called with the validated values, the resolved asset, and the amount
/// converted to circuit units. Resolving clears the amount, so a rejected submit
/// leaves the user's entry in place; resolving `false` says nothing was sent,
/// and leaves it too.
export type ActionSend<T> = (
  values: T,
  ctx: { asset: RegisteredAsset; amount: CircuitAmount },
) => Promise<unknown>;

export interface ActionSubmitOptions {
  /// Whatever else the send needs is in place — Swap's quote, Send by link's
  /// acknowledgement. Read at submit time; `false` makes the submit a no-op.
  ready?: boolean;
  /// Report an amount `parseAmountInput` refuses — finer than the asset's
  /// granularity, which the schema does not check — on the field rather than
  /// dropping the submit silently.
  onParseError?(error: unknown): void;
}

/// The form's submit handler: parse, send once, clear on success.
///
/// Guarded by `useSubmitOnce`, so a held Enter cannot land a second send while
/// the first is still resolving.
export function useActionSubmit<T extends ActionFormValues>(
  api: ActionFormApi<T>,
  send: ActionSend<T>,
  { ready = true, onParseError }: ActionSubmitOptions = {},
): (e?: React.BaseSyntheticEvent) => Promise<void> {
  const { form, selected, clearAmount } = api;
  return form.handleSubmit(
    useSubmitOnce(async (values: T) => {
      // No asset means the registry has not resolved the picker's value, so
      // there is nothing to send.
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
