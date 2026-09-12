// Running a Permit2 setup batch: the screen it is on, where it has got to, and
// what stopped it.

import { useCallback, useMemo, useState } from "react";
import type { RegisteredAsset } from "@/config/chains";
import { useWalletInstance } from "@/features/wallet";
import { type ReportedError, reportError } from "@/shared/lib/errors";
import { createLogger } from "@/shared/lib/logger";
import { useIsMounted } from "@/shared/lib/use-is-mounted";
import { byDistinctToken } from "./by-token";
import {
  ALLOWANCE_CAP,
  defaultAllowanceExpirationSecs,
  ensurePermit2AuthorizedSetupBatch,
  type SetupProgress,
} from "./permit2-setup";
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
  /// A wallet is connected to run against.
  canRun: boolean;
  run(): Promise<void>;
}

export function useSetupRun(
  assets: RegisteredAsset[],
  willApproveErc20: (asset: RegisteredAsset) => boolean,
): SetupRun {
  const wallet = useWalletInstance();
  const invalidate = useInvalidateSetupStatus();
  const isMounted = useIsMounted();
  const [screen, setScreen] = useState<SetupScreen>("intro");
  // Memoised so `run` below keeps a stable identity across renders. Per
  // distinct token: two ids over one token are one approval, and
  // `ensurePermit2AuthorizedSetupBatch` collapses them the same way.
  const toApprove = useMemo(
    () => byDistinctToken(assets).filter((a) => willApproveErc20(a)),
    [assets, willApproveErc20],
  );
  const [progress, setProgress] = useState<SetupProgress>(() => initialProgress(toApprove));
  const [error, setError] = useState<ReportedError | null>(null);

  // Progress, failure and success all land after wallet prompts the user may
  // close the modal during, so each is dropped once the flow has unmounted.
  const run = useCallback(async () => {
    if (!wallet) return;
    setError(null);
    setProgress(initialProgress(toApprove));
    setScreen("running");
    // Read when the run starts rather than at render: the clock moves under a
    // modal left open, and an expiry read at render would grant a window counted
    // from whenever the intro last re-rendered.
    const cap = ALLOWANCE_CAP;
    const expiration = defaultAllowanceExpirationSecs();
    try {
      await ensurePermit2AuthorizedSetupBatch(
        wallet,
        assets.map((a) => ({ token: a.token, cap, expirationUnixSecs: expiration })),
        (p) => {
          if (isMounted()) setProgress(p);
        },
      );
      if (!isMounted()) return;
    } catch (e) {
      if (!isMounted()) return;
      setError(reportError("permit2 setup failed", e));
      setScreen("failed");
      return;
    }
    setScreen("done");
    // Outside the try, and after the screen: the allowances are on-chain by this
    // point, so a failed cache invalidation is a stale read, not a failed setup.
    // Inside, it would render "setup failed" over a setup that succeeded and
    // send the retry through a second signature and permit tx.
    // One invalidation per distinct token, not per asset: the probes are cached
    // by token, so ids sharing one would fire N identical invalidations of a
    // single entry.
    await Promise.all(byDistinctToken(assets).map((a) => invalidate(a.token))).catch((e) => {
      log.warn("setup succeeded but the allowance probe could not be invalidated", e);
    });
  }, [wallet, assets, invalidate, toApprove, isMounted]);

  return { screen, progress, error, toApprove, canRun: !!wallet, run };
}
