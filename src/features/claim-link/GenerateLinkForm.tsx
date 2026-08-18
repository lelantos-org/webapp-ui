// Sender side of the claim-link flow; stages owned by `useClaimLinkStage`.

import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { ActionForm } from "@/features/actions/forms/ActionForm";
import { type GenerateLinkInput, generateLinkSchema } from "@/features/actions/forms/schemas";
import type { TxPhase } from "@/features/actions/tx/tx-progress";
import { AssetSelectField } from "@/features/assets/AssetSelectField";
import {
  DEFAULT_ASSET_ID,
  findAsset,
  type RegisteredAsset,
  useRegisteredAssets,
} from "@/features/assets/registered-assets";
import { useActiveChain } from "@/features/chain/ChainProvider";
import { ClaimLinkResult } from "@/features/claim-link/components/ClaimLinkResult";
import { GenerateModal } from "@/features/claim-link/components/GenerateModal";
import { UnclaimedLinks } from "@/features/claim-link/components/UnclaimedLinks";
import { forgetClaimLink } from "@/features/claim-link/link-vault";
import { useClaimLinkStage } from "@/features/claim-link/use-claim-link-stage";
import { useGenerateLink } from "@/features/claim-link/use-generate-link";
import { describeError } from "@/shared/lib/errors";
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

export function GenerateLinkForm() {
  const { mutation, progress } = useGenerateLink();
  const assets = useRegisteredAssets();
  const chain = useActiveChain();
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

  // The asset is snapshotted alongside the amount, not re-read from the live
  // `<select>`. `pending.amount` is parsed with the asset's decimals and scale,
  // and nothing disables the form behind the confirm modal — so formatting it
  // through whatever asset is selected *now* could state a different token, and
  // a different quantity, on the very screen carrying the "share this only
  // through a private channel" attestation.
  const [pending, setPending] = useState<{ amount: bigint; asset: RegisteredAsset } | null>(null);

  const selected = findAsset(assets, watch("asset"));
  const watchedAmount = watch("amount");
  const visibleSteps = progress.steps.filter((s) => VISIBLE_RUNNING_PHASES.has(s.id));
  const amountLabel = pending ? formatAssetAmount(pending.amount, pending.asset) : "";

  const onSubmit = handleSubmit((values) => {
    if (!selected) return;
    try {
      const amount = parseAmountForAsset(values.amount, selected.decimals, selected.scale);
      setPending({ amount, asset: selected });
      stageApi.toConfirm();
    } catch (e) {
      // Zod does *not* cover this. `generateLinkSchema`'s `amount` only runs
      // `isDecimalString`; `parseAmountForAsset` additionally rejects a value
      // finer than the asset's granularity, which zod never checks. Swallowing
      // it meant that on a `scale > 1` asset, typing `1.000001` and clicking
      // "generate link" did nothing at all — no modal, no error, no toast, and
      // no way to find out why.
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
      // stageApi.runWith already reset to "form" on throw
    }
  }

  function resetAll() {
    reset({ asset: selected ? selected.id.toString() : DEFAULT_ASSET_ID, amount: "" });
    // Only now is the persisted copy dropped: the user has seen the link and
    // said they are done with it. See `link-vault`.
    if (mutation.data) forgetClaimLink(mutation.data.recordId);
    mutation.reset();
    setPending(null);
    stageApi.toForm();
  }

  // No `&& selected` here. That guard could fail while `mutation.data` held the
  // only copy of a bearer key for funds that had already left the wallet — a
  // chain whose token list differs makes `findAsset` return undefined, and the
  // component then fell through to an empty form with the link never rendered.
  // `amountLabel` comes from the snapshot, so it does not need `selected`
  // either.
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
  // `closing` keeps the previous (success) screen mounted while the
  // fade-out animation runs.
  return stage === "closing" ? "success" : (stage as "confirm" | "running" | "success");
}
