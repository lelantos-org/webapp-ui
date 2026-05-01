// One-time wallet setup modal for the Permit2 AllowanceTransfer flow.

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { RegisteredAsset } from "@/features/assets/registered-assets";
import { useInvalidateSetupStatus } from "@/features/onboarding/use-setup-status";
import { useWallet } from "@/features/wallet";
import {
  defaultAllowanceCap,
  defaultAllowanceExpirationSecs,
  ensurePermit2AuthorizedSetup,
  type SetupStatus,
  type SetupStep,
} from "@/features/wallet/permit2";
import { classifyError as classifyErrorKind } from "@/shared/lib/errors";
import { formatAmountForAsset } from "@/shared/lib/format";
import { txExplorerUrl } from "@/shared/lib/toast";
import { Stepper, type StepperItem } from "@/shared/ui/Stepper";

type Screen = "intro" | "running" | "done" | "failed";

const ALL_STEPS: { id: SetupStep; label: string }[] = [
  { id: "approving", label: "authorize Permit2" },
  { id: "signing", label: "sign deposit allowance" },
  { id: "permitting", label: "submit allowance on-chain" },
];

const RUNNING_COPY: Record<SetupStep, Record<SetupStatus, string>> = {
  approving: {
    wallet: "Approving token for Permit2 — confirm in your wallet.",
    confirming: "Approval submitted. Waiting for block confirmation…",
  },
  signing: {
    wallet: "Sign the allowance — no gas, just a signature.",
    confirming: "Sign the allowance — no gas, just a signature.",
  },
  permitting: {
    wallet: "Confirm the on-chain submission in your wallet.",
    confirming: "Submitted. Waiting for block confirmation…",
  },
};

const FALLBACK_AMOUNT_BASE = 100n;
const EXPIRY_DAYS = 30;
const DONE_AUTOCLOSE_MS = 1500;

export interface SetupFlowProps {
  asset: RegisteredAsset;
  /// Live deposit amount (in token base units) — used to size the cap.
  pendingAmountBase?: bigint;
  /// True if the ERC20 → Permit2 approve step is still required.
  needsErc20Approve: boolean;
  onSuccess(): void;
  onCancel(): void;
}

export function SetupFlow(props: SetupFlowProps) {
  const target = typeof document !== "undefined" ? document.body : null;
  if (!target) return null;
  return createPortal(<SetupModal {...props} />, target);
}

