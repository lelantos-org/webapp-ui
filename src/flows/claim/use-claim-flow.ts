import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import { type ChainEntry, findChain } from "@/config/chains";
import { useChainRegistry } from "@/features/chain";
import {
  buildEphemeralWallet,
  clearEphemeralStore,
  readFragmentFromHash,
  scrubLocationHash,
  summarizeEphemeralNotes,
  sweepEphemeral,
} from "@/features/claim-links";
import { useScannerOwner, useSession, useWallet } from "@/features/wallet";
import { type ChainLayerSpec, currentWalletChainId, eip1193Store } from "@/features/wallet-kinds";
import { useIsMounted } from "@/shared/hooks/use-is-mounted";
import { reportError } from "@/shared/lib/errors";
import { useStore } from "@/shared/lib/external-store";
import { createLogger } from "@/shared/lib/logger";
import { toastError } from "@/shared/lib/toast";
import { type ChainMismatch, chainMismatch, describeChainMismatch } from "./chain-guard";
import { type Event, initial, type Phase, reduce } from "./phase-machine";
import { linkChainIdOf } from "./phase-presenter";

const log = createLogger("claim:flow");

const SCAN_LIMIT = 500;

export interface ClaimFlow {
  phase: Phase;
  /// The link's chain, once decoded and known; the source of asset labels.
  linkChain: ChainEntry | undefined;
  /// Set while the wallet is on another chain; scan and sweep wait for it to clear.
  mismatch: ChainMismatch | undefined;
  claim(asset: bigint): Promise<void>;
  /// Re-attempt after a failure; a reload cannot, as the fragment is already scrubbed.
  retry(): void;
}

async function scanForNotes(
  nskHex: string,
  layer: ChainLayerSpec,
  chain: ChainEntry,
): Promise<Event> {
  try {
    const eph = await buildEphemeralWallet(nskHex, layer, chain);
    await eph.sync({ scope: "notes", pageSize: SCAN_LIMIT });
    return { t: "load-success", eph, balances: await summarizeEphemeralNotes(eph) };
  } catch (err) {
    return { t: "load-failure", message: reportError("claim:load", err).message };
  }
}

async function sweepToWallet(
  phase: Extract<Phase, { kind: "ready" }>,
  destination: string,
  asset: bigint,
): Promise<Event> {
  try {
    const txHash = await sweepEphemeral(phase.eph, destination, asset);
    await clearEphemeralStore(phase.chainId, phase.nskHex).catch((err) => {
      log.warn("clearing ephemeral store failed", err);
    });
    return { t: "sweep-success", txHash };
  } catch (err) {
    return { t: "sweep-failure", message: reportError("claim:sweep", err).message };
  }
}

/// Owns the claim-flow phase machine and its side effects.
export function useClaimFlow(): ClaimFlow {
  const { wallet, status } = useWallet();
  const { layer } = useSession();
  const registry = useChainRegistry();
  const [phase, dispatch] = useReducer(reduce, initial);

  const linkChainId = linkChainIdOf(phase);
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
    if (phase.kind !== "need-wallet") return;
    if (status !== "ready" || !wallet || !layer) return;
    if (mismatch) return;
    if (scanning.current) return;

    if (!linkChain) {
      dispatch({
        t: "load-failure",
        message: `this link is for chain ${phase.chainId}, which this app does not serve`,
      });
      return;
    }

    scanning.current = true;
    dispatch({ t: "load-start" });
    void scanForNotes(phase.nskHex, layer, linkChain).then((e) => {
      scanning.current = false;
      if (e.t === "load-success") {
        // A late scan's wallet still holds live workers: discard it or they leak.
        if (isMounted()) scanner.hold(e.eph);
        else scanner.discard(e.eph);
      }
      dispatchIfMounted(e);
    });
  }, [phase, status, wallet, layer, linkChain, mismatch, dispatchIfMounted, isMounted, scanner]);

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
      // Re-read the chain right before spending: the wallet may have switched since render.
      if (currentWalletChainId() !== phase.chainId) {
        toastError("wrong network", new Error("the wallet moved to another network"));
        dispatchIfMounted({ t: "sweep-failure", message: "the wallet moved to another network" });
        return;
      }
      const outcome = await sweepToWallet(phase, wallet.address, asset);
      scanner.release();
      dispatchIfMounted(outcome);
    },
    [phase, wallet, mismatch, dispatchIfMounted, scanner],
  );

  const retry = useCallback(() => {
    scanning.current = false;
    dispatch({ t: "retry" });
  }, []);

  return { phase, linkChain, mismatch, claim, retry };
}
