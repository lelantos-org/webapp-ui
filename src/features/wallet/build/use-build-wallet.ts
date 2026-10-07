import type { WalletApi } from "@lelantos-org/sdk";
import { useEffect, useMemo, useRef, useState } from "react";
import { type ChainEntry, chainKey } from "@/config/chains";
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

/// How long a silent resume shows its "Resuming…" card at least, so a fast build does not flash it.
const MIN_RESUME_MS = 400;

/// How long the build may take once the key is in hand. Past it the user is given "Try again"
/// in place of a spinner; a build that lands later still connects.
const PREPARE_TIMEOUT_MS = 60_000;
const PREPARE_TIMEOUT_MESSAGE = "Preparing your wallet is taking too long. Check your connection.";

type BuildWallet = typeof import("./build-wallet").buildWallet;

let buildWalletChunk: Promise<BuildWallet> | undefined;

/// The build chunk, fetched once. A failed fetch is not kept, so the next call retries it.
function loadBuildWallet(): Promise<BuildWallet> {
  buildWalletChunk ??= import("./build-wallet")
    .then((m) => m.buildWallet)
    .catch((e: unknown) => {
      buildWalletChunk = undefined;
      throw e;
    });
  return buildWalletChunk;
}

const buildPool = createSharedWorkPool<WalletApi>((wallet) => {
  log.debug("wallet build adopted by nobody; releasing its scanner");
  releaseScanner(wallet);
});

const buildKey = (chainId: bigint, accountId: string) => `${chainKey(chainId)}:${accountId}`;

/// The parts of a chain entry a wallet is built from. A registry refresh that leaves them alone
/// (new token rows, a moved yield index) hands out a new entry object and must not rebuild the wallet.
function buildSignature(chain: ChainEntry | undefined): string | undefined {
  if (!chain) return undefined;
  return [
    chain.chainId,
    chain.chainName,
    chain.rpcUrl,
    chain.readRpcUrl,
    chain.maspAddress,
    chain.relayerAddress,
    chain.permit2Address,
    chain.nativeAdapterAddress,
    chain.swapWrapperAddress,
    chain.genericCallWrapperAddress,
    chain.nameRegistrarAddress,
    chain.treeDepth,
  ].join("|");
}

export interface BuildWalletState {
  wallet: WalletApi | undefined;
  error: string | undefined;
  /// Whether the per-tab nsk cache already holds this account (silent rebuild vs derivation prompt).
  hasCachedKey: boolean;
  /// The key was derived in the current build; what remains asks nothing of the user.
  keyResolved: boolean;
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
  const signature = buildSignature(activeChain);
  // Read through a ref so the build effect re-runs on `signature`, not on entry identity.
  const chainRef = useRef(activeChain);
  chainRef.current = activeChain;
  const [built, setBuilt] = useState<BuiltFor<WalletApi> | undefined>();
  const [failure, setFailure] = useState<BuiltFor<string> | undefined>();
  const [keyResolvedFor, setKeyResolvedFor] = useState<string | undefined>();

  const usable = session.isConnected && chainId !== undefined;
  const accountId = session.accountKey?.toLowerCase();
  const wallet = usable ? currentFor(built, chainId, accountId) : undefined;
  const error = usable ? currentFor(failure, chainId, accountId) : undefined;

  // Disconnect disposes workers, so the retained wallet is dead, not merely stale: drop it.
  useEffect(() => {
    if (session.isConnected) return;
    setBuilt(undefined);
    setFailure(undefined);
    setKeyResolvedFor(undefined);
  }, [session.isConnected]);

  useEffect(() => {
    if (chainId === undefined) return;
    syncProgress.reset();
  }, [chainId]);

  // Fetch the build chunk while the wallet handshake runs, not after it.
  useEffect(() => {
    if (session.isConnecting || session.isConnected) void loadBuildWallet().catch(() => {});
  }, [session.isConnecting, session.isConnected]);

  // Release a superseded build's scanner workers, or each switch strands a wasm worker pool.
  const prevBuilt = useRef<WalletApi | undefined>(undefined);
  useEffect(() => {
    const prev = prevBuilt.current;
    prevBuilt.current = built?.value;
    if (prev && prev !== built?.value) releaseScanner(prev);
  }, [built]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `signature` stands in for the chain entry read through `chainRef`
  useEffect(() => {
    // Do not read `session.kind` here: a new dep would re-run the build and abort an open prompt.
    log.debug("effect tick", {
      isConnected: session.isConnected,
      hasLayer: !!session.layer,
    });
    const activeChain = chainRef.current;
    if (!session.isConnected || !session.layer || !session.accountKey || !activeChain) return;

    const ctrl = new AbortController();
    const accountKey = session.accountKey;
    const accountId = accountKey.toLowerCase();
    const layer = session.layer;
    const fromCache = getCachedNsk(accountKey) !== undefined;
    const t0 = performance.now();
    log.debug("building wallet", { kind: layer.kind, fromCache });

    const failWith = (message: string) =>
      setFailure({ chainId: activeChain.chainId, accountKey: accountId, value: message });
    let prepareTimer: ReturnType<typeof setTimeout> | undefined;
    const onKey = () => {
      if (ctrl.signal.aborted) return;
      setKeyResolvedFor(accountId);
      prepareTimer = setTimeout(() => failWith(PREPARE_TIMEOUT_MESSAGE), PREPARE_TIMEOUT_MS);
    };

    // Must register with `buildPool.run` synchronously (see `SharedWorkPool.run`).
    void buildPool
      .run(
        buildKey(activeChain.chainId, accountId),
        async () => {
          const buildWallet = await loadBuildWallet();
          return buildWallet(layer, activeChain, accountKey, onKey);
        },
        async (walletApi) => {
          if (ctrl.signal.aborted) return false;
          if (fromCache) {
            const remaining = MIN_RESUME_MS - (performance.now() - t0);
            if (remaining > 0) await waitWithAbort(remaining, ctrl.signal);
            if (ctrl.signal.aborted) return false;
          }
          // A build that outran its time limit has shown that error; it connects all the same.
          setFailure(undefined);
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
        failWith(userMessage(e));
      })
      .finally(() => clearTimeout(prepareTimer));

    return () => {
      ctrl.abort();
      clearTimeout(prepareTimer);
    };
  }, [session.isConnected, session.layer, session.accountKey, signature]);

  const hasCachedKey = useMemo(
    () => (session.accountKey ? getCachedNsk(session.accountKey) !== undefined : false),
    [session.accountKey],
  );

  const keyResolved = accountId !== undefined && keyResolvedFor === accountId;

  return { wallet, error, hasCachedKey, keyResolved };
}
