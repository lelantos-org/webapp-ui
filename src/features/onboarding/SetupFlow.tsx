// One-time wallet setup modal for the Permit2 AllowanceTransfer flow.

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import type { RegisteredAsset } from "@/features/assets";
import { useTxExplorerUrl } from "@/features/chain";
import {
  defaultAllowanceCap,
  defaultAllowanceExpirationSecs,
  ensurePermit2AuthorizedSetupBatch,
  type SetupProgress,
  type SetupStep,
  useWallet,
} from "@/features/wallet";
import { shortAddr } from "@/shared/lib/format";
import { MODAL_EXIT_MS } from "@/shared/lib/motion";
import { type ReportedError, reportError } from "@/shared/lib/report-error";
import { Modal } from "@/shared/ui/Modal";
import { Stepper, type StepperItem } from "@/shared/ui/Stepper";
import { useExitTransition } from "@/shared/ui/use-exit-transition";
import { useInvalidateSetupStatus } from "./use-setup-status";

type Screen = "intro" | "running" | "done" | "failed";

const SHARED_STEPS: { id: SetupStep; label: string }[] = [
  { id: "signing", label: "sign allowances" },
  { id: "permitting", label: "submit allowances on-chain" },
];

/// The approval line names its token and position, since it is the repeating
/// step; without them, N identical prompts read as one stuck prompt.
function runningCopy(p: SetupProgress, symbolOf: (t: string) => string): string {
  if (p.step === "approving") {
    const sym = symbolOf(p.token);
    const where = p.total > 1 ? ` (${p.index}/${p.total})` : "";
    return p.status === "wallet"
      ? `Approving ${sym} for Permit2${where} — confirm in your wallet.`
      : `${sym} approval submitted${where}. Waiting for block confirmation…`;
  }
  if (p.step === "signing") return "Sign the allowances — no gas, just one signature.";
  return p.status === "wallet"
    ? "Confirm the on-chain submission in your wallet."
    : "Submitted. Waiting for block confirmation…";
}

/// The cost of a run: approvals do not batch, so N tokens means N prompts plus
/// the two shared steps. Shared with `SetupAllModal`, which quotes the same
/// figure before the flow starts.
export function setupCostLine(approvals: number): string {
  const a = approvals > 0 ? `${approvals} approval${approvals === 1 ? "" : "s"}, ` : "";
  return `${a}1 signature, 1 transaction`;
}

/// Where the flow will start, before any progress callback has fired.
function initialProgress(toApprove: readonly RegisteredAsset[]): SetupProgress {
  const first = toApprove[0];
  return first
    ? { step: "approving", status: "wallet", token: first.token, index: 1, total: toApprove.length }
    : { step: "signing", status: "wallet" };
}

/// Stepper row id for one token's approval. Shared by the row and the highlight,
/// so a rename cannot desynchronise them.
const approvalStepId = (assetId: bigint | undefined) => `approving:${assetId}`;

const EXPIRY_DAYS = 365;
const DONE_AUTOCLOSE_MS = 1500;

export interface SetupFlowProps {
  /// Tokens to authorize. One entry is the deposit-form path; N entries collapse
  /// the signature and the permit tx into one each, which is why this takes an
  /// array.
  assets: RegisteredAsset[];
  /// Whether `asset` still needs the ERC-20 → Permit2 approval. Per-asset,
  /// because that step does not batch.
  needsErc20Approve(assetId: bigint): boolean;
  onSuccess(): void;
  onCancel(): void;
}

