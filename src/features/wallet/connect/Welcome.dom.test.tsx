import { fireEvent, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WalletKind } from "@/features/wallet-kinds";
import { renderApp } from "@/test/app";
import { press } from "@/test/interact";
import type { WalletStatus } from "../session/context";
import { Welcome } from "./Welcome";
import type { WalletChoice } from "./wallet-offerings";

const h = vi.hoisted(() => ({
  status: "disconnected" as WalletStatus,
  kind: undefined as WalletKind | undefined,
  choices: [] as WalletChoice[],
  metamaskLink: undefined as string | undefined,
  connect: vi.fn(),
  disconnect: vi.fn(),
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
vi.mock("./mobile-wallet-link", () => ({
  metamaskDappLink: () => h.metamaskLink,
}));
vi.mock("./use-connect-flow", () => ({
  useWalletChoices: () => h.choices,
}));

const METAMASK: WalletChoice = { kind: "eip1193", id: "mm", name: "MetaMask", icon: "" };
const PASSKEY: WalletChoice = { kind: "passkey", id: "passkey", name: "Passkey" };

beforeEach(() => {
  h.status = "disconnected";
  h.kind = undefined;
  h.choices = [];
  h.metamaskLink = undefined;
});

/// Render the screen for the session `h` describes.
function show() {
  return renderApp(<Welcome />, {
    wallet: {
      status: h.status,
      kind: h.kind,
      error: "rejected",
      connect: h.connect,
      disconnect: h.disconnect,
    },
  });
}

function card(title: string) {
  show();
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
    show();
    press("Connect wallet");
    expect(screen.getByRole("button", { name: /Passkey/ })).toHaveFocus();
    expect(h.connect).not.toHaveBeenCalled();
  });

  it("connects straight away when there is one wallet or none", () => {
    h.choices = [METAMASK];
    show();
    press("Connect wallet");
    expect(h.connect).toHaveBeenCalledTimes(1);
  });

  it("lets the user look again when no wallet has announced itself", () => {
    fireEvent.click(
      within(card("Choose a wallet")).getByRole("button", { name: "Look for a wallet again" }),
    );
    expect(h.connect).toHaveBeenCalledTimes(1);
  });

  it("offers MetaMask's own browser on a phone, where no wallet can announce itself", () => {
    h.metamaskLink = "https://metamask.app.link/dapp/app.example.org/";
    h.choices = [PASSKEY];
    const link = within(card("Choose a wallet")).getByRole("link", { name: "Open in MetaMask" });
    expect(link).toHaveAttribute("href", h.metamaskLink);
  });

  it("does not send the user to MetaMask from inside a wallet's browser", () => {
    h.metamaskLink = "https://metamask.app.link/dapp/app.example.org/";
    h.choices = [METAMASK];
    expect(within(card("Choose a wallet")).queryByRole("link")).toBeNull();
  });

  it("says a connection failed, why, and retries", () => {
    h.status = "error";
    const failed = card("Connection failed");
    expect(within(failed).getByText("rejected")).toBeInTheDocument();
    fireEvent.click(within(failed).getByRole("button", { name: "Try again" }));
    expect(h.connect).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: "Connect wallet" })).toBeNull();
  });

  it("says the wallet is being prepared once the key is derived, with nothing to sign", () => {
    h.status = "preparing";
    h.kind = "eip1193";
    const region = card("Preparing your wallet…");
    expect(region).not.toHaveTextContent(/sign/i);
  });

  it.each<WalletStatus>([
    "connecting",
    "loading-networks",
    "deriving",
    "preparing",
    "resuming",
  ])("offers a way out while %s", (status) => {
    h.status = status;
    h.kind = "eip1193";
    h.disconnect.mockClear();
    show();
    press("Cancel");
    expect(h.disconnect).toHaveBeenCalledOnce();
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
    const { unmount } = show();
    const signing = screen.getByRole("region", { name: "Check your wallet" });
    expect(within(signing).getByText(/^This signature IS your shielded spending key/)).toBeTruthy();
    unmount();

    h.kind = "passkey";
    const passkey = card("Unlock your passkey");
    expect(within(passkey).queryByText(/spending key/)).toBeNull();
  });
});
