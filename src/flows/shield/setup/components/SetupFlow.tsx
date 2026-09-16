// One-time wallet setup modal for the Permit2 AllowanceTransfer flow.
//
// The modal, its lifecycle — dismiss, lock, auto-close — and its four screens.
// The run itself is `useSetupRun`, the words and step rows `setup-copy.ts`. Each
// screen opens with the paragraph the modal is described by, so `descId` lands
// on whichever is showing.

import { useCallback, useEffect, useId, useState } from "react";
import type { RegisteredAsset } from "@/config/chains";
import { useActiveChainOrUndefined, useTxExplorerUrl } from "@/features/chain";
import { useExitTransition } from "@/shared/hooks/use-exit-transition";
import { sameAddress, shortAddr } from "@/shared/lib/address";
import { MODAL_EXIT_MS } from "@/shared/lib/motion";
import { Modal } from "@/shared/ui/Modal";
import { Stepper } from "@/shared/ui/Stepper";
import { byDistinctToken } from "../by-token";
import { ALLOWANCE_EXPIRY_DAYS, defaultAllowanceExpirationSecs } from "../permit2-setup";
import { currentStepId, runningCopy, setupCostLine, setupSteps } from "../setup-copy";
import { useSetupRun } from "../use-setup-run";

const DONE_AUTOCLOSE_MS = 1500;

export interface SetupFlowProps {
  /// Tokens to authorize. One entry is the deposit-form path; N entries collapse
  /// the signature and the permit tx into one each, which is why this takes an
  /// array.
  assets: RegisteredAsset[];
  /// Whether the run will send an ERC-20 → Permit2 approval for `asset`'s token.
  /// Per token, because that step does not batch. Must be `SetupNeeds.
  /// willApproveErc20`, not `needsErc20Approve`: the batch decides on the cap it
  /// grants, so the gating predicate predicts a shorter run than the one the
  /// wallet prompts for.
  willApproveErc20(asset: RegisteredAsset): boolean;
  onSuccess(): void;
  onCancel(): void;
}

