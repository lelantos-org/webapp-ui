import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { detail } from "@/test/eip6963";
import { WalletPicker } from "./WalletPicker";

// A 1x1 gif — the shape of icon EIP-6963 actually mandates.
const DATA_ICON = "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==";

const WALLETS = [
  detail("uuid-mm", "io.metamask", "MetaMask", DATA_ICON),
  detail("uuid-rb", "io.rabby", "Rabby", DATA_ICON),
];

describe("WalletPicker", () => {
  beforeEach(() => {
    // `useExitTransition` skips its timer under reduced motion, so the
    // callbacks below fire synchronously instead of a fade later.
    vi.stubGlobal("matchMedia", (media: string) => ({ media, matches: true }));
  });

  it("lists the wallets in the order given", () => {
    render(<WalletPicker wallets={WALLETS} onChoose={vi.fn()} onCancel={vi.fn()} />);

    expect(screen.getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      "MetaMask",
      "Rabby",
    ]);
  });

  it("hands back the rdns of the wallet clicked", async () => {
    const onChoose = vi.fn();
    render(<WalletPicker wallets={WALLETS} onChoose={onChoose} onCancel={vi.fn()} />);

    await userEvent.click(screen.getByRole("button", { name: "Rabby" }));

    expect(onChoose).toHaveBeenCalledWith("io.rabby");
  });

  it("renders a monogram rather than requesting a non-data icon", () => {
    // `info.icon` is a string an untrusted extension supplies; a remote URL
    // must not become an `<img src>` even though the CSP would block it.
    render(
      <WalletPicker
        wallets={[detail("uuid-x", "com.evil", "Evil", "https://evil.example/pixel.png")]}
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
    await userEvent.click(screen.getByRole("button", { name: "cancel" }));
    expect(onCancel).toHaveBeenCalledTimes(2);
  });
});
