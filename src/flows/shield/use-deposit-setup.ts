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
  /// What the user must still authorize, across every token the deposit pulls.
  needs: SetupNeeds;
  /// Tokens to run setup for; referentially stable while it names the same tokens.
  assets: RegisteredAsset[];
  /// Whether a run will send `asset`'s ERC-20 approval (per token: that step does not batch).
  willApproveErc20(asset: RegisteredAsset): boolean;
  /// Permit2 setup applies (false only for native ETH), whether or not the probe succeeded.
  applicable: boolean;
  /// The allowances could not be read.
  unknown: boolean;
  /// Submit must stay disabled: setup is outstanding or its state is unknown.
  blocked: boolean;
  open: boolean;
  show(): void;
  /// Dismiss without running; submit stays blocked.
  dismiss(): void;
  /// Dismiss and re-read the allowances the flow just changed.
  complete(): void;
}

export interface DepositSetupInputs {
  asEth: boolean;
  /// What the deposit pulls per token, fees included.
  pulls: readonly DepositPull<RegisteredAsset, TokenAmount | undefined>[];
}

/// Permit2 setup state for a deposit, and the setup modal's open state.
export function useDepositSetup({ asEth, pulls }: DepositSetupInputs): DepositSetup {
  const status = useSetupStatus(
    pulls.map((p) => p.asset),
    { asEth },
  );
  const [open, setOpen] = useState(false);
  const { error, refetch } = status;

  // Gate on asEth: native ETH shares WETH's asset id, so its cached WETH allowance must not block it.
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

/// `assets`, kept referentially stable while it names the same ids.
function useSameAssets(assets: RegisteredAsset[]): RegisteredAsset[] {
  const key = assets.map((a) => a.id).join(",");
  // biome-ignore lint/correctness/useExhaustiveDependencies: `key` stands for `assets`
  return useMemo(() => assets, [key]);
}
