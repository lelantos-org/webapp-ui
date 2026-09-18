import { useState } from "react";
import { Link } from "react-router-dom";
import { z } from "zod";
import { agentsSnapshot, useAgents } from "@/features/agents";
import { DEFAULT_ASSET_ID, useAssetSelectOptions } from "@/features/assets";
import { FeeDetails } from "@/features/fees";
import {
  ActionForm,
  AmountHero,
  AssetSelectPill,
  amountField,
  defaultAssetField,
  spendHeroProps,
  useActionForm,
  useActionSubmit,
  useSpendAmount,
} from "@/features/op-form";
import { SyncNotice } from "@/features/wallet";
import { userMessage } from "@/shared/lib/errors";
import { Notice } from "@/shared/ui/Notice";
import { ScreenHeader } from "@/shared/ui/ScreenHeader";
import { agentSubmitBlock } from "./agent-block";
import { CredentialPanel } from "./components/CredentialPanel";
import { useCreateAgent } from "./use-create-agent";
import "./agents.css";

const schema = z.object({
  label: z.string().trim().min(1, "Name the agent").max(60, "Keep the name short"),
  asset: defaultAssetField,
  amount: amountField,
});
type NewAgentInput = z.infer<typeof schema>;

/// Fund an agent: mint an ephemeral wallet, send it funds, hand over the key.
export function NewAgentForm() {
  const action = useCreateAgent();
  const { mutation } = action;
  const { full } = useAgents();
  const [createdId, setCreatedId] = useState<string | undefined>(undefined);
  const options = useAssetSelectOptions({ rateTag: false });

  const form = useActionForm({
    schema,
    defaultValues: { label: "", asset: DEFAULT_ASSET_ID, amount: "" },
    action,
  });
  const { register, watch, setValue, errors, selected } = form;
  const amountText = watch("amount");

  const spend = useSpendAmount({
    kind: "transfer",
    selected,
    amountText,
    setAmount: form.setAmount,
  });

  const block = agentSubmitBlock({
    ...spend.readiness,
    hasAsset: !!selected,
    named: watch("label").trim().length > 0,
    listFull: full,
  });

  const onSubmit = useActionSubmit<NewAgentInput>(
    form,
    async (values, { asset, amount }) => {
      const result = await mutation.mutateAsync({
        label: values.label.trim(),
        amount,
        asset: asset.id,
        feeAsset: spend.feeAsset,
      });
      setCreatedId(result.recordId);
    },
    {
      ready: !block.disabled,
      onParseError: (e) => form.form.setError("amount", { message: userMessage(e) }),
    },
  );

  const created = createdId ? agentsSnapshot().find((a) => a.id === createdId) : undefined;

  return (
    <>
      <ScreenHeader
        title="Fund an agent"
        subtitle="Mints a shielded wallet, sends it what you choose, and gives you the key to hand over."
        backTo="/agents"
        backLabel="Back to Agents"
      />

      {created ? (
        <div className="surface surface--card">
          <h2 className="agents__done">{created.label} is funded</h2>
          <CredentialPanel agent={created} />
          <Link className="btn btn--cta agents__new" to="/agents">
            Done
          </Link>
        </div>
      ) : (
        <ActionForm
          submitLabel="Fund agent"
          busy={mutation.isPending}
          error={mutation.error}
          onSubmit={onSubmit}
          submitDisabled={block.disabled}
          blockedReason={block.reason}
          tx={{ progressTitle: "Funding the agent", failedTitle: "Couldn't fund the agent" }}
          details={<FeeDetails fees={spend.fees} />}
        >
          <SyncNotice />
          <label className="agent-field">
            <span className="agent-field__lbl">Name</span>
            <input
              className="agent-input"
              placeholder="research bot"
              aria-invalid={!!errors.label}
              {...register("label")}
            />
            {errors.label ? <span className="agent-field__err">{errors.label.message}</span> : null}
          </label>

          <AmountHero
            {...spendHeroProps(form, spend, amountText)}
            size="md"
            label="Amount to fund"
            asset={
              <AssetSelectPill
                label="Asset to fund"
                options={options}
                value={watch("asset")}
                invalid={!!errors.asset}
                onChange={(next) => setValue("asset", next, { shouldValidate: true })}
              />
            }
          />
          <input type="hidden" {...register("asset")} />

          <hr className="rule" />
          <Notice tone="warn" title="The agent holds its own key" announce={false}>
            Whatever you fund, the agent can spend. Fund it with what you are willing to lose to a
            bug or a compromise, and top it up rather than over-funding it once.
          </Notice>
        </ActionForm>
      )}
    </>
  );
}
