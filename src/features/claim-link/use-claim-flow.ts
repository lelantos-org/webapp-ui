import type { WalletApi } from "@lelantos-org/sdk";
import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import { type ChainEntry, findChain } from "@/config/chains";
import { useChainRegistry } from "@/features/chain/ChainProvider";
import {
  type ChainMismatch,
  chainMismatch,
  describeChainMismatch,
} from "@/features/claim-link/chain-guard";
import {
  buildEphemeralWallet,
  clearEphemeralStore,
  summarizeEphemeralNotes,
  sweepEphemeral,
} from "@/features/claim-link/claimLink";
import { readFragmentFromHash, scrubLocationHash } from "@/features/claim-link/fragment";
import { type Event, initial, type Phase, reduce } from "@/features/claim-link/phase-machine";
import { linkChainIdOf } from "@/features/claim-link/phase-presenter";
import { useWalletStore } from "@/features/eip1193/use-store";
import { useWallet } from "@/features/wallet";
import { releaseScanner } from "@/features/wallet/scanner";
import type { ConnectionBundle } from "@/features/wallet/use-connection";
import { useConnection } from "@/features/wallet/use-connection";
import { describeError } from "@/shared/lib/errors";
import { createLogger } from "@/shared/lib/logger";
import { toastError } from "@/shared/lib/toast";

const log = createLogger("claim:flow");

/// How deep to trial-decrypt when looking for the link's note. A claim link is
/// a fresh key with one deposit against it, so the note is near the tip; this
/// bounds a cold scan rather than sizing a wallet's history.
const SCAN_LIMIT = 500;

export interface ClaimFlow {
  phase: Phase;
  /// The chain the link names, once decoded and known to the registry. Also
  /// the source of the asset labels — the notes exist only there, so the
  /// active chain's token list would mislabel them.
  linkChain: ChainEntry | undefined;
  /// Set while the wallet is on a chain other than the link's. The scan and
  /// the sweep both wait for it to clear.
  mismatch: ChainMismatch | undefined;
  claim(asset: bigint): Promise<void>;
}

/// Read the link's notes into an ephemeral wallet.
///
/// Returns the event to dispatch rather than dispatching: the caller owns
/// whether a result still applies after an unmount, and this stays a plain
/// async function with one job.
async function scanForNotes(
  nskHex: string,
  bundle: ConnectionBundle,
  chain: ChainEntry,
): Promise<Event> {
  try {
    const eph = await buildEphemeralWallet(nskHex, bundle, chain);
    await eph.sync({ limit: SCAN_LIMIT });
    return { t: "load-success", eph, balances: summarizeEphemeralNotes(eph) };
  } catch (err) {
    log.error("ephemeral load failed", err);
    return { t: "load-failure", message: describeError(err) };
  }
}

/// Sweep one asset to the connected shielded address, clearing the ephemeral
/// note store behind it so a reload does not rescan a spent link.
async function sweepToWallet(
  phase: Extract<Phase, { kind: "ready" }>,
  destination: string,
  asset: bigint,
): Promise<Event> {
  try {
    const txHash = await sweepEphemeral(phase.eph, destination, asset);
    await clearEphemeralStore(phase.chainId, phase.nskHex).catch((err) => {
      // Cosmetic: the notes are spent on-chain either way.
      log.warn("clearing ephemeral store failed", err);
    });
    // The link is spent; nothing will scan with this wallet again.
    releaseScanner(phase.eph);
    return { t: "sweep-success", txHash };
  } catch (err) {
    log.error("sweep failed", err);
    return { t: "sweep-failure", message: describeError(err) };
  }
}

/// Owns the claim-flow phase machine and its side effects.
export function useClaimFlow(): ClaimFlow {
  const { wallet, status } = useWallet();
  const { bundle } = useConnection();
  const registry = useChainRegistry();
  const [phase, dispatch] = useReducer(reduce, initial);

  const linkChainId = linkChainIdOf(phase);
  const linkChain = useMemo(
    () => (linkChainId === undefined ? undefined : findChain(registry, linkChainId)),
    [registry, linkChainId],
  );

  // The wallet's own chain, not `useActiveChain*`: a network the deployment
  // does not serve leaves that undefined, and "somewhere unsupported" is
  // exactly the mismatch worth reporting here.
  const walletChainId = useWalletStore((s) => s.chainId);
  const mismatch = useMemo(
    () => chainMismatch(registry, linkChain, walletChainId),
    [registry, linkChain, walletChainId],
  );

  // The ephemeral wallet lives in reducer state, which React discards on
  // unmount along with the only reference to its scanner workers. Mirrored into
  // a ref so the teardown below can reach it.
  const ephRef = useRef<WalletApi | undefined>(undefined);
  useEffect(() => {
    ephRef.current = phase.kind === "ready" ? phase.eph : undefined;
  }, [phase]);

  // Results that arrive after the page is gone are dropped rather than
  // dispatched into an unmounted reducer.
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      releaseScanner(ephRef.current);
    };
  }, []);

  const dispatchIfMounted = useCallback((e: Event) => {
    if (mounted.current) dispatch(e);
  }, []);

  // Decode the bearer secret out of the URL, then scrub it from history.
  useEffect(() => {
    const read = readFragmentFromHash(window.location.hash);
    if (!read.ok) {
      if (read.error.kind === "missing") dispatch({ t: "fragment-missing" });
      else dispatch({ t: "fragment-bad", error: read.error.message });
      return;
    }
    dispatch({ t: "fragment-good", nskHex: read.value.nskHex, chainId: read.value.chainId });
    scrubLocationHash(window.location, window.history);
  }, []);

  // Scan, once, as soon as every precondition holds. `phase.kind` moving off
  // `need-wallet` is what keeps this to one run: `load-start` is only legal
  // from there, so the effect cannot re-enter while a scan is in flight.
  const scanning = useRef(false);
  useEffect(() => {
    if (phase.kind !== "need-wallet") return;
    if (status !== "ready" || !wallet || !bundle) return;
    // Checked before anything else runs, not just before the sweep. Scanning
    // first would spend a full sync only to end at a card asking for the
    // switch, and would list balances that cannot be claimed from where the
    // wallet currently is. Cleared, this effect re-runs and the scan starts.
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
    void scanForNotes(phase.nskHex, bundle, linkChain).then((e) => {
      scanning.current = false;
      // A scan completing after unmount has still built a wallet holding live
      // workers. The reducer never receives it, so it is released here.
      if (!mounted.current && e.t === "load-success") releaseScanner(e.eph);
      dispatchIfMounted(e);
    });
  }, [phase, status, wallet, bundle, linkChain, mismatch, dispatchIfMounted]);

  const claim = useCallback(
    async (asset: bigint): Promise<void> => {
      if (phase.kind !== "ready" || !wallet) return;
      // The page disables the button on a mismatch; this is what makes that a
      // rule rather than a hint — the wallet can be switched away between
      // render and click, and the spend would go to the wrong network.
      if (mismatch) {
        toastError("wrong network", new Error(describeChainMismatch(mismatch)));
        return;
      }

      const row = phase.balances.find((b) => b.asset === asset);
      if (!row) return;

      dispatch({ t: "sweep-start", asset, amount: row.amount });
      dispatchIfMounted(await sweepToWallet(phase, wallet.address, asset));
    },
    [phase, wallet, mismatch, dispatchIfMounted],
  );

  return { phase, linkChain, mismatch, claim };
}