export function SetupFlow({ assets, willApproveErc20, onSuccess, onCancel }: SetupFlowProps) {
  // Undefined variant: the modal can be mounted while the registry is still
  // resolving, and a missing chain must degrade the disclosure rather than throw
  // inside a flow the user has already started.
  const chain = useActiveChainOrUndefined();
  const { screen, progress, error, toApprove, canRun, run } = useSetupRun(assets, willApproveErc20);
  const { exiting, exit } = useExitTransition(MODAL_EXIT_MS);
  const descId = useId();
  const [showAdvanced, setShowAdvanced] = useState(false);

  // For the disclosure only; the run reads its own expiry when it starts.
  const expiryStr = new Date(defaultAllowanceExpirationSecs() * 1000).toISOString().slice(0, 10);
  const symbolOf = (token: string) =>
    assets.find((a) => sameAddress(a.token, token))?.symbol ?? "token";
  const distinct = byDistinctToken(assets);
  const symbolList = distinct.map((a) => a.symbol).join(", ");

  const steps = setupSteps(toApprove);
  const current = currentStepId(progress);
  // The running and failed screens both need the label for the current step,
  // which `steps` already holds.
  const currentLabel = steps.find((s) => s.id === current)?.label ?? progress.step;

  // While the flow is running and the wallet is mid-prompt no dismiss path is
  // open, and the overlay indicates this with a busy cursor. `Modal` also closes
  // those paths for the duration of the exit.
  const locked = !(screen === "intro" || screen === "failed" || screen === "done");

  const requestCancel = useCallback(() => exit(onCancel), [exit, onCancel]);
  const requestSuccess = useCallback(() => exit(onSuccess), [exit, onSuccess]);

  useEffect(() => {
    if (screen !== "done") return;
    const t = setTimeout(() => requestSuccess(), DONE_AUTOCLOSE_MS);
    return () => clearTimeout(t);
  }, [screen, requestSuccess]);

  return (
    <Modal
      title="One-time setup"
      onDismiss={requestCancel}
      busy={locked}
      exiting={exiting}
      describedBy={descId}
      focusKey={screen}
    >
      {screen === "intro" ? (
        <>
          <p id={descId} className="modal-copy">
            Authorizing <strong>{symbolList}</strong> for the shielded pool. This is a one-time
            on-chain step so future deposits take a single signature.
          </p>
          <p className="modal-copy">
            It grants the pool an <strong>unlimited</strong> allowance on{" "}
            {distinct.length === 1 ? "that token" : "those tokens"}, valid for{" "}
            {ALLOWANCE_EXPIRY_DAYS} days. The pool can only draw on it during a deposit you send
            yourself, and you can revoke it at any time.
          </p>
          <p className="modal-meta">{`${setupCostLine(toApprove.length)}.`}</p>
          <details
            className="modal-advanced"
            open={showAdvanced}
            onToggle={(e) => setShowAdvanced((e.target as HTMLDetailsElement).open)}
          >
            <summary>Advanced</summary>
            {/*
              The spender, the Permit2 and the chain are named here because they
              are what the grant is actually *to*, and none of them is a constant
              this app knows: all three arrive from protocol-webserver at boot.
              Stating only "unlimited, for N days" describes the size of the grant
              while leaving out its recipient, which is the half a user would need
              in order to notice a substituted address. Read from the active
              `ChainEntry` rather than the wallet, so these are the same values the
              registry/relayer cross-check passed.
            */}
            <p className="modal-meta">
              cap: unlimited ({symbolList})
              <br />
              expires: {expiryStr} ({ALLOWANCE_EXPIRY_DAYS} days)
              <br />
              chain: {chain ? `${chain.chainName} (${chain.chainId})` : "unknown"}
              <br />
              spender: <span className="brk">{chain?.maspAddress ?? "unknown"}</span>
              <br />
              via permit2: <span className="brk">{chain?.permit2Address ?? "none"}</span>
              <br />
              steps: {steps.length}
            </p>
          </details>
          <div className="modal-actions">
            <button type="button" className="btn btn--ghost" onClick={requestCancel}>
              cancel
            </button>
            <button type="button" className="btn" onClick={run} disabled={!canRun} data-primary>
              begin setup
            </button>
          </div>
        </>
      ) : null}

      {screen === "running" ? (
        <>
          <p id={descId} className="modal-copy">
            {runningCopy(progress, symbolOf)}
          </p>
          <Stepper steps={steps} current={current} />
          {progress.status === "confirming" && progress.txHash ? (
            <TxHashLine txHash={progress.txHash} />
          ) : null}
          <p className="modal-meta">Do not close this window.</p>
        </>
      ) : null}

      {screen === "failed" ? (
        <>
          <p id={descId} className="modal-copy">
            {error?.kind === "rejected"
              ? `You cancelled the ${currentLabel} step. Try again when ready.`
              : `Setup failed at the ${currentLabel} step.`}
          </p>
          <Stepper steps={steps} current={current} failed />
          {error?.kind === "failed" ? <div className="err">{error.message}</div> : null}
          <div className="modal-actions">
            <button type="button" className="btn btn--ghost" onClick={requestCancel}>
              cancel
            </button>
            <button type="button" className="btn" onClick={run} data-primary>
              retry
            </button>
          </div>
        </>
      ) : null}

      {screen === "done" ? (
        <>
          <p id={descId} className="modal-copy">
            Setup complete. You can now deposit with a single signature.
          </p>
          <Stepper steps={steps} current={steps[steps.length - 1]?.id} done />
        </>
      ) : null}
    </Modal>
  );
}

function TxHashLine({ txHash }: { txHash: string }) {
  const url = useTxExplorerUrl()(txHash);
  const short = shortAddr(txHash, 4);
  return (
    <p className="modal-tx">
      tx{" "}
      {url ? (
        <a href={url} target="_blank" rel="noreferrer">
          {short} ↗
        </a>
      ) : (
        <span>{short}</span>
      )}
    </p>
  );
}
