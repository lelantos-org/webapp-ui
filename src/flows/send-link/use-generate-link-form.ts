import { useState } from "react";
import { z } from "zod";
import type { RegisteredAsset } from "@/config/chains";
import { DEFAULT_ASSET_ID } from "@/features/assets";
import { useLinkAssetsFor, useLinkVault } from "@/features/claim-links";
import {
  amountField,
  defaultAssetField,
  type SubmitBlock,
  useActionForm,
  useActionSubmit,
  useSpendAmount,
} from "@/features/op-form";
import type { Step, TxPhase } from "@/features/tx";
import { userMessage } from "@/shared/lib/errors";
import { formatAssetAmount } from "@/shared/lib/format/asset";
import { linkSubmitBlock } from "./link-block";
import { useGenerateLink } from "./use-generate-link";
import { useLinkStage } from "./use-link-stage";

const generateLinkSchema = z.object({ asset: defaultAssetField, amount: amountField });
type GenerateLinkInput = z.infer<typeof generateLinkSchema>;

const VISIBLE_RUNNING_PHASES: ReadonlySet<TxPhase> = new Set([
  "preparing",
  "proving",
  "submitting",
]);

/// Everything Send by link's screen decides: form, fees, vault pressure, stage.
export function useGenerateLinkForm() {
  const action = useGenerateLink();
  const { mutation, progress } = action;
  const stage = useLinkStage();
  const { pressure } = useLinkVault();
  const assetsFor = useLinkAssetsFor();
  const form = useActionForm({
    schema: generateLinkSchema,
    defaultValues: { asset: DEFAULT_ASSET_ID, amount: "" },
    action,
  });
  const { selected } = form;
  const amountText = form.watch("amount");

  // Snapshot the asset with the amount: the live field may name a different token once cleared.
  const [pending, setPending] = useState<{ amount: bigint; asset: RegisteredAsset } | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  // Keyed by record id: a later record reaching the eviction slot is an uncopied bearer key.
  const [exportedFor, setExportedFor] = useState<string | undefined>(undefined);

  const spend = useSpendAmount({
    kind: "transfer",
    selected,
    amountText,
    setAmount: form.setAmount,
  });

  const evicted = pressure.nextEvicted;
  const vaultFull = !!evicted && exportedFor !== evicted.id;
  const block: SubmitBlock = linkSubmitBlock({
    ...spend.readiness,
    hasAsset: !!selected,
    vaultFull,
    acknowledged,
  });

  const onSubmit = useActionSubmit<GenerateLinkInput>(
    form,
    async (_values, { asset, amount }) => {
      setPending({ amount, asset });
      await stage.runWith(() =>
        mutation.mutateAsync({ amount, asset: asset.id, feeAsset: spend.feeAsset }),
      );
      // Untick so a second press cannot resend on the first link's acknowledgement.
      setAcknowledged(false);
    },
    {
      ready: !block.disabled,
      onParseError: (e) => form.form.setError("amount", { message: userMessage(e) }),
    },
  );

  function dismissResult() {
    // Never drop the vault record here: it may be the only copy of the bearer key.
    mutation.reset();
    setPending(null);
    stage.toForm();
  }

  const visibleSteps: Step[] = progress.steps.filter((s) => VISIBLE_RUNNING_PHASES.has(s.id));

  return {
    form,
    mutation,
    progress,
    stage,
    pressure,
    assetsFor,
    amountText,
    spend,
    block,
    acknowledged,
    setAcknowledged,
    vaultFull,
    onExported: () => setExportedFor(evicted?.id),
    onSubmit,
    dismissResult,
    modalOpen: stage.modalOpen && pending !== null,
    amountLabel: pending ? formatAssetAmount(pending.amount, pending.asset) : "",
    // No `selected` guard: this may be the only on-screen copy of a bearer key for sent funds.
    result: stage.stage === "result" ? mutation.data : undefined,
    visibleSteps,
  };
}