function SetupModal({
  asset,
  pendingAmountBase,
  needsErc20Approve,
  onSuccess,
  onCancel,
}: SetupFlowProps) {
  const { wallet } = useWallet();
  const invalidate = useInvalidateSetupStatus();
  const [screen, setScreen] = useState<Screen>("intro");
  const [activeStep, setActiveStep] = useState<SetupStep>(
    needsErc20Approve ? "approving" : "signing",
  );
  const [activeStatus, setActiveStatus] = useState<SetupStatus>("wallet");
  const [activeTxHash, setActiveTxHash] = useState<string | undefined>(undefined);
  const [error, setError] = useState<{ kind: "rejected" | "failed"; msg: string } | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const cancelledRef = useRef(false);
  const titleId = useId();
  const descId = useId();
  const modalRef = useRef<HTMLDivElement>(null);

  const baseTotal = pendingAmountBase ?? FALLBACK_AMOUNT_BASE * 10n ** BigInt(asset.decimals);
  const cap = defaultAllowanceCap(baseTotal);
  const expiration = defaultAllowanceExpirationSecs();
  const expiryStr = new Date(expiration * 1000).toISOString().slice(0, 10);
  const visibleSteps: StepperItem[] = needsErc20Approve
    ? ALL_STEPS
    : ALL_STEPS.filter((s) => s.id !== "approving");

  const dismissable = screen === "intro" || screen === "failed" || screen === "done";

  const run = useCallback(async () => {
    if (!wallet) return;
    cancelledRef.current = false;
    setError(null);
    setActiveStep(needsErc20Approve ? "approving" : "signing");
    setActiveStatus("wallet");
    setActiveTxHash(undefined);
    setScreen("running");
    try {
      await ensurePermit2AuthorizedSetup(
        wallet,
        asset.token,
        cap,
        expiration,
        (step, status, txHash) => {
          if (cancelledRef.current) return;
          setActiveStep(step);
          setActiveStatus(status);
          setActiveTxHash(txHash);
        },
      );
      if (cancelledRef.current) return;
      await invalidate(asset.id);
      setScreen("done");
    } catch (e) {
      if (cancelledRef.current) return;
      setError(classifyError(e));
      setScreen("failed");
    }
  }, [wallet, asset.id, asset.token, cap, expiration, invalidate, needsErc20Approve]);

  useEffect(() => {
    if (screen !== "done") return;
    const t = setTimeout(() => onSuccess(), DONE_AUTOCLOSE_MS);
    return () => clearTimeout(t);
  }, [screen, onSuccess]);

  useEffect(
    () => () => {
      cancelledRef.current = true;
    },
    [],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && dismissable) {
        e.stopPropagation();
        onCancel();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dismissable, onCancel]);

  // Focus the modal on mount so Tab cycles inside the portal.
  useEffect(() => {
    const root = modalRef.current;
    if (!root) return;
    const primary = root.querySelector<HTMLElement>("[data-primary]");
    if (primary) {
      primary.focus();
      return;
    }
    const focusables = root.querySelectorAll<HTMLElement>(
      "button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])",
    );
    focusables[0]?.focus();
  }, []);

  const onBackdrop = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget && dismissable) onCancel();
  };

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: backdrop click paired with Escape-key handler on window for keyboard dismiss
    // biome-ignore lint/a11y/useKeyWithClickEvents: keyboard equivalent is Escape, handled at window level
    <div
      className={`setup-overlay${dismissable ? "" : " setup-overlay--locked"}`}
      onClick={onBackdrop}
    >
      <div
        ref={modalRef}
        className={`setup-modal${screen === "running" ? " setup-modal--running" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        tabIndex={-1}
        onKeyDown={(e) => trapFocus(e, modalRef.current)}
      >
        <h2 id={titleId} className="setup-title">
          One-time setup
        </h2>

        {screen === "intro" ? (
          <>
            <p id={descId} className="setup-copy">
              You're depositing <strong>{asset.symbol}</strong> into the shielded pool. We need a
              one-time on-chain authorization so future deposits take a single signature.
            </p>
            <p className="setup-copy">
              This grants the pool an allowance up to{" "}
              <strong>
                {formatAmountForAsset(cap, asset.decimals, asset.scale)} {asset.symbol}
              </strong>
              , valid for {EXPIRY_DAYS} days.
            </p>
            <details
              className="setup-advanced"
              open={showAdvanced}
              onToggle={(e) => setShowAdvanced((e.target as HTMLDetailsElement).open)}
            >
              <summary>Advanced</summary>
              <p className="setup-meta">
                cap: {formatAmountForAsset(cap, asset.decimals, asset.scale)} {asset.symbol}
                <br />
                expires: {expiryStr}
                <br />
                steps: {visibleSteps.length}
              </p>
            </details>
            <div className="setup-actions">
              <button type="button" className="btn btn--ghost" onClick={onCancel}>
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
            <p id={descId} className="setup-copy">
              {RUNNING_COPY[activeStep][activeStatus]}
            </p>
            <Stepper steps={visibleSteps} current={activeStep} />
            {activeStatus === "confirming" && activeTxHash ? (
              <TxHashLine txHash={activeTxHash} />
            ) : null}
            <p className="setup-meta">Do not close this window.</p>
          </>
        ) : null}

        {screen === "failed" ? (
          <>
            <p id={descId} className="setup-copy">
              {error?.kind === "rejected"
                ? `You cancelled the ${stepLabel(activeStep)} step. Try again when ready.`
                : "Setup failed. See details below."}
            </p>
            <Stepper steps={visibleSteps} current={activeStep} failed />
            {error?.kind === "failed" ? <div className="err">{error.msg}</div> : null}
            <div className="setup-actions">
              <button type="button" className="btn btn--ghost" onClick={onCancel}>
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
            <p id={descId} className="setup-copy">
              Setup complete. You can now deposit with a single signature.
            </p>
            <Stepper
              steps={visibleSteps}
              current={visibleSteps[visibleSteps.length - 1]?.id}
              done
            />
          </>
        ) : null}
      </div>
    </div>
  );
}

function stepLabel(step: SetupStep): string {
  return ALL_STEPS.find((s) => s.id === step)?.label ?? step;
}

function classifyError(e: unknown): { kind: "rejected" | "failed"; msg: string } {
  const c = classifyErrorKind(e);
  return {
    kind: c.kind,
    msg: c.kind === "failed" ? "Something went wrong. Please try again." : c.raw,
  };
}

function TxHashLine({ txHash }: { txHash: string }) {
  const url = txExplorerUrl(txHash);
  const short = `${txHash.slice(0, 6)}…${txHash.slice(-4)}`;
  return (
    <p className="setup-tx">
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

function trapFocus(e: React.KeyboardEvent, root: HTMLElement | null) {
  if (e.key !== "Tab" || !root) return;
  const focusables = root.querySelectorAll<HTMLElement>(
    "button:not(:disabled), [href], input, select, textarea, [tabindex]:not([tabindex='-1'])",
  );
  if (focusables.length === 0) return;
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  const active = document.activeElement as HTMLElement | null;
  if (e.shiftKey && active === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && active === last) {
    e.preventDefault();
    first.focus();
  }
}
