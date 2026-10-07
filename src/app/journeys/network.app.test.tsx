// What the app does about the network: the registry it fetches and the chain the wallet is on.

import { act, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { bootApp, returningUser } from "@/test/boot";
import { deployment } from "@/test/fixtures/registry";
import { jsonResponse } from "@/test/http";
import { press } from "@/test/interact";

describe("the wallet's network", () => {
  it("holds the wallet back on a network the deployment does not serve, and offers the switch", async () => {
    const { extension, build } = returningUser({ chainId: 1 });
    bootApp();

    expect(await screen.findByText("Unsupported network")).toBeInTheDocument();
    expect(build).not.toHaveBeenCalled();

    press("switch to base");
    expect(extension.provider.request).toHaveBeenCalledWith({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: "0x7a69" }],
    });
  });

  it("lets the wallet in once the extension moves to a served network", async () => {
    const { extension } = returningUser({ chainId: 1 });
    bootApp();
    await screen.findByText("Unsupported network");

    act(() => extension.emit("chainChanged", "0x7a69"));

    expect(await screen.findByText("Shielded balance")).toBeInTheDocument();
  });

  it("rebuilds the wallet for the network the extension moves to", async () => {
    const { extension, build } = returningUser();
    bootApp({ chains: [31337, 8453] });
    await screen.findByText("Shielded balance");

    act(() => extension.emit("chainChanged", "0x2105"));

    expect(await screen.findByTitle("chain id 8453")).toBeInTheDocument();
    expect(build).toHaveBeenCalledTimes(2);
    expect(build.mock.calls[1]?.[1]).toMatchObject({ chainId: 8453n });
  });
});

describe("the registry", () => {
  it("says the relayer cannot be reached once its retries run out, and recovers on try again", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    returningUser();
    let up = false;
    bootApp({
      routes: {
        "/registry/v1/chains": () =>
          up ? { chains: [deployment(31337)] } : jsonResponse({}, { status: 500 }),
      },
    });

    expect(await screen.findByText("Loading networks…")).toBeInTheDocument();
    await act(() => vi.advanceTimersByTimeAsync(10_000));
    expect(await screen.findByText(/Could not reach the relayer/)).toBeInTheDocument();

    up = true;
    press("Try again");

    // Asked again each time: the screen is remounted as the welcome card fades out.
    await waitFor(() => expect(screen.getByText("Shielded balance")).toBeInTheDocument());
  });
});
