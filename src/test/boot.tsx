import type { WalletApi } from "@lelantos-org/sdk";
import { render } from "@testing-library/react";
import { onTestFinished, vi } from "vitest";
import { AppProviders } from "@/app/providers/providers";
import { App } from "@/app/routes/App";
import { connectedWalletApi, stubWalletBuild } from "@/features/wallet/testing";
import { eip1193Store } from "@/features/wallet-kinds";
import { LOCAL_KEYS } from "@/shared/lib/storage/keys";
import { type InjectedWallet, installWallet } from "@/test/fakes/eip6963";
import { hexAddress, SHIELDED_ADDRESS } from "@/test/fixtures/addresses";
import { deployment, relayer } from "@/test/fixtures/registry";
import { stubFetchRoutes } from "@/test/http";
import { createTestQueryClient } from "@/test/render";

export interface BootOptions {
  /// The address bar on load. Default: `/`.
  path?: string;
  /// The chains the registry and the relayer both describe. Default: anvil alone.
  chains?: number[];
  /// The `/v1/assets` rows. Default: none.
  assets?: unknown[];
  /// Routes by pathname, over the defaults; see `stubFetchRoutes`. Any other path is a 404.
  routes?: Record<string, unknown>;
}

/// Mount the whole app as a page load does: the real providers, routes and shell, with the
/// network answering from a route table. Returns the query client and the `fetch` stub.
export function bootApp(options: BootOptions = {}) {
  const chains = options.chains ?? [31337];
  window.history.replaceState(null, "", options.path ?? "/");
  const fetch = stubFetchRoutes({
    "/registry/v1/chains": { chains: chains.map(deployment) },
    "/registry/v1/assets": options.assets ?? [],
    "/registry/v1/prices": { prices: [] },
    "/registry/health": {},
    "/relayer/chains": { chains: chains.map(relayer) },
    "/relayer/health": {},
    "/fmd/health": {},
    "/fmd/v1/head": { chainId: chains[0], maxNoteId: 0, maxNullifierSeq: 0 },
    ...options.routes,
  });
  // jsdom neither draws nor scrolls. The backdrop reads a missing context as "skip the animation".
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  // The wallet store outlives the page it was mounted in.
  onTestFinished(() => eip1193Store.resetForTest());

  const client = createTestQueryClient();
  const rendered = render(
    <AppProviders client={client}>
      <App />
    </AppProviders>,
  );
  return { ...rendered, client, fetch };
}

export interface UserOptions {
  /// The extension's account. Default: `hexAddress("a1")`.
  account?: `0x${string}`;
  /// The network the extension is on. Default: anvil.
  chainId?: number;
  /// What a wallet build answers. Default: `connectedWalletApi(SHIELDED_ADDRESS)`.
  wallet?: WalletApi;
}

export interface User {
  extension: InjectedWallet;
  /// The wallet build, called once per account and chain.
  build: ReturnType<typeof vi.fn<(...args: unknown[]) => Promise<WalletApi>>>;
}

/// A visitor with a wallet extension installed, whose shielded wallet builds without the SDK.
/// Call before `bootApp`.
export function newUser(options: UserOptions = {}): User {
  const wallet = options.wallet ?? connectedWalletApi(SHIELDED_ADDRESS);
  const build = vi.fn(async (..._args: unknown[]) => wallet);
  stubWalletBuild(build);
  const extension = installWallet(options.account ?? hexAddress("a1"), options.chainId ?? 31337);
  return { extension, build };
}

/// `newUser`, still connected from an earlier visit: the page reconnects on load, unprompted.
export function returningUser(options: UserOptions = {}): User {
  const user = newUser(options);
  localStorage.setItem(LOCAL_KEYS.walletRdns, user.extension.info.rdns);
  return user;
}
