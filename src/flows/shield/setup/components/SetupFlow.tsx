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
  /// Tokens to authorize; the signature and permit tx batch across them.
  assets: RegisteredAsset[];
  /// Whether the run approves `asset`'s token: `SetupNeeds.willApproveErc20`, not `needsErc20Approve`.
  willApproveErc20(asset: RegisteredAsset): boolean;
  onSuccess(): void;
  onCancel(): void;
}

/// The one-time Permit2 AllowanceTransfer setup modal.
export function SetupFlow({ assets, willApproveErc20, onSuccess, onCancel }: SetupFlowProps) {
  const chain = useActiveChainOrUndefined();
  const { screen, progress, error, toApprove, canRun, run } = useSetupRun(assets, willApproveErc20);
  const { exiting, exit } = useExitTransition(MODAL_EXIT_MS);
  const descId = useId();
  const [showAdvanced, setShowAdvanced] = useState(false);

  const expiryStr = new Date(defaultAllowanceExpirationSecs() * 1000).toISOString().slice(0, 10);
  const symbolOf = (token: string) =>
    assets.find((a) => sameAddress(a.token, token))?.symbol ?? "token";
  const distinct = byDistinctToken(assets);
  const symbolList = distinct.map((a) => a.symbol).join(", ");

  const steps = setupSteps(toApprove);
  const current = currentStepId(progress);
  const currentLabel = steps.find((s) => s.id === current)?.label ?? progress.step;

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
            {/* Name the grant's recipients so a user can spot a substituted address. */}
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
