import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { StoredAgent } from "@/features/agents";
import { fakeActionMutation } from "@/test/fakes/operation";
import { makeAsset } from "@/test/fixtures/assets";
import { fill, press } from "@/test/interact";
import type { TopUpRequest } from "../use-top-up-agent";
import { TopUpPanel } from "./TopUpPanel";

const USDC = makeAsset(1n, "USDC", { decimals: 6, scale: 10n ** 3n });
const WETH = makeAsset(2n, "WETH", { decimals: 18, scale: 10n ** 15n });

// Typed, so the assertions below read the real request shape rather than `any`.
const mutateAsync = vi.fn(async (_input: TopUpRequest) => ({
  txHash: "0xabc",
  tx: {} as never,
}));

vi.mock("../use-top-up-agent", () => ({
  useTopUpAgent: () => fakeActionMutation(mutateAsync),
}));

const AGENT: StoredAgent = {
  id: "a1",
  label: "research bot",
  chainId: "31337",
  address: "lelantos1agent",
  nsk: "0xdead",
  createdAt: 0,
};

function setup(assets = [USDC, WETH]) {
  mutateAsync.mockClear();
  return render(<TopUpPanel agent={AGENT} assets={assets} />);
}

describe("TopUpPanel", () => {
  it("sends to the agent's own address, never a typed one", async () => {
    setup();
    fill("Top up", "1.5");
    press("Send");

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    expect(mutateAsync.mock.calls[0]?.[0]).toMatchObject({
      address: "lelantos1agent",
      asset: 1n,
    });
  });

  it("converts the figure into the asset's circuit units", async () => {
    // 6 decimals at scale 10^3: 1.5 USDC is 1500 circuit units.
    setup();
    fill("Top up", "1.5");
    press("Send");

    await waitFor(() => expect(mutateAsync).toHaveBeenCalled());
    expect(mutateAsync.mock.calls[0]?.[0].amount).toBe(1500n);
  });

  it("sends the asset the operator picked", async () => {
    setup();
    fireEvent.change(screen.getByLabelText("Asset to send"), { target: { value: "2" } });
    fill("Top up", "1");
    press("Send");

    await waitFor(() => expect(mutateAsync).toHaveBeenCalled());
    expect(mutateAsync.mock.calls[0]?.[0].asset).toBe(2n);
  });

  it("refuses an unparseable amount without calling the mutation", async () => {
    setup();
    fill("Top up", "not a number");
    press("Send");

    expect(await screen.findByText(/not an amount of USDC/)).toBeTruthy();
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("refuses more decimals than the token has", async () => {
    // USDC has 6 decimals; a seventh cannot be represented.
    setup();
    fill("Top up", "1.0000001");
    press("Send");

    expect(await screen.findByText(/not an amount of USDC/)).toBeTruthy();
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("keeps Send dead until an amount is entered", () => {
    setup();
    expect(screen.getByRole("button", { name: "Send" }).hasAttribute("disabled")).toBe(true);
    fill("Top up", "1");
    expect(screen.getByRole("button", { name: "Send" }).hasAttribute("disabled")).toBe(false);
  });

  it("clears the field once the transfer is away, so a second press cannot repeat it", async () => {
    setup();
    fill("Top up", "2");
    press("Send");

    await waitFor(() => expect(mutateAsync).toHaveBeenCalled());
    await waitFor(() =>
      expect((screen.getByLabelText("Top up") as HTMLInputElement).value).toBe(""),
    );
  });

  it("says so when the network has no assets to send", () => {
    setup([]);
    fill("Top up", "1");
    press("Send");
    expect(screen.getByText(/No assets on this network/)).toBeTruthy();
  });
});
