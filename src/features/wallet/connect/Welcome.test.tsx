// @vitest-environment jsdom
// The Welcome wallet card: one labelled region whose title, copy and action
// follow the connection's status, and a "Connect wallet" that either points at
// the picker beside it or connects straight away.

import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WalletKind } from "@/features/wallet-kinds";
import { fakeWalletContext } from "@/test/fakes/wallet";
import type { WalletStatus } from "../session/context";
import { Welcome } from "./Welcome";
import type { WalletChoice } from "./wallet-offerings";

const h = vi.hoisted(() => ({
  status: "disconnected" as WalletStatus,
  kind: undefined as WalletKind | undefined,
  choices: [] as WalletChoice[],
  connect: vi.fn(),
  selectKind: vi.fn(),
}));

vi.mock("@/features/chain", () => ({
  ChainSwitchButtons: () => null,
  SupportedNetworks: () => null,
}));
vi.mock("@/features/wallet-kinds", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/wallet-kinds")>()),
  selectKind: h.selectKind,
}));
vi.mock("./use-connect-flow", () => ({
  useWalletChoices: () => h.choices,
}));
vi.mock("../session/context", () => ({
  useWallet: () =>
    fakeWalletContext({ status: h.status, kind: h.kind, error: "rejected", connect: h.connect }),
}));

const METAMASK: WalletChoice = { kind: "eip1193", id: "mm", name: "MetaMask", icon: "" };
const PASSKEY: WalletChoice = { kind: "passkey", id: "passkey", name: "Passkey" };

beforeEach(() => {
  h.status = "disconnected";
  h.kind = undefined;
  h.choices = [];
});

/// The wallet card, found by the title that labels it.
function card(title: string) {
  render(<Welcome />);
  return screen.getByRole("region", { name: title });
}

describe("Welcome", () => {
  it("offers the wallets as the card itself, and attaches the one chosen", () => {
    h.choices = [PASSKEY, METAMASK];
    fireEvent.click(within(card("Choose a wallet")).getByRole("button", { name: /MetaMask/ }));
    expect(h.selectKind).toHaveBeenCalledWith(METAMASK.kind, METAMASK.id);
  });

  it("points Connect wallet at the first row when there are several", () => {
    h.choices = [PASSKEY, METAMASK];
    render(<Welcome />);
    fireEvent.click(screen.getByRole("button", { name: "Connect wallet" }));
    expect(screen.getByRole("button", { name: /Passkey/ })).toHaveFocus();
    expect(h.connect).not.toHaveBeenCalled();
  });

  it("connects straight away when there is one wallet or none", () => {
    h.choices = [METAMASK];
    render(<Welcome />);
    fireEvent.click(screen.getByRole("button", { name: "Connect wallet" }));
    expect(h.connect).toHaveBeenCalledTimes(1);
  });

  it("lets the user look again when no wallet has announced itself", () => {
    fireEvent.click(
      within(card("Choose a wallet")).getByRole("button", { name: "Look for a wallet again" }),
    );
    expect(h.connect).toHaveBeenCalledTimes(1);
  });

  it("says a connection failed, why, and retries", () => {
    h.status = "error";
    const failed = card("Connection failed");
    expect(within(failed).getByText("rejected")).toBeInTheDocument();
    fireEvent.click(within(failed).getByRole("button", { name: "Try again" }));
    expect(h.connect).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: "Connect wallet" })).toBeNull();
  });

  it("names an unsupported network", () => {
    h.status = "unsupported-chain";
    expect(within(card("Unsupported network")).getByText(/Switch it to continue/)).toBeTruthy();
  });

  it.each([
    ["connecting", "Connecting…", "Approve the connection request in your wallet."],
    ["resuming", "Resuming your session…", "Unlocking your shielded wallet."],
  ] as const)("reports %s in the card", (status, title, body) => {
    h.status = status;
    expect(within(card(title)).getByText(body)).toBeInTheDocument();
  });

  it("carries the signing kind's warning while deriving, and not the passkey's", () => {
    h.status = "deriving";
    h.kind = "eip1193";
    const { unmount } = render(<Welcome />);
    const signing = screen.getByRole("region", { name: "Check your wallet" });
    expect(within(signing).getByText(/^This signature IS your shielded spending key/)).toBeTruthy();
    unmount();

    h.kind = "passkey";
    const passkey = card("Unlock your passkey");
    expect(within(passkey).queryByText(/spending key/)).toBeNull();
  });
});
