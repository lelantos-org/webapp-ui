// Bundles the Permit2 setup concern for the deposit form: what is still
// required, whether that blocks submit, and the modal's open state.

import { useCallback, useEffect, useState } from "react";
import { createLogger } from "@/shared/lib/logger";
import { evaluateSetup, NO_SETUP_NEEDS, type SetupNeeds, useSetupStatus } from "./use-setup-status";

const log = createLogger("permit2:setup");

export interface DepositSetup {
  /// What the user must still authorize for this asset and amount.
  needs: SetupNeeds;
  /// Whether Permit2 setup is meaningful for this asset at all — false only
  /// for native ETH, which does not go through Permit2.
  ///
  /// Deliberately independent of whether the probe succeeded: a failed read
  /// is when a manual way to run setup matters most, so it must not be the
  /// thing that hides the offer.
  applicable: boolean;
  /// The allowances could not be read, so nothing can be concluded about them.
  unknown: boolean;
  /// Submit must stay disabled: setup is outstanding, or its state is unknown
  /// and submitting would risk a failure the gate should have caught.
  blocked: boolean;
  open: boolean;
  /// Show the setup flow.
  show(): void;
  /// Dismiss without running it. Submit stays blocked; the prompt remains.
  dismiss(): void;
  /// Dismiss and re-read the allowances the flow just changed.
  complete(): void;
}

export interface DepositSetupInputs {
  asEth: boolean;
  /// Deposit amount plus protocol fee, in token base units.
  total: bigint | undefined;
}

export function useDepositSetup(
  asset: bigint | undefined,
  { asEth, total }: DepositSetupInputs,
): DepositSetup {
  const status = useSetupStatus(asset, { asEth });
  const [open, setOpen] = useState(false);
  const { error, refetch } = status;

  // Native ETH does not go through Permit2 at all, so nothing about the
  // allowance state may reach the caller on that path.
  //
  // This is load-bearing rather than tidiness. "ETH (native)" is encoded as
  // `asset = WETH.id` plus `asEth`, so selecting it does not change the asset
  // id — and the query is keyed by `(chain, payer, asset)`. Switching to ETH
  // only flips `enabled` to false, which leaves the WETH allowance state
  // sitting in the cache. Reading it here made an outstanding WETH approval
  // block a native-ETH deposit that never needed one, while `applicable`
  // hid the notice that would have let the user clear it.
  const applicable = !asEth && asset !== undefined;
  const needs = applicable ? evaluateSetup(status.data, total) : NO_SETUP_NEEDS;

  // The notice can only say the state is unknown; the cause belongs in the log.
  useEffect(() => {
    if (error) log.warn("permit2 allowance probe failed", error);
  }, [error]);

  const show = useCallback(() => setOpen(true), []);
  const dismiss = useCallback(() => setOpen(false), []);
  const complete = useCallback(() => {
    setOpen(false);
    void refetch();
  }, [refetch]);

  return {
    needs,
    applicable,
    unknown: applicable && status.isError,
    blocked: applicable && (needs.needsSetup || status.isLoading || status.isError),
    open,
    show,
    dismiss,
    complete,
  };
}
