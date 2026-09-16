// Bundles the Permit2 setup concern for the deposit form: what is still
// required, whether that blocks submit, and the modal's open state.
//
// Per token the deposit pulls: the deposited one, and the one paying the
// relayer where that is another. Each needs its own approval and window, and
// the modal authorizes every outstanding one in a single batch.

import type { TokenAmount } from "@lelantos-org/sdk";
import type { DepositPullEntry as DepositPull } from "@lelantos-org/sdk/protocol";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { RegisteredAsset } from "@/config/chains";
import { createLogger } from "@/shared/lib/logger";
import { tokenKey } from "./setup/by-token";
import { evaluateDepositSetup, NO_SETUP_NEEDS, type SetupNeeds } from "./setup/evaluate-setup";
import { useSetupStatus } from "./setup/use-setup-status";

const log = createLogger("permit2:setup");

export interface DepositSetup {
  /// What the user must still authorize for this deposit, across every token it
  /// pulls.
  needs: SetupNeeds;
  /// The tokens to name and to run setup for: those still needing it, or every
  /// pulled token when nothing can be concluded about them. Keeps its identity
  /// while it names the same tokens, so `SetupFlow`'s run does too.
  assets: RegisteredAsset[];
  /// Whether a run will send `asset`'s ERC-20 approval. Per token, because that
  /// step does not batch; see `SetupFlowProps.willApproveErc20`.
  willApproveErc20(asset: RegisteredAsset): boolean;
  /// Whether Permit2 setup applies to this deposit. False only for native ETH,
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
  /// What the deposit pulls per token, fees included (`DepositAmount.pulls`).
  pulls: readonly DepositPull<RegisteredAsset, TokenAmount | undefined>[];
}

export function useDepositSetup({ asEth, pulls }: DepositSetupInputs): DepositSetup {
  const status = useSetupStatus(
    pulls.map((p) => p.asset),
    { asEth },
  );
  const [open, setOpen] = useState(false);
  const { error, refetch } = status;

  // Native ETH does not go through Permit2, so no allowance state reaches the
  // caller on that path.
  //
  // "ETH (native)" is encoded as `asset = WETH.id` plus `asEth`, so selecting it
  // does not change the asset id while the query is keyed by
  // `(chain, payer, token)`. Switching to ETH only flips `enabled` to false,
  // leaving the WETH allowance state in the cache; reading it here would let an
  // outstanding WETH approval block a native-ETH deposit that never needed one,
  // while `applicable` hid the notice for clearing it.
  const applicable = !asEth && pulls.length > 0;
  const { needs, perToken } = applicable
    ? evaluateDepositSetup(pulls.map((p, i) => ({ status: status.data[i], total: p.amount })))
    : { needs: NO_SETUP_NEEDS, perToken: [] };
  const unknown = applicable && status.isError;

  const pulled = pulls.map((p) => p.asset);
  const outstanding = pulled.filter((_, i) => unknown || perToken[i]?.needsSetup);
  const assets = useSameAssets(outstanding.length > 0 ? outstanding : pulled);
  const approving = useSameAssets(pulled.filter((_, i) => perToken[i]?.willApproveErc20));
  const willApproveErc20 = useCallback(
    (asset: RegisteredAsset) => approving.some((a) => tokenKey(a) === tokenKey(asset)),
    [approving],
  );

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
    assets,
    willApproveErc20,
    applicable,
    unknown,
    blocked: applicable && (needs.needsSetup || status.isLoading || status.isError),
    open,
    show,
    dismiss,
    complete,
  };
}

/// `assets`, as the same array for as long as it names the same assets: the list
/// is rebuilt every render, and what it feeds is keyed on its identity.
function useSameAssets(assets: RegisteredAsset[]): RegisteredAsset[] {
  const key = assets.map((a) => a.id).join(",");
  // biome-ignore lint/correctness/useExhaustiveDependencies: `key` stands for `assets`
  return useMemo(() => assets, [key]);
}
