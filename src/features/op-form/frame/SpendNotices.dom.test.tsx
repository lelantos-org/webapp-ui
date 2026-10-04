import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ALL_CAPABILITIES, deniedCapabilities, fakeWalletContext } from "@/test/fakes/wallet";
import { routerWrapper } from "@/test/render";
import { SpendNotices } from "./SpendNotices";

const state = vi.hoisted(() => ({
  balances: undefined as { balance: bigint; pending: bigint }[] | undefined,
  canShield: true,
}));
vi.mock("@/features/assets", () => ({
  useBalances: () => ({ data: state.balances && { balances: state.balances } }),
}));
vi.mock("@/features/wallet", () => ({
  SyncNotice: () => null,
  useWallet: () =>
    fakeWalletContext({
      capabilities: state.canShield ? ALL_CAPABILITIES : deniedCapabilities("no public account"),
    }),
}));

const show = () => render(<SpendNotices />, { wrapper: routerWrapper });

beforeEach(() => {
  state.balances = [];
  state.canShield = true;
});

describe("SpendNotices", () => {
  it("points an empty wallet at Shield", () => {
    show();
    expect(screen.getByText(/Nothing shielded yet/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Shield an asset" }).getAttribute("href")).toBe(
      "/shield",
    );
  });

  it("names the other ways in for a wallet that cannot shield", () => {
    state.canShield = false;
    show();
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByText(/claim a link/)).toBeTruthy();
  });

  it("says nothing before the balances are in, or once anything is held or on its way", () => {
    state.balances = undefined;
    expect(show().container.textContent).toBe("");

    state.balances = [{ balance: 1n, pending: 0n }];
    expect(show().container.textContent).toBe("");

    state.balances = [{ balance: 0n, pending: 1n }];
    expect(show().container.textContent).toBe("");
  });
});
