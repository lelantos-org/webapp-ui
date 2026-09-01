// Bundles the Permit2 setup concern for the deposit form: what is still
// required, whether that blocks submit, and the modal's open state.

import { useCallback, useEffect, useState } from "react";
import type { RegisteredAsset } from "@/features/assets";
import { createLogger } from "@/shared/lib/logger";
import { evaluateSetup, NO_SETUP_NEEDS, type SetupNeeds, useSetupStatus } from "./use-setup-status";

const log = createLogger("permit2:setup");

export interface DepositSetup {
  /// What the user must still authorize for this asset and amount.
  needs: SetupNeeds;
  /// Whether Permit2 setup applies to this asset. False only for native ETH,
  /// which does not go through Permit2.
  ///
  /// Independent of whether the probe succeeded: a failed read is when a manual
  /// route into setup matters most, so it must not hide the offer.
  applicable: boolean;
  /// The allowances could not be read, so nothing can be concluded about them.
  unknown: boolean;
  /// Submit must stay disabled, because setup is outstanding or its state is
  /// unknown and submitting would risk a failure this gate exists to catch.
  blocked: boolean;
  open: boolean;
  /// Show the setup flow.
  show(): void;
  /// Dismiss without running it. Submit stays blocked and the prompt remains.
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
  asset: RegisteredAsset | undefined,
  { asEth, total }: DepositSetupInputs,
): DepositSetup {
  const status = useSetupStatus(asset, { asEth });
  const [open, setOpen] = useState(false);
  const { error, refetch } = status;

  // Native ETH does not go through Permit2, so no allowance state reaches the
  // caller on that path.
  //
  // "ETH (native)" is encoded as `asset = WETH.id` plus `asEth`, so selecting it
  // does not change the asset id while the query is keyed by
  // `(chain, payer, asset)`. Switching to ETH only flips `enabled` to false,
  // leaving the WETH allowance state in the cache; reading it here would let an
  // outstanding WETH approval block a native-ETH deposit that never needed one,
  // while `applicable` hid the notice for clearing it.
  const applicable = !asEth && asset !== undefined;
  const needs = applicable ? evaluateSetup(status.data, total) : NO_SETUP_NEEDS;

  // The notice can only report that the state is unknown; the cause is logged.
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
