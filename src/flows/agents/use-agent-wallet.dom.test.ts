// An agent is marked revoked only once its whole wallet is empty, not when one
// asset is swept.

import { act, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StoredAgent } from "@/features/agents";
import { fakeWalletApi } from "@/features/wallet/testing";
import { renderAppHook } from "@/test/app";

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
  scanEphemeralBalances: async () => scans.shift() ?? [],
  sweepEphemeral: (eph: unknown, to: string, asset: bigint) => sweepEphemeral(eph, to, asset),
}));

vi.mock("@/features/wallet", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/wallet")>()),
  useSession: () => ({ layer: { kind: "eip1193" } }),
}));

const SCENE = {
  chain: { chainId: 31337n },
  wallet: { wallet: fakeWalletApi({ address: "lelantos1me" }) },
};

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
    const { result } = renderAppHook(() => useAgentWallet(AGENT), SCENE);

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
    const { result } = renderAppHook(() => useAgentWallet(AGENT), SCENE);

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
    const { result } = renderAppHook(() => useAgentWallet(AGENT), SCENE);

    await act(async () => {
      await result.current.sweep(1n);
    });

    expect(markAgentRevoked).toHaveBeenCalledWith("a1");
  });

  it("sweeps every asset, one transfer each", async () => {
    scans = [[]];
    const { result } = renderAppHook(() => useAgentWallet(AGENT), SCENE);

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
    const { result } = renderAppHook(() => useAgentWallet(AGENT), SCENE);

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
    const { result } = renderAppHook(() => useAgentWallet(AGENT), { chain: SCENE.chain });

    await act(async () => {
      await result.current.sweep(1n);
    });

    expect(sweepEphemeral).not.toHaveBeenCalled();
    expect(result.current.state.kind).toBe("error");
  });
});
