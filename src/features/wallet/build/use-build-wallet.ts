import type { WalletApi } from "@lelantos-org/sdk";
import { useEffect, useMemo, useRef, useState } from "react";
import { chainKey } from "@/config/chains";
import { useActiveChainOrUndefined } from "@/features/chain";
import { getCachedNsk } from "@/features/wallet-kinds";
import { userMessage } from "@/shared/lib/errors";
import { createLogger } from "@/shared/lib/logger";
import { waitWithAbort } from "@/shared/lib/wait";
import type { Session } from "../session/session";
import { releaseScanner } from "../sync/scanner";
import { syncProgress } from "../sync/sync-progress-store";
import { createSharedWorkPool } from "./build-pool";

const log = createLogger("wallet:build");

const MIN_RESUME_MS = 1000;

const loadBuildWallet = () => import("./build-wallet").then((m) => m.buildWallet);

const buildPool = createSharedWorkPool<WalletApi>((wallet) => {
  log.debug("wallet build adopted by nobody; releasing its scanner");
  releaseScanner(wallet);
});

const buildKey = (chainId: bigint, accountId: string) => `${chainKey(chainId)}:${accountId}`;

export interface BuildWalletState {
  wallet: WalletApi | undefined;
  error: string | undefined;
  /// Whether the per-tab nsk cache already holds this account (silent rebuild vs derivation prompt).
  hasCachedKey: boolean;
}

// Keyed by account as well as chain: a chain-only key would hand out the previous account's wallet.
interface BuiltFor<T> {
  chainId: bigint;
  accountKey: string;
  value: T;
}

function currentFor<T>(
  built: BuiltFor<T> | undefined,
  chainId: bigint,
  accountId: string | undefined,
): T | undefined {
  if (!built || accountId === undefined) return undefined;
  const same = built.chainId === chainId && built.accountKey === accountId;
  return same ? built.value : undefined;
}

export function useBuildWallet(session: Session): BuildWalletState {
  const activeChain = useActiveChainOrUndefined();
  const chainId = activeChain?.chainId;
  const [built, setBuilt] = useState<BuiltFor<WalletApi> | undefined>();
  const [failure, setFailure] = useState<BuiltFor<string> | undefined>();

  const usable = session.isConnected && chainId !== undefined;
  const accountId = session.accountKey?.toLowerCase();
  const wallet = usable ? currentFor(built, chainId, accountId) : undefined;
  const error = usable ? currentFor(failure, chainId, accountId) : undefined;

  // Disconnect disposes workers, so the retained wallet is dead, not merely stale: drop it.
  useEffect(() => {
    if (session.isConnected) return;
    setBuilt(undefined);
    setFailure(undefined);
  }, [session.isConnected]);

  useEffect(() => {
    if (chainId === undefined) return;
    syncProgress.reset();
  }, [chainId]);

  // Release a superseded build's scanner workers, or each switch strands a wasm worker pool.
  const prevBuilt = useRef<WalletApi | undefined>(undefined);
  useEffect(() => {
    const prev = prevBuilt.current;
    prevBuilt.current = built?.value;
    if (prev && prev !== built?.value) releaseScanner(prev);
  }, [built]);

  useEffect(() => {
    // Do not read `session.kind` here: a new dep would re-run the build and abort an open prompt.
    log.debug("effect tick", {
      isConnected: session.isConnected,
      hasLayer: !!session.layer,
    });
    if (!session.isConnected || !session.layer || !session.accountKey || !activeChain) return;

    const ctrl = new AbortController();
    const accountKey = session.accountKey;
    const accountId = accountKey.toLowerCase();
    const layer = session.layer;
    const fromCache = getCachedNsk(accountKey) !== undefined;
    const t0 = performance.now();
    log.debug("building wallet", { kind: layer.kind, fromCache });

    // Must register with `buildPool.run` synchronously (see `SharedWorkPool.run`).
    void buildPool
      .run(
        buildKey(activeChain.chainId, accountId),
        async () => {
          const buildWallet = await loadBuildWallet();
          return buildWallet(layer, activeChain, accountKey);
        },
        async (walletApi) => {
          if (ctrl.signal.aborted) return false;
          if (fromCache) {
            const remaining = MIN_RESUME_MS - (performance.now() - t0);
            if (remaining > 0) await waitWithAbort(remaining, ctrl.signal);
            if (ctrl.signal.aborted) return false;
          }
          setBuilt({
            chainId: activeChain.chainId,
            accountKey: accountId,
            value: walletApi,
          });
          return true;
        },
      )
      .catch((e: unknown) => {
        if (ctrl.signal.aborted) return;
        log.error("build failed", e);
        setFailure({
          chainId: activeChain.chainId,
          accountKey: accountId,
          value: userMessage(e),
        });
      });

    return () => ctrl.abort();
  }, [session.isConnected, session.layer, session.accountKey, activeChain]);

  const hasCachedKey = useMemo(
    () => (session.accountKey ? getCachedNsk(session.accountKey) !== undefined : false),
    [session.accountKey],
  );

  return { wallet, error, hasCachedKey };
}
