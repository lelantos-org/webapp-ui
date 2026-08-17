import { useEffect, useMemo, useReducer, useRef } from "react";
import { findChain } from "@/config/chains";
import { useChainRegistry } from "@/features/chain/ChainProvider";
import {
  type ChainMismatch,
  claimChainMismatch,
  describeChainMismatch,
} from "@/features/claim-link/chain-guard";
import {
  buildEphemeralWallet,
  clearEphemeralStore,
  summarizeEphemeralNotes,
  sweepEphemeral,
} from "@/features/claim-link/claimLink";
import { readFragmentFromHash, scrubLocationHash } from "@/features/claim-link/fragment";
import { initial, type Phase, reduce } from "@/features/claim-link/phase-machine";
import { linkChainIdOf } from "@/features/claim-link/phase-presenter";
import { useWalletStore } from "@/features/eip1193/use-store";
import { useWallet } from "@/features/wallet";
import { useConnection } from "@/features/wallet/use-connection";
import { describeError } from "@/shared/lib/errors";
import { createLogger } from "@/shared/lib/logger";
import { toastError } from "@/shared/lib/toast";

const log = createLogger("claim:flow");

export interface ClaimFlow {
  phase: Phase;
  /// Set while the wallet is on a chain other than the link's. The sweep is
  /// refused until it clears, and the page offers the switch.
  mismatch: ChainMismatch | undefined;
  claim(asset: bigint): Promise<void>;
}

/// Owns the claim-flow phase machine and its side effects.
export function useClaimFlow(): ClaimFlow {
  const { wallet, status } = useWallet();
  const { bundle } = useConnection();
  const registry = useChainRegistry();
  const [phase, dispatch] = useReducer(reduce, initial);

  // The wallet's own chain, not `useActiveChain*`: a network the deployment
  // does not serve leaves that undefined, and "somewhere unsupported" is
  // exactly the mismatch worth reporting here.
  const walletChainId = useWalletStore((s) => s.chainId);
  const mismatch = useMemo(
    () => claimChainMismatch(registry, linkChainIdOf(phase), walletChainId),
    [registry, phase, walletChainId],
  );

  const mounted = useRef(true);
  const startedFor = useRef<string>();

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

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

  useEffect(() => {
    if (phase.kind !== "need-wallet") return;
    if (status !== "ready" || !wallet || !bundle) return;
    // The network is checked before anything else runs, not just before the
    // sweep. Scanning first would spend a full sync only to end at a card
    // asking for the switch — and would present balances that cannot be
    // claimed from where the wallet currently is. Cleared, this effect runs
    // again on the `mismatch` dependency and the scan starts on its own.
    if (mismatch) return;
    if (startedFor.current === phase.nskHex) return;
    startedFor.current = phase.nskHex;

    const nskHex = phase.nskHex;
    // The link's chain, not the app's. The notes live in one specific pool,
    // and building against whatever chain the user happens to be viewing
    // would scan the wrong one and report an empty, already-claimed-looking
    // link.
    const linkChain = findChain(registry, phase.chainId);
    if (!linkChain) {
      dispatch({
        t: "load-failure",
        message: `this link is for chain ${phase.chainId}, which this app does not serve`,
      });
      return;
    }

    dispatch({ t: "load-start" });
    void (async () => {
      try {
        const eph = await buildEphemeralWallet(nskHex, bundle, linkChain);
        await eph.sync({ limit: 500 });
        if (!mounted.current) return;
        dispatch({ t: "load-success", eph, balances: summarizeEphemeralNotes(eph) });
      } catch (err) {
        log.error("ephemeral load failed", err);
        if (!mounted.current) return;
        dispatch({ t: "load-failure", message: describeError(err) });
      }
    })();
  }, [phase, status, wallet, bundle, registry, mismatch]);

  async function claim(asset: bigint): Promise<void> {
    if (phase.kind !== "ready" || !wallet) return;
    // The page disables the button on a mismatch; this is the guard that
    // makes that a rule rather than a hint — the wallet can be switched away
    // between render and click, and the spend would go to the wrong network.
    if (mismatch) {
      toastError("wrong network", new Error(describeChainMismatch(mismatch)));
      return;
    }
    const { eph, nskHex, chainId, balances } = phase;
    const row = balances.find((b) => b.asset === asset);
    if (!row) return;
    dispatch({ t: "sweep-start", asset, amount: row.amount });
    try {
      const txHash = await sweepEphemeral(eph, wallet.address, asset);
      await clearEphemeralStore(chainId, nskHex).catch(() => {});
      if (!mounted.current) return;
      dispatch({ t: "sweep-success", txHash });
    } catch (err) {
      log.error("sweep failed", err);
      if (!mounted.current) return;
      dispatch({ t: "sweep-failure", message: describeError(err) });
    }
  }

  return { phase, mismatch, claim };
}
