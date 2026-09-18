// Inspecting and sweeping one agent's wallet, on demand.
//
// Reading an agent's balance means connecting a wallet over its key and scanning
// — a scanner, a note store, a sync. That is far too much to do for every row of
// a list on mount, so it happens only when the operator asks, and the wallet is
// held open afterwards because sweeping needs the same one.
//
// Sweeping is what revoking *is*. The agent keeps its copy of the key and can be
// funded again by anyone who knows the address; what the sweep takes away is the
// balance, which is the only control an operator has over a key someone else
// holds.

import type { WalletApi } from "@lelantos-org/sdk";
import { useCallback, useEffect, useRef, useState } from "react";
import { findChain } from "@/config/chains";
import { markAgentRevoked, type StoredAgent } from "@/features/agents";
import { useChainRegistry } from "@/features/chain";
import {
  buildEphemeralWallet,
  type EphemeralBalance,
  summarizeEphemeralNotes,
  sweepEphemeral,
} from "@/features/claim-links";
import { useSession, useWallet } from "@/features/wallet";
import { useIsMounted } from "@/shared/hooks/use-is-mounted";
import { reportError } from "@/shared/lib/errors";
import { createLogger } from "@/shared/lib/logger";

const log = createLogger("agents:wallet");

/// Cap on one scan, mirroring the claim flow's.
const SCAN_LIMIT = 500;

export interface SweepFailure {
  asset: bigint;
  message: string;
}

export type AgentWalletState =
  | { kind: "idle" }
  | { kind: "busy"; what: "inspecting" }
  /// One transfer per asset, so the operator can see how far along a multi-asset sweep is.
  | { kind: "busy"; what: "sweeping"; done: number; total: number }
  | { kind: "ready"; balances: EphemeralBalance[] }
  | { kind: "swept"; txHashes: string[]; failed: SweepFailure[]; emptied: boolean }
  | { kind: "error"; message: string };

export interface AgentWallet {
  state: AgentWalletState;
  /// Connect over the agent's key and read its unspent notes.
  inspect(): Promise<void>;
  /// Send everything of one asset back to the operator's wallet.
  sweep(asset: bigint): Promise<void>;
  /// Sweep every asset the last inspection found, one transfer each.
  sweepAll(assets: readonly bigint[]): Promise<void>;
}

export function useAgentWallet(agent: StoredAgent): AgentWallet {
  const [state, setState] = useState<AgentWalletState>({ kind: "idle" });
  const { wallet } = useWallet();
  const { layer } = useSession();
  const registry = useChainRegistry();
  const mounted = useIsMounted();
  const eph = useRef<WalletApi | undefined>(undefined);

  // The scanner this holds is a worker; leaving one per inspected agent behind
  // would outlive the screen.
  useEffect(() => {
    return () => {
      void eph.current?.dispose().catch((err) => log.warn("disposing agent wallet failed", err));
      eph.current = undefined;
    };
  }, []);

  const open = useCallback(async (): Promise<WalletApi> => {
    if (eph.current) return eph.current;
    const chain = findChain(registry, BigInt(agent.chainId));
    if (!chain) throw new Error(`no chain ${agent.chainId} in the registry`);
    if (!layer) throw new Error("connect a wallet first");

    const w = await buildEphemeralWallet(agent.nsk, layer, chain);
    eph.current = w;
    return w;
  }, [agent.chainId, agent.nsk, layer, registry]);

  const inspect = useCallback(async () => {
    setState({ kind: "busy", what: "inspecting" });
    try {
      const w = await open();
      await w.sync({ scope: "notes", pageSize: SCAN_LIMIT });
      const balances = await summarizeEphemeralNotes(w);
      if (mounted()) setState({ kind: "ready", balances });
    } catch (err) {
      if (mounted())
        setState({ kind: "error", message: reportError("agents:inspect", err).message });
    }
  }, [mounted, open]);

  /// One transfer per asset, then a rescan to decide whether anything is left.
  const sweepAll = useCallback(
    async (assets: readonly bigint[]) => {
      if (!wallet) {
        setState({ kind: "error", message: "connect a wallet to sweep into" });
        return;
      }
      if (assets.length === 0) return;

      setState({ kind: "busy", what: "sweeping", done: 0, total: assets.length });
      const txHashes: string[] = [];
      const failed: SweepFailure[] = [];

      for (const [i, asset] of assets.entries()) {
        try {
          txHashes.push(await sweepEphemeral(await open(), wallet.address, asset));
        } catch (err) {
          // One asset failing must not abandon the rest: each is its own
          // transfer, and the others are still recoverable.
          failed.push({ asset, message: reportError("agents:sweep", err).message });
        }
        if (mounted()) {
          setState({ kind: "busy", what: "sweeping", done: i + 1, total: assets.length });
        }
      }

      // Read the balance back rather than inferring it. Marking an agent revoked
      // while it still holds a second asset would misreport what it can spend —
      // and a sweep of one asset says nothing about the others.
      let emptied = false;
      try {
        const w = await open();
        await w.sync({ scope: "notes", pageSize: SCAN_LIMIT });
        emptied = (await summarizeEphemeralNotes(w)).every((b) => b.amount === 0n);
      } catch (err) {
        log.warn("could not confirm the agent is empty", err);
      }
      if (emptied) markAgentRevoked(agent.id);

      if (mounted()) setState({ kind: "swept", txHashes, failed, emptied });
    },
    [agent.id, mounted, open, wallet],
  );

  const sweep = useCallback((asset: bigint) => sweepAll([asset]), [sweepAll]);

  return { state, inspect, sweep, sweepAll };
}
