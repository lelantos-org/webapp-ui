// Multi-token Permit2 setup: pick tokens, authorize them in one pass.
//
// The signature and the on-chain `permit` batch across tokens via Permit2's
// `PermitBatch`, while the ERC-20 approval does not. Authorizing a portfolio one
// token at a time therefore repeats the two batchable steps once per token.

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

export function SetupAllModal({ onClose }: SetupAllModalProps) {
  const assets = useRegisteredAssets();
  const wallet = useWalletInstance();
  const descId = useId();
  const { exiting, exit } = useExitTransition(MODAL_EXIT_MS);

  // Every registered asset is a candidate, WETH included: only the native ETH
  // path skips Permit2, and that is a flag on the deposit form rather than a
  // property of the asset. Depositing ERC-20 WETH needs the same setup as any
  // other token.
  const { needs, isLoading } = useSetupNeedsByToken(assets);

  // Presented, picked and run per token, not per asset id: the pool registers a
  // separate id for each yield variant over the same ERC-20, and both the ERC-20
  // approval and the Permit2 window are keyed by token. Listed by id, one token
  // appeared once per variant and each copy authorized the other.
  const distinct = useMemo(() => byDistinctToken(assets), [assets]);

  // `needs` holds entries only for tokens whose probe settled, so a missing
  // entry means unanswered rather than nothing to do — hence the explicit split
  // rather than one filter and its negation.
  const outstanding = distinct.filter((a) => needs.get(tokenKey(a))?.needsSetup === true);
  const covered = distinct.filter((a) => needs.get(tokenKey(a))?.needsSetup === false);

  // `true` for a token whose probe has not settled: assuming the approval is
  // needed costs at most a skipped tx, while assuming it is not breaks the pull —
  // and the badge and the cost line cannot come in under the run they describe.
  const willApprove = (a: RegisteredAsset) => needs.get(tokenKey(a))?.willApproveErc20 ?? true;

  // Pre-check everything that needs setup. `undefined` until the probes settle,
  // so the checkboxes do not render empty and then fill in.
  const [picked, setPicked] = useState<ReadonlySet<string> | undefined>(undefined);
  const selectedTokens = picked ?? new Set(outstanding.map((a) => tokenKey(a)));
  const selected = distinct.filter((a) => selectedTokens.has(tokenKey(a)));

  // The run is frozen at launch rather than re-derived from `needs` while in
  // flight.
  //
  // `SetupFlow` invalidates each token's probe on success, which empties
  // `outstanding` and with it the default selection; a live-derived asset list
  // would then empty and unmount the flow before its done screen could
  // auto-close. Snapshotting also keeps the stepper from re-labelling itself when
  // an approval lands mid-run.
  const [run, setRun] = useState<{
    assets: RegisteredAsset[];
    needsApproval: ReadonlySet<string>;
  } | null>(null);
  const startRun = () =>
    setRun({
      assets: selected,
      needsApproval: new Set(selected.filter(willApprove).map(tokenKey)),
    });

  // Reads the frozen snapshot, so it keeps a stable identity for the whole run;
  // `SetupFlow` memoises `toApprove` over it.
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
