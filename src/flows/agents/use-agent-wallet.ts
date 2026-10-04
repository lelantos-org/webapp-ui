// Inspects and sweeps one agent's wallet on demand. A balance read connects a
// wallet over the agent's key and scans; the sweep reuses that wallet.
// Sweeping is the only revocation: the agent keeps its key and can be funded again.

import type { WalletApi } from "@lelantos-org/sdk";
import { useCallback, useEffect, useRef, useState } from "react";
import { findChain } from "@/config/chains";
import { markAgentRevoked, type StoredAgent } from "@/features/agents";
import { useChainRegistry } from "@/features/chain";
import {
  buildEphemeralWallet,
  type EphemeralBalance,
  scanEphemeralBalances,
  sweepEphemeral,
} from "@/features/claim-links";
import { useSession, useWallet } from "@/features/wallet";
import { useIsMounted } from "@/shared/hooks/use-is-mounted";
import { reportError } from "@/shared/lib/errors";
import { createLogger } from "@/shared/lib/logger";

const log = createLogger("agents:wallet");

export interface SweepFailure {
  asset: bigint;
  message: string;
}

export type AgentWalletState =
  | { kind: "idle" }
  | { kind: "busy"; what: "inspecting" }
  /// `done` of `total` per-asset transfers.
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

  // The wallet's scanner is a worker; dispose it on unmount.
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
      const balances = await scanEphemeralBalances(w);
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
          // A failed asset does not stop the rest; each is its own transfer.
          failed.push({ asset, message: reportError("agents:sweep", err).message });
        }
        if (mounted()) {
          setState({ kind: "busy", what: "sweeping", done: i + 1, total: assets.length });
        }
      }

      // Rescan before marking the agent revoked: it may still hold other assets.
      let emptied = false;
      try {
        const w = await open();
        emptied = (await scanEphemeralBalances(w)).every((b) => b.amount === 0n);
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
