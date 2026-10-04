import type { SpendPhase } from "@lelantos-org/sdk";
import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import { type ChainEntry, findChain } from "@/config/chains";
import { useChainRegistry, useEarlyChainRegistry } from "@/features/chain";
import {
  buildEphemeralWallet,
  clearEphemeralStore,
  readFragmentFromHash,
  scanEphemeralBalances,
  scrubLocationHash,
  sweepEphemeral,
} from "@/features/claim-links";
import { spendPhases, spendSteps } from "@/features/ops";
import { type ProgressView, useTxProgress } from "@/features/tx";
import { preloadProverWorker, useScannerOwner, useWallet } from "@/features/wallet";
import { currentWalletChainId, eip1193Store } from "@/features/wallet-kinds";
import { useIsMounted } from "@/shared/hooks/use-is-mounted";
import { reportError } from "@/shared/lib/errors";
import { useStore } from "@/shared/lib/external-store";
import { createLogger } from "@/shared/lib/logger";
import { savesData } from "@/shared/lib/platform";
import { toastError } from "@/shared/lib/toast";
import { type ChainMismatch, chainMismatch, describeChainMismatch } from "./chain-guard";
import { balancesAfter, type Event, initial, type Phase, reduce } from "./phase-machine";
import { linkChainIdOf } from "./phase-presenter";

const log = createLogger("claim:flow");

export interface ClaimFlow {
  phase: Phase;
  /// The link's chain, once decoded and known; the source of asset labels.
  linkChain: ChainEntry | undefined;
  /// Set while the wallet is on another chain; the sweep waits for it to clear.
  mismatch: ChainMismatch | undefined;
  /// A wallet is connected, so there is somewhere to claim to. Looking at the link needs none.
  connected: boolean;
  /// The sweep's stepper, while `phase` is `sweeping`.
  progress: ProgressView;
  claim(asset: bigint): Promise<void>;
  /// Look again at a link that held nothing: the sender's transfer may have landed since.
  rescan(): void;
  /// Back to what the link still holds after a claim.
  claimRest(): void;
  /// Re-attempt after a failure; a reload cannot, as the fragment is already scrubbed.
  retry(): void;
}

/// Reads the link's notes through a read-only wallet over its key: enough to look, and to sweep,
/// since a shielded transfer goes through the relayer.
async function scanForNotes(nskHex: string, chain: ChainEntry): Promise<Event> {
  try {
    const eph = await buildEphemeralWallet(nskHex, undefined, chain);
    return { t: "load-success", eph, balances: await scanEphemeralBalances(eph) };
  } catch (err) {
    return { t: "load-failure", message: reportError("claim:load", err).message };
  }
}

/// Sweeps `asset`; `last` also drops the link's local store, which a later claim still needs.
async function sweepToWallet(
  phase: Extract<Phase, { kind: "ready" }>,
  destination: string,
  asset: bigint,
  last: boolean,
  onPhase: (phase: SpendPhase) => void,
): Promise<Event> {
  try {
    const txHash = await sweepEphemeral(phase.eph, destination, asset, onPhase);
    if (last) {
      await clearEphemeralStore(phase.chainId, phase.nskHex).catch((err) => {
        log.warn("clearing ephemeral store failed", err);
      });
    }
    return { t: "sweep-success", txHash };
  } catch (err) {
    return { t: "sweep-failure", message: reportError("claim:sweep", err).message };
  }
}