export function SetupFlow({ assets, needsErc20Approve, onSuccess, onCancel }: SetupFlowProps) {
  const { wallet } = useWallet();
  const invalidate = useInvalidateSetupStatus();
  const [screen, setScreen] = useState<Screen>("intro");
  // Memoised so `run` below keeps a stable identity across renders.
  const toApprove = useMemo(
    () => assets.filter((a) => needsErc20Approve(a.id)),
    [assets, needsErc20Approve],
  );
  const [progress, setProgress] = useState<SetupProgress>(() => initialProgress(toApprove));
  const [error, setError] = useState<ReportedError | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const { exiting, exit } = useExitTransition(MODAL_EXIT_MS);
  const cancelledRef = useRef(false);
  const descId = useId();

  const cap = defaultAllowanceCap();
  const expiration = defaultAllowanceExpirationSecs();
  const expiryStr = new Date(expiration * 1000).toISOString().slice(0, 10);
  const assetByToken = (token: string) =>
    assets.find((a) => a.token.toLowerCase() === token.toLowerCase());
  const symbolOf = (token: string) => assetByToken(token)?.symbol ?? "token";
  const symbolList = assets.map((a) => a.symbol).join(", ");
  const costLine = `${setupCostLine(toApprove.length)}.`;

  // One approval row per token that needs one. They are separate wallet prompts,
  // so a single combined row would show a finished step while further prompts
  // were still coming.
  const visibleSteps: StepperItem[] = [
    ...toApprove.map((a) => ({ id: approvalStepId(a.id), label: `authorize ${a.symbol}` })),
    ...SHARED_STEPS,
  ];
  const currentStepId =
    progress.step === "approving"
      ? approvalStepId(assetByToken(progress.token)?.id)
      : progress.step;
  // The running and failed screens both need the label for the current step,
  // which `visibleSteps` already holds.
  const currentLabel = visibleSteps.find((s) => s.id === currentStepId)?.label ?? progress.step;

  // While the flow is running and the wallet is mid-prompt no dismiss path is
  // open, and the overlay indicates this with a busy cursor. `Modal` also closes
  // those paths for the duration of the exit.
  const locked = !(screen === "intro" || screen === "failed" || screen === "done");

  const requestCancel = useCallback(() => exit(onCancel), [exit, onCancel]);
  const requestSuccess = useCallback(() => exit(onSuccess), [exit, onSuccess]);

  const run = useCallback(async () => {
    if (!wallet) return;
    cancelledRef.current = false;
    setError(null);
    setProgress(initialProgress(toApprove));
    setScreen("running");
    try {
      await ensurePermit2AuthorizedSetupBatch(
        wallet,
        assets.map((a) => ({ token: a.token, cap, expirationUnixSecs: expiration })),
        (p) => {
          if (cancelledRef.current) return;
          setProgress(p);
        },
      );
      if (cancelledRef.current) return;
      // Each asset keeps its own cache entry, so each needs its own invalidation.
      await Promise.all(assets.map((a) => invalidate(a.id)));
      setScreen("done");
    } catch (e) {
      if (cancelledRef.current) return;
      setError(reportError("permit2 setup failed", e));
      setScreen("failed");
    }
  }, [wallet, assets, cap, expiration, invalidate, toApprove]);

  useEffect(() => {
    if (screen !== "done") return;
    const t = setTimeout(() => requestSuccess(), DONE_AUTOCLOSE_MS);
    return () => clearTimeout(t);
  }, [screen, requestSuccess]);

  useEffect(
    () => () => {
      cancelledRef.current = true;
    },
    [],
  );

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
            {assets.length === 1 ? "that token" : "those tokens"}, valid for {EXPIRY_DAYS} days. The
            pool can only draw on it during a deposit you send yourself, and you can revoke it at
            any time.
          </p>
          <p className="modal-meta">{costLine}</p>
          <details
            className="modal-advanced"
            open={showAdvanced}
            onToggle={(e) => setShowAdvanced((e.target as HTMLDetailsElement).open)}
          >
            <summary>Advanced</summary>
            <p className="modal-meta">
              cap: unlimited ({symbolList})
              <br />
              expires: {expiryStr}
              <br />
              steps: {visibleSteps.length}
            </p>
          </details>
          <div className="modal-actions">
            <button type="button" className="btn btn--ghost" onClick={requestCancel}>
              cancel
            </button>
            <button type="button" className="btn" onClick={run} disabled={!wallet} data-primary>
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
          <Stepper steps={visibleSteps} current={currentStepId} />
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
          <Stepper steps={visibleSteps} current={currentStepId} failed />
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
          <Stepper steps={visibleSteps} current={visibleSteps[visibleSteps.length - 1]?.id} done />
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
