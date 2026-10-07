import type { QueryClient } from "@tanstack/react-query";
import { act, render, renderHook } from "@testing-library/react";
import { type ReactElement, type ReactNode, useSyncExternalStore } from "react";
import { MemoryRouter } from "react-router-dom";
import { ROUTER_FUTURE } from "@/app/providers/router-future";
import type { ChainEntry } from "@/config/chains";
import { ChainTestProvider } from "@/features/chain/testing";
import type { WalletContextValue } from "@/features/wallet";
import { fakeWalletContext, WalletTestProvider } from "@/features/wallet/testing";
import { makeChain } from "@/test/fixtures/chains";
import { createTestQueryClient, withQueryClient } from "@/test/render";

/// What the chain and wallet contexts answer.
export interface AppScene {
  /// The active chain: overrides for `makeChain`, or `null` for none. Default: `makeChain()`.
  chain?: Partial<ChainEntry> | null;
  /// The chains served. Default: the active chain alone.
  registry?: ChainEntry[];
  /// Overrides for `fakeWalletContext`. Default: disconnected.
  wallet?: Partial<WalletContextValue>;
}

export interface AppOptions extends AppScene {
  /// Where the router opens, e.g. `/send#to=…`. Default: `/`.
  route?: string;
  /// A client the test holds, to seed or inspect its cache. Default: a fresh one.
  client?: QueryClient;
}

function resolve(scene: AppScene) {
  return {
    chain: scene.chain === null ? undefined : makeChain(scene.chain),
    registry: scene.registry,
    wallet: fakeWalletContext(scene.wallet),
  };
}

/// The providers `AppProviders` nests, in its order, with the chain and wallet contexts answering
/// what the scene says. The features' own hooks run for real against them.
function appHarness(options: AppOptions) {
  const client = options.client ?? createTestQueryClient();
  const Query = withQueryClient(client);
  const listeners = new Set<() => void>();
  let scene = resolve(options);

  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };

  function AppHarness({ children }: { children: ReactNode }) {
    const { chain, registry, wallet } = useSyncExternalStore(subscribe, () => scene);
    return (
      <Query>
        <MemoryRouter future={ROUTER_FUTURE} initialEntries={[options.route ?? "/"]}>
          <ChainTestProvider chain={chain} registry={registry}>
            <WalletTestProvider value={wallet}>{children}</WalletTestProvider>
          </ChainTestProvider>
        </MemoryRouter>
      </Query>
    );
  }

  /// Change what the contexts answer, as a wallet or network switch does. A part left out keeps
  /// its value and its identity.
  function setApp(next: AppScene): void {
    const fresh = resolve(next);
    act(() => {
      scene = {
        chain: "chain" in next ? fresh.chain : scene.chain,
        registry: "registry" in next ? fresh.registry : scene.registry,
        wallet: "wallet" in next ? fresh.wallet : scene.wallet,
      };
      for (const listener of listeners) listener();
    });
  }

  return { client, setApp, wrapper: AppHarness };
}

/// `render` inside the app's providers.
export function renderApp(ui: ReactElement, options: AppOptions = {}) {
  const { wrapper, ...harness } = appHarness(options);
  return { ...render(ui, { wrapper }), ...harness };
}

/// `renderHook` inside the app's providers.
export function renderAppHook<Result, Props>(
  hook: (props: Props) => Result,
  options: AppOptions & { initialProps?: Props } = {},
) {
  const { wrapper, ...harness } = appHarness(options);
  return { ...renderHook(hook, { initialProps: options.initialProps, wrapper }), ...harness };
}
