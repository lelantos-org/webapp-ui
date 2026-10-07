import { evmAddress, type WalletApi } from "@lelantos-org/sdk";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChainEntry } from "@/config/chains";
import { fakeWalletApi, fakeWalletContext } from "@/test/fakes/wallet";
import { hexAddress, SHIELDED_ADDRESS } from "@/test/fixtures/addresses";
import { makeChain } from "@/test/fixtures/chains";
import { routerWrapper } from "@/test/render";
import { Home } from "./Home";

const REGISTRAR = evmAddress(hexAddress("77"));
const wallet = fakeWalletApi({ address: SHIELDED_ADDRESS });

const state = vi.hoisted(() => ({
  chain: undefined as unknown,
  claimed: undefined as { label: string; address: string; claimedAt: number } | undefined,
}));
const useClaimedHandle = vi.fn(
  (_chainId: bigint | undefined, _account: string | undefined) => state.claimed,
);

vi.mock("@/features/assets", () => ({ AssetsCard: () => null, PortfolioHero: () => null }));
vi.mock("@/features/chain", () => ({
  useActiveChainOrUndefined: () => state.chain as ChainEntry | undefined,
}));
vi.mock("@/features/wallet", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/features/wallet")>();
  const { ALL_CAPABILITIES } = await import("@/test/fakes/wallet");
  return {
    AccountCard: real.AccountCard,
    ConnectedGate: ({ children }: { children(v: { wallet: WalletApi }): ReactNode }) =>
      children({ wallet }),
    preloadProverWorker: async () => {},
    useWallet: () => fakeWalletContext({ wallet, capabilities: ALL_CAPABILITIES }),
  };
});
vi.mock("@/features/names", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/names")>()),
  useClaimedHandle: (chainId: bigint | undefined, account: string | undefined) =>
    useClaimedHandle(chainId, account),
}));
// The idle prefetch would load every route chunk.
vi.mock("@/shared/lib/when-idle", () => ({ whenIdle: () => () => {} }));

const named = (over: Partial<ChainEntry> = {}) =>
  makeChain({ nameRegistrarAddress: REGISTRAR, nameParents: ["lelantos.xyz"], ...over });
const tiles = () =>
  [...screen.getByRole("navigation", { name: "What to do" }).children].map((t) => t.textContent);

beforeEach(() => {
  state.chain = named();
  state.claimed = undefined;
});

describe("Home", () => {
  it("offers the handle tile where the chain runs a registrar", () => {
    render(<Home />, { wrapper: routerWrapper });
    expect(tiles()).toEqual(["Shield", "Send", "Swap", "Unshield", "Handle"]);
    expect(screen.getByRole("link", { name: "Handle" })).toHaveAttribute("href", "/name");
  });

  it("leaves the handle tile out where it does not", () => {
    state.chain = makeChain();
    render(<Home />, { wrapper: routerWrapper });
    expect(tiles()).toEqual(["Shield", "Send", "Swap", "Unshield"]);
  });

  it("lays out six tiles when governance and handles are both there", () => {
    state.chain = named({ governorAddress: evmAddress(hexAddress("55")) });
    render(<Home />, { wrapper: routerWrapper });
    expect(tiles()).toEqual(["Shield", "Send", "Swap", "Unshield", "Governance", "Handle"]);
    expect(screen.getByRole("navigation", { name: "What to do" })).toHaveClass("tiles--six");
  });

  it("shows the account's handle on its card, looked up by the shielded address", () => {
    state.claimed = { label: "mehow", address: "lelantos1published", claimedAt: 1 };
    render(<Home />, { wrapper: routerWrapper });
    expect(screen.getByRole("link", { name: "mehow.lelantos.xyz" })).toHaveAttribute(
      "href",
      "/profile#mehow",
    );
    expect(useClaimedHandle).toHaveBeenCalledWith(31337n, SHIELDED_ADDRESS);
  });

  it("shows no handle on a chain that no longer runs a registrar", () => {
    state.chain = makeChain();
    state.claimed = { label: "mehow", address: "lelantos1published", claimedAt: 1 };
    render(<Home />, { wrapper: routerWrapper });
    expect(screen.queryByText("your public handle")).not.toBeInTheDocument();
  });
});
