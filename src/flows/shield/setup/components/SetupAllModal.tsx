import { useCallback, useId, useMemo, useState } from "react";
import type { RegisteredAsset } from "@/config/chains";
import { useRegisteredAssets } from "@/features/assets";
import { useWalletInstance } from "@/features/wallet";
import { useExitTransition } from "@/shared/hooks/use-exit-transition";
import { MODAL_EXIT_MS } from "@/shared/lib/motion";
import { Modal } from "@/shared/ui/Modal";
import { byDistinctToken, tokenKey } from "../by-token";
import { setupCostLine } from "../setup-copy";
import { useSetupNeedsByToken } from "../use-setup-status";
import { SetupFlow } from "./SetupFlow";
import "./SetupAllModal.css";

export interface SetupAllModalProps {
  onClose(): void;
}

/// Multi-token Permit2 setup: pick tokens, authorize them in one batch.
export function SetupAllModal({ onClose }: SetupAllModalProps) {
  const assets = useRegisteredAssets();
  const wallet = useWalletInstance();
  const descId = useId();
  const { exiting, exit } = useExitTransition(MODAL_EXIT_MS);

  const { needs, isLoading } = useSetupNeedsByToken(assets);

  const distinct = useMemo(() => byDistinctToken(assets), [assets]);

  // A missing entry means unanswered, so neither list is the other's negation.
  const outstanding = distinct.filter((a) => needs.get(tokenKey(a))?.needsSetup === true);
  const covered = distinct.filter((a) => needs.get(tokenKey(a))?.needsSetup === false);

  // Unsettled defaults to true: wrongly assuming no approval breaks the pull.
  const willApprove = (a: RegisteredAsset) => needs.get(tokenKey(a))?.willApproveErc20 ?? true;

  const [picked, setPicked] = useState<ReadonlySet<string> | undefined>(undefined);
  const selectedTokens = picked ?? new Set(outstanding.map((a) => tokenKey(a)));
  const selected = distinct.filter((a) => selectedTokens.has(tokenKey(a)));

  // Frozen at launch: success invalidates the probes, which would otherwise unmount the flow.
  const [run, setRun] = useState<{
    assets: RegisteredAsset[];
    needsApproval: ReadonlySet<string>;
  } | null>(null);
  const startRun = () =>
    setRun({
      assets: selected,
      needsApproval: new Set(selected.filter(willApprove).map(tokenKey)),
    });

  const runApproval = run?.needsApproval;
  const runWillApproveErc20 = useCallback(
    (a: RegisteredAsset) => runApproval?.has(tokenKey(a)) ?? true,
    [runApproval],
  );

  const toggle = (a: RegisteredAsset) => {
    const next = new Set(selectedTokens);
    if (!next.delete(tokenKey(a))) next.add(tokenKey(a));
    setPicked(next);
  };

  const allSelected =
    outstanding.length > 0 && outstanding.every((a) => selectedTokens.has(tokenKey(a)));
  const selectAll = () =>
    setPicked(allSelected ? new Set() : new Set(outstanding.map((a) => tokenKey(a))));

  if (run) {
    return (
      <SetupFlow
        assets={run.assets}
        willApproveErc20={runWillApproveErc20}
        onSuccess={onClose}
        onCancel={() => setRun(null)}
      />
    );
  }

  const cost = setupCostLine(selected.filter(willApprove).length);

  return (
    <Modal
      title="Set up tokens"
      onDismiss={() => exit(onClose)}
      exiting={exiting}
      describedBy={descId}
    >
      <p id={descId} className="modal-copy">
        Authorize several tokens at once. The signature and the on-chain step cover every token you
        pick; only the token approvals are one-per-token.
      </p>

      {isLoading ? <p className="modal-meta">Checking approvals…</p> : null}

      {outstanding.length === 0 && !isLoading ? (
        <p className="modal-meta">Every registered token is already set up.</p>
      ) : (
        <>
          <p className="modal-meta">
            <button type="button" className="inline-link" onClick={selectAll}>
              {allSelected ? "clear all" : "select all"}
            </button>
          </p>
          <ul className="setup-token-list">
            {outstanding.map((a) => (
              <li key={tokenKey(a)}>
                <label>
                  <input
                    type="checkbox"
                    checked={selectedTokens.has(tokenKey(a))}
                    onChange={() => toggle(a)}
                  />{" "}
                  {a.symbol}
                  {willApprove(a) ? <span className="modal-meta"> · needs approval</span> : null}
                </label>
              </li>
            ))}
          </ul>
        </>
      )}

      {covered.length > 0 ? (
        <p className="modal-meta">Already set up: {covered.map((a) => a.symbol).join(", ")}.</p>
      ) : null}

      <p className="modal-meta">{selected.length > 0 ? cost : "Nothing selected."}</p>

      <div className="modal-actions">
        <button type="button" className="btn btn--ghost" onClick={() => exit(onClose)}>
          cancel
        </button>
        <button
          type="button"
          className="btn"
          onClick={startRun}
          disabled={!wallet || selected.length === 0}
          data-primary
        >
          run setup
        </button>
      </div>
    </Modal>
  );
}
