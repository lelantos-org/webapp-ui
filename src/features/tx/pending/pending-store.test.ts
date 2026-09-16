// @vitest-environment jsdom
// The pending overlay keeps a balance steady while a tx settles. Each rule here
// is one way it could instead show a phantom balance: on the wrong chain, after
// the tx it describes has settled, or for the rest of the session.

import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PendingOp } from "./operation";
import * as store from "./pending-store";

/// The store is a module singleton, emptied through its own API before each
/// test: `clearPending` takes the plain entries, `pruneExpired` the watermarks.
/// (Re-importing the module instead re-evaluated the chain registry behind
/// `@/config/chains` every time, ~250 ms a test.)
beforeEach(() => {
  const { result, unmount } = renderHook(() => store.usePending());
  act(() => {
    for (const e of result.current.values()) store.clearPending(e.chainId, e.opId);
    store.pruneExpired(Number.POSITIVE_INFINITY);
  });
  unmount();
});

const A = 31337n;
const B = 8453n;

/// An operation named by its tx hash and first commitment, which here defaults
/// to one derived from the hash: one operation per tx unless a test bundles.
function op(txHash: string, opId = `cm-${txHash}`): PendingOp {
  return { txHash, opId };
}

function live() {
  return renderHook(() => store.usePending());
}

function totals(chainId: bigint) {
  return renderHook(() => store.usePendingByAsset(chainId));
}

describe("pending store", () => {
  it("keys an entry by chain, operation and asset, so one op can credit several assets", () => {
    const { result } = live();
    act(() =>
      store.addPendingMany(A, op("0xswap"), [
        { asset: 1n, pendingIn: 5n, outflow: 10n },
        { asset: 2n, pendingIn: 7n, outflow: 0n },
      ]),
    );
    expect([...result.current.keys()]).toEqual(["7a69:cm-0xswap:1", "7a69:cm-0xswap:2"]);
  });

  it("keeps two bundled operations of one tx apart", () => {
    const { result } = live();
    act(() => {
      store.addPendingMany(A, op("0xbundle", "0xcm1"), [{ asset: 1n, pendingIn: 5n, outflow: 1n }]);
      store.addPendingMany(A, op("0xbundle", "0xcm2"), [{ asset: 1n, pendingIn: 3n, outflow: 2n }]);
    });
    expect(result.current.size).toBe(2);

    act(() => store.clearPending(A, "0xcm1"));
    expect([...result.current.values()].map((e) => [e.txHash, e.opId])).toEqual([
      ["0xbundle", "0xcm2"],
    ]);
  });

  it("publishes nothing for an empty batch", () => {
    const { result } = live();
    const before = result.current;
    act(() => store.addPendingMany(A, op("0xnone"), []));
    expect(result.current).toBe(before);
  });

  it("totals per asset on the requested chain only", () => {
    act(() => {
      store.addPendingMany(A, op("0x1"), [{ asset: 1n, pendingIn: 5n, outflow: 1n }]);
      store.addPendingMany(A, op("0x2"), [{ asset: 1n, pendingIn: 3n, outflow: 2n }]);
      // Asset ids are only unique per chain: this must not inflate chain A's asset 1.
      store.addPendingMany(B, op("0x3"), [{ asset: 1n, pendingIn: 100n, outflow: 0n }]);
    });
    const { result } = totals(A);
    expect(result.current.get(1n)).toEqual({ pendingIn: 8n, outflow: 3n });
  });

  describe("clearPending", () => {
    it("removes the operation's entries on that chain, leaving watermarks and other chains", () => {
      const { result } = live();
      act(() => {
        store.addPendingMany(A, op("0xtx"), [
          { asset: 1n, pendingIn: 5n, outflow: 0n },
          { asset: 2n, pendingIn: 5n, outflow: 0n, clearWhenBalanceAtLeast: 50n },
        ]);
        store.addPendingMany(B, op("0xtx"), [{ asset: 1n, pendingIn: 5n, outflow: 0n }]);
      });
      act(() => store.clearPending(A, "cm-0xtx"));
      expect([...result.current.keys()]).toEqual(["7a69:cm-0xtx:2", "2105:cm-0xtx:1"]);
    });

    it("publishes nothing when it removed nothing", () => {
      const { result } = live();
      act(() => store.addPendingMany(A, op("0xtx"), [{ asset: 1n, pendingIn: 5n, outflow: 0n }]));
      const before = result.current;
      act(() => store.clearPending(A, "cm-0xother"));
      expect(result.current).toBe(before);
    });
  });

  describe("pruneByBalances", () => {
    it("clears a watermark once the active chain's balance reaches it", () => {
      const { result } = live();
      act(() =>
        store.addPendingMany(A, op("0xswap"), [
          { asset: 2n, pendingIn: 5n, outflow: 0n, clearWhenBalanceAtLeast: 50n },
        ]),
      );

      act(() => store.pruneByBalances(A, () => 49n));
      expect(result.current.size).toBe(1);

      act(() => store.pruneByBalances(A, () => 50n));
      expect(result.current.size).toBe(0);
    });

    it("never judges another chain's watermark, or an entry without one", () => {
      const { result } = live();
      act(() => {
        store.addPendingMany(B, op("0xswap"), [
          { asset: 2n, pendingIn: 5n, outflow: 0n, clearWhenBalanceAtLeast: 50n },
        ]);
        store.addPendingMany(A, op("0xtx"), [{ asset: 2n, pendingIn: 5n, outflow: 0n }]);
      });
      act(() => store.pruneByBalances(A, () => 1_000n));
      expect(result.current.size).toBe(2);
    });
  });

  describe("pruneExpired", () => {
    it("retires a watermark past its deadline, and never a plain entry", () => {
      const T0 = Date.UTC(2026, 0, 1);
      vi.spyOn(Date, "now").mockReturnValue(T0);
      const { result } = live();
      act(() =>
        store.addPendingMany(A, op("0xswap"), [
          { asset: 1n, pendingIn: 5n, outflow: 0n },
          { asset: 2n, pendingIn: 5n, outflow: 0n, clearWhenBalanceAtLeast: 50n },
        ]),
      );
      expect(result.current.get("7a69:cm-0xswap:1")?.expiresAt).toBeUndefined();
      const deadline = result.current.get("7a69:cm-0xswap:2")?.expiresAt;
      expect(deadline).toBe(T0 + 10 * 60_000);

      act(() => store.pruneExpired((deadline ?? 0) - 1));
      expect(result.current.size).toBe(2);

      act(() => store.pruneExpired(deadline));
      expect([...result.current.keys()]).toEqual(["7a69:cm-0xswap:1"]);
    });
  });
});
