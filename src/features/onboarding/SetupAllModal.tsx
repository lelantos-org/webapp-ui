// Multi-token Permit2 setup: pick tokens, authorize them in one pass.
//
// The signature and the on-chain `permit` batch across tokens via Permit2's
// `PermitBatch`, while the ERC-20 approval does not. Authorizing a portfolio one
// token at a time therefore repeats the two batchable steps once per token.

import { useCallback, useId, useMemo, useState } from "react";
import { type RegisteredAsset, useRegisteredAssets } from "@/features/assets";
import { useWallet } from "@/features/wallet";
import { MODAL_EXIT_MS } from "@/shared/lib/motion";
import { Modal } from "@/shared/ui/Modal";
import { useExitTransition } from "@/shared/ui/use-exit-transition";
import { SetupFlow, setupCostLine } from "./SetupFlow";
import { evaluateSetupMany, useSetupStatusMany } from "./use-setup-status";

export interface SetupAllModalProps {
  onClose(): void;
}

export function SetupAllModal({ onClose }: SetupAllModalProps) {
  const assets = useRegisteredAssets();
  const { wallet } = useWallet();
  const descId = useId();
  const { exiting, exit } = useExitTransition(MODAL_EXIT_MS);

  // Every registered asset is a candidate, WETH included: only the native ETH
  // path skips Permit2, and that is a flag on the deposit form rather than a
  // property of the asset. Depositing ERC-20 WETH needs the same setup as any
  // other token.
  const ids = useMemo(() => assets.map((a) => a.id), [assets]);

  const { statuses, isLoading } = useSetupStatusMany(ids);
  // No totals: before an amount is typed there is nothing to compare against, so
  // this is the existence check `evaluateSetup` falls back to.
  const needs = useMemo(() => evaluateSetupMany(statuses), [statuses]);

  // `needs` holds entries only for assets whose probe settled, so a missing entry
  // means unanswered rather than nothing to do. Hence the explicit split rather
  // than one filter and its negation.
  const outstanding = assets.filter((a) => needs.get(a.id)?.needsSetup === true);
  const covered = assets.filter((a) => needs.get(a.id)?.needsSetup === false);

  // Pre-check everything that needs setup. `undefined` until the probes settle,
  // so the checkboxes do not render empty and then fill in.
  const [picked, setPicked] = useState<ReadonlySet<bigint> | undefined>(undefined);
  const selectedIds = picked ?? new Set(outstanding.map((a) => a.id));
  const selected = assets.filter((a) => selectedIds.has(a.id));

  // The run is frozen at launch rather than re-derived from `needs` while in
  // flight.
  //
  // `SetupFlow` invalidates each asset's probe on success, which empties
  // `outstanding` and with it the default `selectedIds`; a live-derived asset
  // list would then empty and unmount the flow before its done screen could
  // auto-close. Snapshotting also keeps the stepper from re-labelling itself when
  // an approval lands mid-run.
  const [run, setRun] = useState<{
    assets: RegisteredAsset[];
    needsApproval: ReadonlySet<bigint>;
  } | null>(null);

  const startRun = useCallback(() => {
    // `true` for an asset whose probe has not settled: assuming the approval is
    // needed costs at most a skipped tx, while assuming it is not breaks the
    // pull.
    const needsApproval = new Set(
      selected.filter((a) => needs.get(a.id)?.needsErc20Approve ?? true).map((a) => a.id),
    );
    setRun({ assets: selected, needsApproval });
  }, [selected, needs]);

  // Reads the frozen snapshot, so it keeps a stable identity for the whole run;
  // `SetupFlow` memoises `toApprove` over it.
  const runApproval = run?.needsApproval;
  const runNeedsErc20Approve = useCallback(
    (id: bigint) => runApproval?.has(id) ?? true,
    [runApproval],
  );

  const toggle = (a: RegisteredAsset) => {
    const next = new Set(selectedIds);
    if (!next.delete(a.id)) next.add(a.id);
    setPicked(next);
  };

  const allSelected = outstanding.length > 0 && outstanding.every((a) => selectedIds.has(a.id));
  const selectAll = () =>
    setPicked(allSelected ? new Set() : new Set(outstanding.map((a) => a.id)));

  if (run) {
    return (
      <SetupFlow
        assets={run.assets}
        needsErc20Approve={runNeedsErc20Approve}
        onSuccess={onClose}
        onCancel={() => setRun(null)}
      />
    );
  }

  const cost = setupCostLine(selected.filter((a) => needs.get(a.id)?.needsErc20Approve).length);

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
            <button type="button" className="lnk lnk--inline" onClick={selectAll}>
              {allSelected ? "clear all" : "select all"}
            </button>
          </p>
          <ul className="setup-token-list">
            {outstanding.map((a) => (
              <li key={a.id.toString()}>
                <label>
                  <input
                    type="checkbox"
                    checked={selectedIds.has(a.id)}
                    onChange={() => toggle(a)}
                  />{" "}
                  {a.symbol}
                  {needs.get(a.id)?.needsErc20Approve ? (
                    <span className="modal-meta"> · needs approval</span>
                  ) : null}
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
