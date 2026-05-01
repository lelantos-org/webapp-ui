// Sender side of the claim-link flow; stages owned by `useClaimLinkStage`.

import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { ActionForm } from "@/features/actions/ActionForm";
import { useGenerateLink } from "@/features/actions/mutations";
import { type GenerateLinkInput, generateLinkSchema } from "@/features/actions/schemas";
import type { TxPhase } from "@/features/actions/tx-progress";
import { AssetSelectField } from "@/features/assets/AssetSelectField";
import { findAsset, useRegisteredAssets } from "@/features/assets/registered-assets";
import { ClaimLinkResultCard } from "@/features/claim-link/components/ClaimLinkResultCard";
import { GenerateModal } from "@/features/claim-link/components/GenerateModal";
import { useClaimLinkStage } from "@/features/claim-link/use-claim-link-stage";
import { formatAssetAmount, parseAmountForAsset } from "@/shared/lib/format";
import { TextField } from "@/shared/ui/Field";

/// Phases shown in the running-modal stepper. The mutation actually
/// resolves after `submitting` (broadcast); `mined`/`settled` fire later
/// via the toast tracker, by which point the modal has already closed.
const VISIBLE_RUNNING_PHASES: ReadonlySet<TxPhase> = new Set([
  "preparing",
  "proving",
  "submitting",
]);

const DEFAULT_ASSET = "1";

export function GenerateLinkForm() {
  const { mutation, progress } = useGenerateLink();
  const assets = useRegisteredAssets();
  const stageApi = useClaimLinkStage();
  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors },
  } = useForm<GenerateLinkInput>({
    resolver: zodResolver(generateLinkSchema),
    defaultValues: { asset: DEFAULT_ASSET, amount: "" },
  });

  const [pending, setPending] = useState<{ amount: bigint; asset: bigint } | null>(null);

  const selected = findAsset(assets.data, watch("asset"));
  const watchedAmount = watch("amount");
  const visibleSteps = progress.steps.filter((s) => VISIBLE_RUNNING_PHASES.has(s.id));
  const amountLabel = pending && selected ? formatAssetAmount(pending.amount, selected) : "";

  const onSubmit = handleSubmit((values) => {
    if (!selected) return;
    try {
      const amount = parseAmountForAsset(values.amount, selected.decimals, selected.scale);
      setPending({ amount, asset: selected.id });
      stageApi.toConfirm();
    } catch {
      // zod surfaces parse errors via errors.amount
    }
  });

  async function submitConfirmed() {
    if (!pending) return;
    try {
      await stageApi.runWith(() => mutation.mutateAsync(pending));
    } catch {
      // stageApi.runWith already reset to "form" on throw
    }
  }

  function resetAll() {
    reset({ asset: selected ? selected.id.toString() : DEFAULT_ASSET, amount: "" });
    mutation.reset();
    setPending(null);
    stageApi.toForm();
  }

  if (stageApi.stage === "result" && mutation.data && selected) {
    return (
      <ClaimLinkResultCard
        url={mutation.data.url}
        txHash={mutation.data.txHash}
        ephAddress={mutation.data.ephAddress}
        amountLabel={amountLabel}
        onReset={resetAll}
      />
    );
  }

  return (
    <>
      <ActionForm
        title="new link"
        submitLabel="generate link"
        busy={mutation.isPending}
        error={mutation.error}
        onSubmit={onSubmit}
        submitDisabled={!selected}
        progress={stageApi.stage === "running" ? undefined : progress}
      >
        <AssetSelectField error={errors.asset?.message} {...register("asset")} />
        <TextField
          label="amount"
          placeholder={selected ? `1.0 ${selected.symbol}` : "1.0"}
          inputMode="decimal"
          error={errors.amount?.message}
          {...register("amount")}
        />
      </ActionForm>

      {stageApi.modalOpen && pending && selected ? (
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
  // `closing` keeps the previous (success) screen mounted while the
  // fade-out animation runs.
  return stage === "closing" ? "success" : (stage as "confirm" | "running" | "success");
}
