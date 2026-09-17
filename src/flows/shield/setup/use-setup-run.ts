import { useCallback, useMemo, useState } from "react";
import type { RegisteredAsset } from "@/config/chains";
import { useWalletInstance } from "@/features/wallet";
import { useIsMounted } from "@/shared/hooks/use-is-mounted";
import { type ReportedError, reportError } from "@/shared/lib/errors";
import { createLogger } from "@/shared/lib/logger";
import { byDistinctToken } from "./by-token";
import { ALLOWANCE_CAP, defaultAllowanceExpirationSecs, type SetupProgress } from "./permit2-setup";
import { initialProgress } from "./setup-copy";
import { useInvalidateSetupStatus } from "./use-setup-status";

const log = createLogger("setup");

export type SetupScreen = "intro" | "running" | "done" | "failed";

export interface SetupRun {
  screen: SetupScreen;
  progress: SetupProgress;
  error: ReportedError | null;
  /// The distinct tokens the run will send an ERC-20 approval for.
  toApprove: RegisteredAsset[];
  canRun: boolean;
  run(): Promise<void>;
}

/// Runs a Permit2 setup batch and tracks its screen, progress and error.
export function useSetupRun(
  assets: RegisteredAsset[],
  willApproveErc20: (asset: RegisteredAsset) => boolean,
): SetupRun {
  const wallet = useWalletInstance();
  const invalidate = useInvalidateSetupStatus();
  const isMounted = useIsMounted();
  const [screen, setScreen] = useState<SetupScreen>("intro");
  const toApprove = useMemo(
    () => byDistinctToken(assets).filter((a) => willApproveErc20(a)),
    [assets, willApproveErc20],
  );
  const [progress, setProgress] = useState<SetupProgress>(() => initialProgress(toApprove));
  const [error, setError] = useState<ReportedError | null>(null);

  const run = useCallback(async () => {
    if (!wallet) return;
    setError(null);
    setProgress(initialProgress(toApprove));
    setScreen("running");
    // Expiry read at run start, not render, so the granted window is not already aged.
    try {
      await wallet.setupDepositAllowance({
        assets: assets.map((a) => a.id),
        cap: ALLOWANCE_CAP,
        expiration: defaultAllowanceExpirationSecs(),
        onProgress: (p) => {
          if (isMounted()) setProgress(p);
        },
      });
      if (!isMounted()) return;
    } catch (e) {
      if (!isMounted()) return;
      setError(reportError("permit2 setup failed", e));
      setScreen("failed");
      return;
    }
    setScreen("done");
    // Outside the try: a failed invalidation must not report a landed setup as failed.
    await Promise.all(byDistinctToken(assets).map((a) => invalidate(a.token))).catch((e) => {
      log.warn("setup succeeded but the allowance probe could not be invalidated", e);
    });
  }, [wallet, assets, invalidate, toApprove, isMounted]);

  return { screen, progress, error, toApprove, canRun: !!wallet, run };
}
