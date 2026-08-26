import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import { type ChainEntry, findChain } from "@/config/chains";
import { useChainRegistry } from "@/features/chain";
import { currentWalletChainId, useWalletStore } from "@/features/eip1193";
import type { ConnectionBundle } from "@/features/wallet";
import { useConnection, useScannerOwner, useWallet } from "@/features/wallet";
import { describeError } from "@/shared/lib/errors";
import { createLogger } from "@/shared/lib/logger";
import { toastError } from "@/shared/lib/toast";
import { useIsMounted } from "@/shared/lib/use-is-mounted";
import { type ChainMismatch, chainMismatch, describeChainMismatch } from "./chain-guard";
import {
  buildEphemeralWallet,
  clearEphemeralStore,
  summarizeEphemeralNotes,
  sweepEphemeral,
} from "./ephemeral-wallet";
import { readFragmentFromHash, scrubLocationHash } from "./fragment";
import { type Event, initial, type Phase, reduce } from "./phase-machine";
import { linkChainIdOf } from "./phase-presenter";

const log = createLogger("claim:flow");

/// How deep to trial-decrypt when looking for the link's note. A claim link is a
/// fresh key with one deposit against it, so the note is near the tip; this
/// bounds a cold scan rather than sizing a wallet's history.
const SCAN_LIMIT = 500;

export interface ClaimFlow {
  phase: Phase;
  /// The chain the link names, once decoded and known to the registry. Also the
  /// source of the asset labels: the notes exist only there, so the active
  /// chain's token list would mislabel them.
  linkChain: ChainEntry | undefined;
  /// Set while the wallet is on a chain other than the link's. The scan and
  /// the sweep both wait for it to clear.
  mismatch: ChainMismatch | undefined;
  claim(asset: bigint): Promise<void>;
  /// Re-attempt after a failure. Required because `error` would otherwise be
  /// terminal: the fragment is scrubbed from the URL by then, so a reload cannot
  /// recover from a transient RPC failure during the scan.
  retry(): void;
}

/// Read the link's notes into an ephemeral wallet.
///
/// Returns the event to dispatch rather than dispatching it, leaving the caller
/// to decide whether a result still applies after an unmount.
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
///
/// Does not dispose the wallet; the caller owns it (see `useScannerOwner`).
/// Disposing in two places risks stranding a worker pool on the failure path.
async function sweepToWallet(
  phase: Extract<Phase, { kind: "ready" }>,
  destination: string,
  asset: bigint,
): Promise<Event> {
  try {
    const txHash = await sweepEphemeral(phase.eph, destination, asset);
    await clearEphemeralStore(phase.chainId, phase.nskHex).catch((err) => {
      // Cosmetic: the notes are spent on-chain regardless.
      log.warn("clearing ephemeral store failed", err);
    });
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

  // The wallet's own chain rather than `useActiveChain*`: a network the
  // deployment does not serve leaves the latter undefined, and an unsupported
  // network is precisely the mismatch worth reporting here.
  const walletChainId = useWalletStore((s) => s.chainId);
  const mismatch = useMemo(
    () => chainMismatch(registry, linkChain, walletChainId),
    [registry, linkChain, walletChainId],
  );

  // The ephemeral wallet lives in reducer state, which React discards on unmount
  // along with the only reference to its scanner workers. The owner holds it
  // independently of the phase, so it survives phases that drop `eph` — notably
  // the `error` following a failed sweep — and is released exactly once.
  const scanner = useScannerOwner();

  // Results that arrive after the page is gone are dropped rather than
  // dispatched into an unmounted reducer.
  const isMounted = useIsMounted();

  const dispatchIfMounted = useCallback(
    (e: Event) => {
      if (isMounted()) dispatch(e);
    },
    [isMounted],
  );

  // Decode the bearer secret out of the URL, then scrub it from history.
  //
  // Scrubbed unconditionally, before the result is inspected.
  // `parseClaimFragment` rejects a malformed chain prefix before looking at the
  // nsk, so an invalid link often still carries an intact 64-hex bearer key —
  // which must not be left in the address bar on an error screen.
  useEffect(() => {
    const read = readFragmentFromHash(window.location.hash);
    scrubLocationHash(window.location, window.history);
    if (!read.ok) {
      if (read.error.kind === "missing") dispatch({ t: "fragment-missing" });
      else dispatch({ t: "fragment-bad", error: read.error.message });
      return;
    }
    dispatch({ t: "fragment-good", nskHex: read.value.nskHex, chainId: read.value.chainId });
  }, []);

  // Scan once, as soon as every precondition holds. `phase.kind` moving off
  // `need-wallet` bounds this to one run: `load-start` is legal only from there,
  // so the effect cannot re-enter while a scan is in flight.
  const scanning = useRef(false);
  useEffect(() => {
    if (phase.kind !== "need-wallet") return;
    if (status !== "ready" || !wallet || !bundle) return;
    // Checked before anything else runs, not only before the sweep. Scanning
    // first would spend a full sync to arrive at a card asking for the switch,
    // and would list balances that cannot be claimed from the wallet's current
    // chain. Once cleared, this effect re-runs and the scan starts.
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
      if (e.t === "load-success") {
        // A scan landing after unmount has still built a wallet holding live
        // workers that the reducer will never receive, so it is discarded rather
        // than held.
        if (isMounted()) scanner.hold(e.eph);
        else scanner.discard(e.eph);
      }
      dispatchIfMounted(e);
    });
  }, [phase, status, wallet, bundle, linkChain, mismatch, dispatchIfMounted, isMounted, scanner]);

  const claim = useCallback(
    async (asset: bigint): Promise<void> => {
      if (phase.kind !== "ready" || !wallet) return;
      // The page disables the button on a mismatch; this enforces it, since the
      // wallet can be switched between render and click and the spend would then
      // go to the wrong network.
      if (mismatch) {
        toastError("wrong network", new Error(describeChainMismatch(mismatch)));
        return;
      }

      const row = phase.balances.find((b) => b.asset === asset);
      if (!row) return;

      dispatch({ t: "sweep-start", asset, amount: row.amount });
      // Re-read the wallet's chain immediately before the spend.
      // `sweepEphemeral` generates a proof and submits to the relayer, taking
      // seconds; a wallet-initiated `chainChanged` in that window — a prompt
      // from another tab, or an auto-switch — would otherwise place the spend on
      // a chain the notes do not live on.
      if (currentWalletChainId() !== phase.chainId) {
        toastError("wrong network", new Error("the wallet moved to another network"));
        dispatchIfMounted({ t: "sweep-failure", message: "the wallet moved to another network" });
        return;
      }
      const outcome = await sweepToWallet(phase, wallet.address, asset);
      // Spent or failed, the link is finished either way: nothing will scan with
      // this wallet again, and the next phase may not carry `eph`.
      scanner.release();
      dispatchIfMounted(outcome);
    },
    [phase, wallet, mismatch, dispatchIfMounted, scanner],
  );

  /// Re-attempt a claim that failed; see the `retry` transition.
  const retry = useCallback(() => {
    scanning.current = false;
    dispatch({ t: "retry" });
  }, []);

  return { phase, linkChain, mismatch, claim, retry };
}
