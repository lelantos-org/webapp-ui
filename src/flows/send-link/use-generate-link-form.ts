// Everything Send by link's screen decides, apart from how it draws it.
//
// The form, the amount and fee reads every spend shares, the vault's pressure on
// the new record, the acknowledgement, the snapshot of what was sent, and the
// stage machine that holds the running modal — joined here so the screen is
// only layout.

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

/// Phases shown in the running-modal stepper. The mutation resolves after
/// `submitting` (broadcast); `mined` and `settled` fire later via the toast
/// tracker, by which point the modal has closed.
const VISIBLE_RUNNING_PHASES: ReadonlySet<TxPhase> = new Set([
  "preparing",
  "proving",
  "submitting",
]);

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

  // The asset is snapshotted alongside the amount rather than re-read from the
  // live field. `pending.amount` is parsed with the asset's decimals and scale,
  // and the result card states it after the form has been cleared, so formatting
  // through the currently selected asset could name a different token and
  // quantity from the one that was sent.
  const [pending, setPending] = useState<{ amount: bigint; asset: RegisteredAsset } | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  // The id of the full vault's oldest record at the moment the user exported. A
  // copy of that record now exists outside the browser, so dropping it is safe;
  // a later record reaching the same position is a different key, uncopied.
  const [exportedFor, setExportedFor] = useState<string | undefined>(undefined);

  // The sender's shielded balance, read as Send reads it (ux-findings #07): without
  // it a link could be requested for more than the wallet holds and fail only
  // after a full proof. A link is a transfer to a fresh address, and pays the
  // relayer as one.
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

  // Submit-once, as every other action form: `handleSubmit` awaits the resolver
  // before reaching this, and the stage only moves to `running` inside
  // `runWith`, so a held Enter would land a second call against the same
  // closure — two transfers, two bearer keys.
  const onSubmit = useActionSubmit<GenerateLinkInput>(
    form,
    async (_values, { asset, amount }) => {
      setPending({ amount, asset });
      // A failure rejects out of here: `stage.runWith` has already reset to
      // "form", and `ActionForm` shows the failed card from `mutation.error`.
      await stage.runWith(() =>
        mutation.mutateAsync({ amount, asset: asset.id, feeAsset: spend.feeAsset }),
      );
      // Cleared once the link exists, so a second press cannot send the same
      // amount again on a box ticked for the first. The asset stays.
      setAcknowledged(false);
    },
    {
      ready: !block.disabled,
      // Not covered by zod: `generateLinkSchema`'s `amount` runs only
      // `isDecimalString`, while `parseAmountInput` also rejects a value finer
      // than the asset's granularity. Swallowing it would leave a `scale > 1`
      // asset with no response at all to an over-precise amount.
      onParseError: (e) => form.form.setError("amount", { message: userMessage(e) }),
    },
  );

  function dismissResult() {
    // The persisted copy survives this. Dismissing the card does not mean the
    // recipient has the link, and the URL is masked by default, so dropping the
    // record here would leave the bearer key nowhere for funds already sent. The
    // vault screen is the only path that drops a record, behind its own
    // confirmation. See `vault/store`.
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
    /// The user saved a copy of the record the new link would drop.
    onExported: () => setExportedFor(evicted?.id),
    onSubmit,
    dismissResult,
    /// The modal is up for a link being made.
    modalOpen: stage.modalOpen && pending !== null,
    amountLabel: pending ? formatAssetAmount(pending.amount, pending.asset) : "",
    // No `selected` guard: `findAsset` returns undefined on a chain whose token
    // list differs, and `mutation.data` may hold the only on-screen copy of a
    // bearer key for funds already sent. `amountLabel` comes from the snapshot.
    result: stage.stage === "result" ? mutation.data : undefined,
    visibleSteps,
  };
}
