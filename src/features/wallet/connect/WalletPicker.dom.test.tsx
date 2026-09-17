import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { stubReducedMotion } from "@/test/browser";
import { WalletPicker } from "./WalletPicker";
import type { WalletChoice } from "./wallet-offerings";

const DATA_ICON = "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==";

const injected = (id: string, name: string, icon = DATA_ICON): WalletChoice => ({
  kind: "eip1193",
  id,
  name,
  icon,
});

const WALLETS: WalletChoice[] = [
  injected("io.metamask", "MetaMask"),
  injected("io.rabby", "Rabby"),
];

describe("WalletPicker", () => {
  beforeEach(() => {
    stubReducedMotion();
  });

  it("lists the wallets in the order given", () => {
    render(<WalletPicker wallets={WALLETS} onChoose={vi.fn()} onCancel={vi.fn()} />);

    expect(screen.getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      "MetaMask",
      "Rabby",
    ]);
  });

  it("hands back the choice clicked", async () => {
    const onChoose = vi.fn();
    render(<WalletPicker wallets={WALLETS} onChoose={onChoose} onCancel={vi.fn()} />);

    await userEvent.click(screen.getByRole("button", { name: "Rabby" }));

    expect(onChoose).toHaveBeenCalledWith(injected("io.rabby", "Rabby"));
  });

  it("offers a passkey alongside the extensions", async () => {
    const onChoose = vi.fn();
    const passkey: WalletChoice = { kind: "passkey", id: "passkey", name: "Create a passkey" };
    render(<WalletPicker wallets={[...WALLETS, passkey]} onChoose={onChoose} onCancel={vi.fn()} />);

    expect(screen.getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      "MetaMask",
      "Rabby",
      "Create a passkeyNo browser wallet needed",
    ]);

    await userEvent.click(screen.getByRole("button", { name: /Create a passkey/ }));
    expect(onChoose).toHaveBeenCalledWith(passkey);
  });

  it("renders a monogram rather than requesting a non-data icon", () => {
    render(
      <WalletPicker
        wallets={[injected("com.evil", "Evil", "https://evil.example/pixel.png")]}
        onChoose={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(document.querySelector("img")).toBeNull();
    expect(screen.getByText("E")).toBeInTheDocument();
  });

  it("focuses the first wallet so Tab stays inside the dialog", () => {
    render(<WalletPicker wallets={WALLETS} onChoose={vi.fn()} onCancel={vi.fn()} />);

    expect(screen.getByRole("button", { name: "MetaMask" })).toHaveFocus();
  });

  it("dismisses on Escape and on the cancel button", async () => {
    const onCancel = vi.fn();
    const { unmount } = render(
      <WalletPicker wallets={WALLETS} onChoose={vi.fn()} onCancel={onCancel} />,
    );

    await userEvent.keyboard("{Escape}");
    expect(onCancel).toHaveBeenCalledTimes(1);
    unmount();

    render(<WalletPicker wallets={WALLETS} onChoose={vi.fn()} onCancel={onCancel} />);
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledTimes(2);
  });
});
