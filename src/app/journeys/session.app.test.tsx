// Connecting, resuming and leaving, through the real providers and wallet stores.

import { act, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LOCAL_KEYS } from "@/shared/lib/storage/keys";
import { bootApp, newUser, returningUser } from "@/test/boot";
import { hexAddress } from "@/test/fixtures/addresses";
import { press } from "@/test/interact";

const header = () => within(screen.getByRole("banner"));

describe("a first visit", () => {
  it("opens on the welcome screen and asks the network nothing", async () => {
    const { fetch } = bootApp();

    expect(await screen.findByRole("button", { name: "Connect wallet" })).toBeInTheDocument();
    expect(screen.queryByText("Shielded balance")).not.toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("connects the extension, builds the wallet once and shows the account", async () => {
    const { build } = newUser({ account: hexAddress("a1") });
    bootApp();

    press(await screen.findByRole("button", { name: /MetaMask/ }));

    expect(await screen.findByText("Shielded balance")).toBeInTheDocument();
    expect(header().getByTitle(hexAddress("a1"))).toBeInTheDocument();
    expect(build).toHaveBeenCalledOnce();
    expect(build.mock.calls[0]?.[2]).toBe(hexAddress("a1"));
    expect(localStorage.getItem(LOCAL_KEYS.walletRdns)).toBe("io.metamask");
  });
});

describe("a return visit", () => {
  it("reconnects on load without a prompt", async () => {
    const { extension } = returningUser();
    bootApp();

    expect(await screen.findByText("Shielded balance")).toBeInTheDocument();
    const asked = extension.provider.request.mock.calls.map(([call]) => call.method);
    expect(asked).toContain("eth_accounts");
    expect(asked).not.toContain("eth_requestAccounts");
  });

  it("builds another wallet when the extension changes account", async () => {
    const { extension, build } = returningUser();
    bootApp();
    await screen.findByText("Shielded balance");

    act(() => extension.emit("accountsChanged", [hexAddress("b2")]));

    expect(await header().findByTitle(hexAddress("b2"))).toBeInTheDocument();
    await waitFor(() => expect(build).toHaveBeenCalledTimes(2));
    expect(build.mock.calls[1]?.[2]).toBe(hexAddress("b2"));
  });

  it("returns to the welcome screen on disconnect and forgets the session", async () => {
    returningUser();
    bootApp();
    await screen.findByText("Shielded balance");

    press("Disconnect");

    expect(await screen.findByRole("button", { name: "Connect wallet" })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText("Shielded balance")).not.toBeInTheDocument());
    expect(localStorage.getItem(LOCAL_KEYS.walletRdns)).toBeNull();
  });
});
