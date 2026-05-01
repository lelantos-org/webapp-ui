import { useEffect, useReducer, useRef } from "react";
import {
  buildEphemeralWallet,
  clearEphemeralStore,
  summarizeEphemeralNotes,
  sweepEphemeral,
} from "@/features/claim-link/claimLink";
import { readFragmentFromHash, scrubLocationHash } from "@/features/claim-link/fragment";
import { initial, type Phase, reduce } from "@/features/claim-link/phase-machine";
import { useWallet } from "@/features/wallet";
import { useConnection } from "@/features/wallet/use-connection";
import { describeError } from "@/shared/lib/errors";
import { createLogger } from "@/shared/lib/logger";

const log = createLogger("claim:flow");

export interface ClaimFlow {
  phase: Phase;
  claim(asset: bigint): Promise<void>;
}

/// Owns the claim-flow phase machine and its side effects.
export function useClaimFlow(): ClaimFlow {
  const { wallet, status } = useWallet();
  const { bundle } = useConnection();
  const [phase, dispatch] = useReducer(reduce, initial);

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
    dispatch({ t: "fragment-good", nskHex: read.value.hex });
    scrubLocationHash(window.location, window.history);
  }, []);

  useEffect(() => {
    if (phase.kind !== "need-wallet") return;
    if (status !== "ready" || !wallet || !bundle) return;
    if (startedFor.current === phase.nskHex) return;
    startedFor.current = phase.nskHex;

    const nskHex = phase.nskHex;
    dispatch({ t: "load-start" });
    void (async () => {
      try {
        const eph = await buildEphemeralWallet(nskHex, bundle);
        await eph.sync({ limit: 500 });
        if (!mounted.current) return;
        dispatch({ t: "load-success", eph, balances: summarizeEphemeralNotes(eph) });
      } catch (err) {
        log.error("ephemeral load failed", err);
        if (!mounted.current) return;
        dispatch({ t: "load-failure", message: describeError(err) });
      }
    })();
  }, [phase, status, wallet, bundle]);

  async function claim(asset: bigint): Promise<void> {
    if (phase.kind !== "ready" || !wallet) return;
    const { eph, nskHex, balances } = phase;
    const row = balances.find((b) => b.asset === asset);
    if (!row) return;
    dispatch({ t: "sweep-start", asset, amount: row.amount });
    try {
      const txHash = await sweepEphemeral(eph, wallet.address, asset);
      await clearEphemeralStore(nskHex).catch(() => {});
      if (!mounted.current) return;
      dispatch({ t: "sweep-success", txHash });
    } catch (err) {
      log.error("sweep failed", err);
      if (!mounted.current) return;
      dispatch({ t: "sweep-failure", message: describeError(err) });
    }
  }

  return { phase, claim };
}
