// Stand-ins for the `chain` feature's hooks.
//
// `vi.mock` factories are hoisted above the test file's imports, so a factory
// body that touches an imported binding fails with "Cannot access
// '__vi_import_n__' before initialization" whenever the mocked module happens to
// be imported first. Load this module from inside the factory instead, which
// holds in any import order:
//
//   vi.mock("@/features/chain", async () =>
//     (await import("@/test/fakes/chain")).activeChainHooks({ chainId: 1n }),
//   );

import type { ChainEntry } from "@/config/chains";
import { makeChain } from "@/test/fixtures/chains";

interface ActiveChainHooks {
  useActiveChain: () => ChainEntry;
  useActiveChainOrUndefined: () => ChainEntry | undefined;
}

/// The active-chain hooks, answering with `makeChain(chain)`.
///
/// Pass a function instead to vary the chain between renders (it is read on
/// every call) or to have `useActiveChainOrUndefined` answer "no chain".
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
  };
}
