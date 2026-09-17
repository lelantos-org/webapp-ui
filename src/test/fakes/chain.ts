// `vi.mock` factories are hoisted: load this with `await import("@/test/fakes/chain")` inside them.

import type { ChainEntry } from "@/config/chains";
import { makeChain } from "@/test/fixtures/chains";

interface ActiveChainHooks {
  useActiveChain: () => ChainEntry;
  useActiveChainOrUndefined: () => ChainEntry | undefined;
  useTxExplorerUrl: () => (txHash: string) => string | undefined;
}

/// The active-chain hooks answering `makeChain(chain)`, or a per-call function (may return no chain).
export function activeChainHooks(
  chain: Partial<ChainEntry> | (() => ChainEntry | undefined) = {},
): ActiveChainHooks {
  const read = typeof chain === "function" ? chain : () => makeChain(chain);
  return {
    useActiveChain: () => {
      const c = read();
      if (!c) throw new Error("activeChainHooks: useActiveChain() with no active chain");
      return c;
    },
    useActiveChainOrUndefined: read,
    useTxExplorerUrl: () => () => undefined,
  };
}
