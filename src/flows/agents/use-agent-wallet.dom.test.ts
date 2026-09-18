// Sweeping is how an operator revokes an agent, and "revoked" is a claim about
// the whole wallet. These pin the rule that the claim is only made once the
// wallet is actually empty — an agent holding a second token is not revoked
// because the first one was swept.

import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StoredAgent } from "@/features/agents";

const markAgentRevoked = vi.fn((_id: string) => undefined);
const sweepEphemeral = vi.fn(async (_eph: unknown, _to: string, _asset: bigint) => "0xswept");
/// What the wallet reports on each successive scan.
let scans: { asset: bigint; amount: bigint; notes: number }[][] = [];

vi.mock("@/features/agents", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/agents")>()),
  markAgentRevoked: (id: string) => markAgentRevoked(id),
}));

vi.mock("@/features/claim-links", () => ({
  buildEphemeralWallet: async () => ({
    sync: async () => undefined,
    dispose: async () => undefined,
  }),
  summarizeEphemeralNotes: async () => scans.shift() ?? [],
  sweepEphemeral: (eph: unknown, to: string, asset: bigint) => sweepEphemeral(eph, to, asset),
}));

vi.mock("@/features/chain", () => ({ useChainRegistry: () => [{ chainId: 31337n }] }));
vi.mock("@/config/chains", () => ({ findChain: () => ({ chainId: 31337n }) }));
vi.mock("@/features/wallet", () => ({
  useSession: () => ({ layer: { kind: "eip1193" } }),
  useWallet: () => ({ wallet: { address: "lelantos1me" } }),
}));

const { useAgentWallet } = await import("./use-agent-wallet");

const AGENT: StoredAgent = {
  id: "a1",
  label: "bot",
  chainId: "31337",
  address: "lelantos1agent",
  nsk: "0xdead",
  createdAt: 0,
};

beforeEach(() => {
  markAgentRevoked.mockClear();
  sweepEphemeral.mockClear();
  sweepEphemeral.mockImplementation(async () => "0xswept");
  scans = [];
});

describe("useAgentWallet", () => {
  it("does not revoke when another asset is still held", async () => {
    // Sweep USDC; the rescan still finds WETH.
    scans = [[{ asset: 2n, amount: 5n, notes: 1 }]];
    const { result } = renderHook(() => useAgentWallet(AGENT));

    await act(async () => {
      await result.current.sweep(1n);
    });

    expect(sweepEphemeral).toHaveBeenCalledTimes(1);
    expect(markAgentRevoked).not.toHaveBeenCalled();
    await waitFor(() => expect(result.current.state.kind).toBe("swept"));
    if (result.current.state.kind === "swept") {
      expect(result.current.state.emptied).toBe(false);
    }
  });

  it("revokes once the rescan finds nothing left", async () => {
    scans = [[]];
    const { result } = renderHook(() => useAgentWallet(AGENT));

    await act(async () => {
      await result.current.sweep(1n);
    });

    expect(markAgentRevoked).toHaveBeenCalledWith("a1");
    if (result.current.state.kind === "swept") {
      expect(result.current.state.emptied).toBe(true);
    }
  });

  it("treats a zero balance as empty", async () => {
    scans = [[{ asset: 1n, amount: 0n, notes: 0 }]];
    const { result } = renderHook(() => useAgentWallet(AGENT));

    await act(async () => {
      await result.current.sweep(1n);
    });

    expect(markAgentRevoked).toHaveBeenCalledWith("a1");
  });

  it("sweeps every asset, one transfer each", async () => {
    scans = [[]];
    const { result } = renderHook(() => useAgentWallet(AGENT));

    await act(async () => {
      await result.current.sweepAll([1n, 2n, 3n]);
    });

    expect(sweepEphemeral).toHaveBeenCalledTimes(3);
    if (result.current.state.kind === "swept") {
      expect(result.current.state.txHashes).toHaveLength(3);
    }
  });

  it("carries on when one asset fails, and reports it", async () => {
    scans = [[{ asset: 2n, amount: 5n, notes: 1 }]];
    sweepEphemeral.mockImplementationOnce(async () => {
      throw new Error("relayer said no");
    });
    const { result } = renderHook(() => useAgentWallet(AGENT));

    await act(async () => {
      await result.current.sweepAll([1n, 2n]);
    });

    // The second asset was still attempted.
    expect(sweepEphemeral).toHaveBeenCalledTimes(2);
    if (result.current.state.kind === "swept") {
      expect(result.current.state.failed).toHaveLength(1);
      expect(result.current.state.failed[0]?.asset).toBe(1n);
      expect(result.current.state.txHashes).toHaveLength(1);
    }
    expect(markAgentRevoked).not.toHaveBeenCalled();
  });

  it("refuses to sweep with no wallet to sweep into", async () => {
    vi.doMock("@/features/wallet", () => ({
      useSession: () => ({ layer: { kind: "eip1193" } }),
      useWallet: () => ({ wallet: undefined }),
    }));
    vi.resetModules();
    const { useAgentWallet: fresh } = await import("./use-agent-wallet");
    const { result } = renderHook(() => fresh(AGENT));

    await act(async () => {
      await result.current.sweep(1n);
    });

    expect(sweepEphemeral).not.toHaveBeenCalled();
    expect(result.current.state.kind).toBe("error");
    vi.doUnmock("@/features/wallet");
  });
});
