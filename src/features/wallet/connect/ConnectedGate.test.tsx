// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeWalletApi, fakeWalletContext } from "@/test/fakes/wallet";
import type { WalletContextValue } from "../session/use-wallet";
import { ConnectedGate } from "./ConnectedGate";

const session = vi.hoisted(() => ({ value: undefined as unknown }));

vi.mock("../session/use-wallet", () => ({ useWallet: () => session.value }));
vi.mock("./Welcome", () => ({ Welcome: () => <p>welcome</p> }));

beforeEach(() => {
  session.value = fakeWalletContext();
});

describe("ConnectedGate", () => {
  it("holds the column for Welcome until a wallet is ready", () => {
    const children = vi.fn(() => <p>connected</p>);
    render(<ConnectedGate>{children}</ConnectedGate>);
    expect(screen.getByText("welcome")).toBeInTheDocument();
    expect(children).not.toHaveBeenCalled();
  });

  it("renders the connected view with the wallet, Welcome fading out over it", () => {
    const wallet = fakeWalletApi({ address: "lelantos1me" });
    session.value = fakeWalletContext({ wallet } satisfies Partial<WalletContextValue>);
    const children = vi.fn(() => <p>connected</p>);
    render(<ConnectedGate>{children}</ConnectedGate>);
    expect(screen.getByText("connected")).toBeInTheDocument();
    expect(children).toHaveBeenCalledWith({ wallet, welcomeMounted: false });
  });
});
