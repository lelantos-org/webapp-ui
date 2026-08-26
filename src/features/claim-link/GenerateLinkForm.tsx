// Sender side of the claim-link flow; stages owned by `useClaimLinkStage`.

import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import type { TxPhase } from "@/features/actions";
import {
  ActionForm,
  type GenerateLinkInput,
  generateLinkSchema,
  parseAmountSafe,
  validateAmount,
} from "@/features/actions";
import {
  AssetSelectField,
  DEFAULT_ASSET_ID,
  findAsset,
  type RegisteredAsset,
  useAssetBalanceLabel,
  useRegisteredAssets,
} from "@/features/assets";
import { useActiveChain } from "@/features/chain";
import { describeError } from "@/shared/lib/errors";
import { formatAssetAmount, parseAmountForAsset } from "@/shared/lib/format";
import { TextField } from "@/shared/ui/Field";
import { ClaimLinkResult } from "./components/ClaimLinkResult";
import { GenerateModal } from "./components/GenerateModal";
import { UnclaimedLinks } from "./components/UnclaimedLinks";
import { useClaimLinkStage } from "./use-claim-link-stage";
import { useGenerateLink } from "./use-generate-link";

/// Phases shown in the running-modal stepper. The mutation resolves after
/// `submitting` (broadcast); `mined` and `settled` fire later via the toast
/// tracker, by which point the modal has closed.
const VISIBLE_RUNNING_PHASES: ReadonlySet<TxPhase> = new Set([
  "preparing",
  "proving",
  "submitting",
]);

export function GenerateLinkForm() {
  const { mutation, progress } = useGenerateLink();
  const assets = useRegisteredAssets();
  const chain = useActiveChain();
  const balanceOf = useAssetBalanceLabel();
  const stageApi = useClaimLinkStage();
  const {
    register,
    handleSubmit,
    watch,
    reset,
    setError,
    formState: { errors },
  } = useForm<GenerateLinkInput>({
    resolver: zodResolver(generateLinkSchema),
    defaultValues: { asset: DEFAULT_ASSET_ID, amount: "" },
  });

  // The asset is snapshotted alongside the amount rather than re-read from the
  // live `<select>`. `pending.amount` is parsed with the asset's decimals and
  // scale, and nothing disables the form behind the confirm modal, so formatting
  // through the currently selected asset could state a different token and
  // quantity on the confirmation screen.
  const [pending, setPending] = useState<{ amount: bigint; asset: RegisteredAsset } | null>(null);

  const selected = findAsset(assets, watch("asset"));
  const watchedAmount = watch("amount");
  // No balance argument: this form does not read the sender's shielded balance,
  // so `insufficient` is not something it can determine. The gate is the amount
  // itself — present, non-zero, within the asset's granularity, under the cap.
  const amountValid = validateAmount(
    parseAmountSafe(watchedAmount, selected),
    selected,
    undefined,
  ).valid;
  const visibleSteps = progress.steps.filter((s) => VISIBLE_RUNNING_PHASES.has(s.id));
  const amountLabel = pending ? formatAssetAmount(pending.amount, pending.asset) : "";

  const onSubmit = handleSubmit((values) => {
    if (!selected) return;
    try {
      const amount = parseAmountForAsset(values.amount, selected.decimals, selected.scale);
      setPending({ amount, asset: selected });
      stageApi.toConfirm();
    } catch (e) {
      // Not covered by zod: `generateLinkSchema`'s `amount` runs only
      // `isDecimalString`, while `parseAmountForAsset` also rejects a value finer
      // than the asset's granularity. Swallowing it would leave a `scale > 1`
      // asset with no response at all to an over-precise amount.
      setError("amount", { message: describeError(e) });
    }
  });

  async function submitConfirmed() {
    if (!pending) return;
    try {
      await stageApi.runWith(() =>
        mutation.mutateAsync({ amount: pending.amount, asset: pending.asset.id }),
      );
    } catch {
      // `stageApi.runWith` has already reset to "form" on throw.
    }
  }

  function resetAll() {
    reset({ asset: selected ? selected.id.toString() : DEFAULT_ASSET_ID, amount: "" });
    // The persisted copy survives this. Generating another link does not mean the
    // recipient has the previous one, and the URL above is masked by default, so
    // dropping the record here would leave the bearer key nowhere for funds
    // already sent. `UnclaimedLinks` is the only path that drops a record, behind
    // its own confirmation. See `link-vault`.
    mutation.reset();
    setPending(null);
    stageApi.toForm();
  }

  // No `&& selected` guard: `findAsset` returns undefined on a chain whose token
  // list differs, which would fall through to an empty form while `mutation.data`
  // held the only copy of a bearer key for funds already sent. `amountLabel`
  // comes from the snapshot and does not need `selected` either.
  if (stageApi.stage === "result" && mutation.data) {
    return <ClaimLinkResult url={mutation.data.url} amountLabel={amountLabel} onReset={resetAll} />;
  }

  return (
    <>
      <ActionForm
        submitLabel="generate link"
        busy={mutation.isPending}
        error={mutation.error}
        onSubmit={onSubmit}
        submitDisabled={!selected || !amountValid}
        progress={stageApi.stage === "running" ? undefined : progress}
      >
        <AssetSelectField
          balanceOf={balanceOf}
          error={errors.asset?.message}
          {...register("asset")}
        />
        <TextField
          label="amount"
          placeholder={selected ? `1.0 ${selected.symbol}` : "1.0"}
          inputMode="decimal"
          error={errors.amount?.message}
          {...register("amount")}
        />
      </ActionForm>

      <UnclaimedLinks chainId={chain.chainId} assets={assets} />

      {stageApi.modalOpen && pending ? (
        <GenerateModal
          screen={modalScreen(stageApi.stage)}
          closing={stageApi.closing}
          amountLabel={amountLabel}
          rawAmountInput={watchedAmount}
          steps={visibleSteps}
          activePhase={progress.phase}
          onCancel={stageApi.toForm}
          onConfirm={submitConfirmed}
        />
      ) : null}
    </>
  );
}

function modalScreen(stage: ReturnType<typeof useClaimLinkStage>["stage"]) {
  // `closing` keeps the preceding success screen mounted while the fade-out
  // animation runs.
  return stage === "closing" ? "success" : (stage as "confirm" | "running" | "success");
}
