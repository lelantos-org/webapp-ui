// Sender side of the claim-link flow.
//
// Two columns: "1 · Compose" is the form, "2 · Share" is the link once it
// exists, with the vault under it. One column on a phone, in the same order.
//
// The private-channel acknowledgement sits on the compose card and gates
// "Create link" itself, so a submit goes straight to the running modal. The
// modal stays: the transfer produces a bearer key that exists nowhere but this
// component tree until the result is on screen, so that stretch holds the whole
// screen and cannot be dismissed.

import { useRef } from "react";
import { useAssetSelectOptions } from "@/features/assets";
import { daysLabel, EvictionBlock, VaultSummary } from "@/features/claim-links";
import { FeeDetails } from "@/features/fees";
import { ActionForm, AmountHero, AssetSelectPill, spendHeroProps } from "@/features/op-form";
import { SyncNotice } from "@/features/wallet";
import { CheckGlyph } from "@/shared/ui/icons/glyphs";
import { Notice } from "@/shared/ui/Notice";
import { ScreenHeader } from "@/shared/ui/ScreenHeader";
import { GenerateModal } from "./components/GenerateModal";
import { LinkResult } from "./components/LinkResult";
import { useGenerateLinkForm } from "./use-generate-link-form";
import { useInert } from "./use-inert";
import "./GenerateLinkForm.css";

export function GenerateLinkForm() {
  const c = useGenerateLinkForm();
  const { form, mutation, spend } = c;
  const { register, watch, setValue, errors } = form;
  const options = useAssetSelectOptions({ rateTag: false });
  const formRef = useRef<HTMLDivElement>(null);
  useInert(formRef, c.stage.modalOpen);

  return (
    <>
      <ScreenHeader
        title="Send by link"
        subtitle="For someone who has no shielded address yet. They open the link, connect a wallet, and the funds are theirs."
        backTo="/send"
        backLabel="Back to Send"
      />
      <div className="sendlink">
        <div className="sendlink__col">
          <span className="sendlink__step" aria-hidden="true">
            1 · Compose
          </span>
          {/* Held inert while the modal is up. `Modal` traps Tab inside its own
              panel, but it portals, so this form is a sibling rather than a
              descendant: without this the pointer still reaches these fields
              and a screen reader still walks them, behind a dialog describing
              the values they hold. The `pending` snapshot in `useGenerateLinkForm` remains the
              correctness guarantee; this is the second layer. */}
          <div ref={formRef}>
            <ActionForm
              submitLabel="Create link"
              busy={mutation.isPending}
              error={mutation.error}
              onSubmit={c.onSubmit}
              submitDisabled={c.block.disabled}
              blockedReason={c.block.reason}
              onReset={c.dismissResult}
              tx={{ progressTitle: "Creating your link", failedTitle: "Couldn't create the link" }}
              details={<FeeDetails fees={spend.fees} />}
            >
              <SyncNotice />
              <AmountHero
                {...spendHeroProps(form, spend, c.amountText)}
                size="md"
                label="Amount to send"
                asset={
                  <AssetSelectPill
                    label="Asset to send"
                    options={options}
                    value={watch("asset")}
                    invalid={!!errors.asset}
                    onChange={(next) => setValue("asset", next, { shouldValidate: true })}
                  />
                }
              />
              <input type="hidden" {...register("asset")} />
              <hr className="rule" />
              <Notice tone="warn" title="The link is the money" announce={false}>
                Anyone who opens it can claim the funds. Send it through a private channel — never a
                public chat, or anything that logs URLs. It cannot be cancelled once broadcast.
              </Notice>
              <LinkAckCheckbox checked={c.acknowledged} onChange={c.setAcknowledged} />
              {c.vaultFull ? (
                <EvictionBlock
                  pressure={c.pressure}
                  assetsFor={c.assetsFor}
                  onExported={c.onExported}
                />
              ) : null}
            </ActionForm>
          </div>
        </div>

        <div className="sendlink__col">
          <span className="sendlink__step" aria-hidden="true">
            2 · Share
          </span>
          {c.result ? (
            <LinkResult
              url={c.result.url}
              recordId={c.result.recordId}
              amountLabel={c.amountLabel}
              ttlMs={c.pressure.ttlMs}
              onReset={c.dismissResult}
            />
          ) : (
            <SharePlaceholder ttlMs={c.pressure.ttlMs} />
          )}
          <VaultSummary />
        </div>
      </div>

      {c.modalOpen ? (
        <GenerateModal
          screen={c.stage.stage === "running" ? "running" : "success"}
          closing={c.stage.closing}
          amountLabel={c.amountLabel}
          steps={c.visibleSteps}
          activePhase={c.progress.phase}
        />
      ) : null}
    </>
  );
}

/// "I'll share this link only through a private channel", which gates "Create
/// link" itself rather than a confirm step after it.
function LinkAckCheckbox({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange(checked: boolean): void;
}) {
  return (
    <label className="linkack">
      <input
        type="checkbox"
        className="linkack__input input-hidden"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="linkack__box" aria-hidden="true">
        <CheckGlyph size={13} strokeWidth={2.8} />
      </span>
      <span className="linkack__txt">I'll share this link only through a private channel</span>
    </label>
  );
}

/// The share column before a link exists: what will appear, and for how long
/// this browser keeps it.
function SharePlaceholder({ ttlMs }: { ttlMs: number }) {
  return (
    <div className="surface surface--card linkres linkres--empty">
      <p className="linkres__placeholder">
        Your link appears here once it is created. It works once, for whoever opens it, and this
        browser keeps a copy for {daysLabel(ttlMs)}.
      </p>
    </div>
  );
}