/// Owns the claim-flow phase machine and its side effects.
export function useClaimFlow(): ClaimFlow {
  const { wallet, status } = useWallet();
  const connected = status === "ready" && !!wallet;
  const registry = useChainRegistry();
  const [phase, dispatch] = useReducer(reduce, initial);
  const progress = useTxProgress();

  const linkChainId = linkChainIdOf(phase);
  // A recipient has no wallet connected yet, and the registry is otherwise fetched on connect.
  const networks = useEarlyChainRegistry(linkChainId !== undefined);
  const linkChain = useMemo(
    () => (linkChainId === undefined ? undefined : findChain(registry, linkChainId)),
    [registry, linkChainId],
  );

  const walletChainId = useStore(eip1193Store, (s) => s.chainId);
  const mismatch = useMemo(
    () => chainMismatch(registry, linkChain, walletChainId),
    [registry, linkChain, walletChainId],
  );

  const scanner = useScannerOwner();
  const isMounted = useIsMounted();
  const dispatchIfMounted = useCallback(
    (e: Event) => {
      if (isMounted()) dispatch(e);
    },
    [isMounted],
  );

  useEffect(() => {
    const read = readFragmentFromHash(window.location.hash);
    // Scrub before inspecting: a malformed link can still carry an intact bearer key.
    scrubLocationHash(window.location, window.history);
    if (!read.ok) {
      if (read.error.kind === "missing") dispatch({ t: "fragment-missing" });
      else dispatch({ t: "fragment-bad", error: read.error.message });
      return;
    }
    dispatch({ t: "fragment-good", nskHex: read.value.nskHex, chainId: read.value.chainId });
  }, []);

  const scanning = useRef(false);
  useEffect(() => {
    if (phase.kind !== "need-wallet" || scanning.current) return;

    if (!linkChain) {
      // A cached registry may predate the link's chain: judge only the network copy.
      if (networks.failed) {
        dispatch({ t: "load-failure", message: "Could not load the networks this app serves." });
      } else if (networks.loaded) {
        dispatch({
          t: "load-failure",
          message: `this link is for chain ${phase.chainId}, which this app does not serve`,
        });
      }
      return;
    }

    scanning.current = true;
    dispatch({ t: "load-start" });
    void scanForNotes(phase.nskHex, linkChain).then((e) => {
      scanning.current = false;
      if (e.t === "load-success") {
        // A late scan's wallet still holds live workers: discard it or they leak.
        if (isMounted()) scanner.hold(e.eph);
        else scanner.discard(e.eph);
        // There is something to claim: have the prover ready by the time a wallet is connected.
        if (e.balances.length > 0 && !savesData()) void preloadProverWorker();
      }
      dispatchIfMounted(e);
    });
  }, [phase, linkChain, networks.failed, networks.loaded, dispatchIfMounted, isMounted, scanner]);

  const claim = useCallback(
    async (asset: bigint): Promise<void> => {
      if (phase.kind !== "ready" || !wallet) return;
      if (mismatch) {
        toastError("wrong network", new Error(describeChainMismatch(mismatch)));
        return;
      }

      const row = phase.balances.find((b) => b.asset === asset);
      if (!row) return;

      dispatch({ t: "sweep-start", asset, amount: row.amount });
      progress.start(spendSteps("transfer"));
      // Re-read the chain right before spending: the wallet may have switched since render.
      // `undefined` is a session with no EVM chain of its own (passkey), so nothing to check.
      const walletChainId = currentWalletChainId();
      if (walletChainId !== undefined && walletChainId !== phase.chainId) {
        toastError("wrong network", new Error("the wallet moved to another network"));
        dispatchIfMounted({ t: "sweep-failure", message: "the wallet moved to another network" });
        return;
      }
      const last = balancesAfter(phase.balances, asset).length === 0;
      const outcome = await sweepToWallet(
        phase,
        wallet.address,
        asset,
        last,
        spendPhases(progress.set),
      );
      // The scanner stays held while the link has more to claim, or after a failed sweep.
      if (last || outcome.t !== "sweep-success") scanner.release();
      dispatchIfMounted(outcome);
    },
    [phase, wallet, mismatch, dispatchIfMounted, scanner, progress.start, progress.set],
  );

  const retry = useCallback(() => {
    scanning.current = false;
    dispatch({ t: "retry" });
  }, []);

  const claimRest = useCallback(() => dispatch({ t: "claim-rest" }), []);

  const rescan = useCallback(() => {
    scanner.release();
    dispatch({ t: "rescan" });
  }, [scanner]);

  return { phase, linkChain, mismatch, connected, progress, claim, rescan, claimRest, retry };
}
