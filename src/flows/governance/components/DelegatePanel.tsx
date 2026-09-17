import { zodResolver } from "@hookform/resolvers/zod";
import { type EvmAddress, evmAddress } from "@lelantos-org/sdk";
import { useId } from "react";
import { useForm } from "react-hook-form";
import { isAddress } from "viem";
import { z } from "zod";
import { isZeroAddress } from "@/features/governance";
import { sameAddress, shortAddr } from "@/shared/lib/address";
import { Notice } from "@/shared/ui/Notice";
import { DELEGATE_NOTICES } from "../governance-copy";
import { type GovTxState, GovTxStatus } from "./GovTxStatus";

/// Who an account's votes go through: "Not delegated", "Yourself", or the
/// delegate's short address; "…" while it is still being read.
export function delegateLabel(delegate: string | undefined, account: string | undefined): string {
  if (delegate === undefined) return "…";
  if (isZeroAddress(delegate)) return "Not delegated";
  if (account !== undefined && sameAddress(account, delegate)) return "Yourself";
  return shortAddr(delegate, 4);
}

const schema = z.object({
  delegatee: z
    .string()
    .trim()
    .refine((v): boolean => isAddress(v, { strict: false }), "Enter a 0x address"),
});

type DelegateForm = z.infer<typeof schema>;

export interface DelegatePanelProps {
  account: EvmAddress | undefined;
  /// The zero address, or undefined while loading, before any delegation.
  currentDelegate: string | undefined;
  canSign: boolean;
  signerReason?: string | undefined;
  onDelegate(delegatee: EvmAddress): void;
  tx: GovTxState;
}

/// Who this account's LNT votes through, and changing it.
export function DelegatePanel({
  account,
  currentDelegate,
  canSign,
  signerReason,
  onDelegate,
  tx,
}: DelegatePanelProps) {
  const inputId = useId();
  const errorId = useId();
  const form = useForm<DelegateForm>({
    resolver: zodResolver(schema),
    defaultValues: { delegatee: "" },
  });
  const error = form.formState.errors.delegatee?.message;
  const self =
    account !== undefined && currentDelegate !== undefined && sameAddress(account, currentDelegate);

  const current = delegateLabel(currentDelegate, account);

  return (
    <div className="gov-delegate">
      <p className="gov-delegate__now">
        <span className="muted">Delegate</span>{" "}
        <strong className="mono" title={currentDelegate}>
          {current}
        </strong>
      </p>
      <Notice tone="neutral" announce={false}>
        {DELEGATE_NOTICES.shielded} {DELEGATE_NOTICES.timing}
      </Notice>
      {!canSign ? (
        <Notice tone="neutral" title="Read-only session">
          {signerReason ?? "Delegating is a transaction from a public account."}
        </Notice>
      ) : tx.status !== "idle" ? (
        <GovTxStatus
          {...tx}
          pendingTitle="Delegating your votes"
          doneTitle="Delegation updated"
          failedTitle="Delegation did not go through"
          onRetry={tx.reset}
          doneAction={
            <button type="button" className="btn btn--outline btn--sm" onClick={tx.reset}>
              Done
            </button>
          }
        />
      ) : (
        <>
          {account && !self ? (
            <button type="button" className="btn btn--cta" onClick={() => onDelegate(account)}>
              Delegate to myself
            </button>
          ) : null}
          <form
            className="gov-delegate__form"
            noValidate
            onSubmit={form.handleSubmit((v) => onDelegate(evmAddress(v.delegatee)))}
          >
            <label className="gov-field" htmlFor={inputId}>
              <span className="gov-field__lbl">Or delegate to another address</span>
              <input
                id={inputId}
                className="gov-input mono"
                placeholder="0x…"
                autoComplete="off"
                spellCheck={false}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? errorId : undefined}
                {...form.register("delegatee")}
              />
            </label>
            {error ? (
              <span className="gov-field__err" id={errorId}>
                {error}
              </span>
            ) : null}
            <button type="submit" className="btn btn--outline">
              Delegate
            </button>
          </form>
        </>
      )}
    </div>
  );
}
