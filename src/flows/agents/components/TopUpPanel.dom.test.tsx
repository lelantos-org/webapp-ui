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

// Typed so the assertions read the real request shape.
const mutateAsync = vi.fn(async (_input: TopUpRequest) => ({
  txHash: "0xabc",
  tx: {} as never,
}));

const held = vi.hoisted(() => ({ balance: 5_000_000n, error: null as Error | null }));

vi.mock("@/features/assets", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/assets")>()),
  ...(await import("@/test/fakes/assets")).assetReads(() => ({
    assets: [USDC, WETH],
    balance: held.balance,
  })),
}));
vi.mock("@/features/chain", async () =>
  (await import("@/test/fakes/chain")).activeChainHooks({ chainId: 1n }),
);
vi.mock("@/features/fees", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/features/fees")>();
  const { blankFeeChrome, pricedTransferPanel } = await import("@/test/fakes/fees");
  return {
    ...real,
    ...blankFeeChrome(),
    useFeePanel: pricedTransferPanel(real.feeSummary, 10n),
  };
});
vi.mock("@/features/wallet", async () => ({
  ...(await import("@/test/fakes/wallet")).spendFormWalletHooks(),
  // Everything held is within one spend's reach, less the relayer's 10.
  useSpendableMax: () => ({
    max: held.balance - 10n,
    withheld: { reserved: 0n, cooldown: 0n, dust: 0n, slots: 0n },
  }),
}));
vi.mock("../use-top-up-agent", () => ({
  useTopUpAgent: () => {
    const m = fakeActionMutation(mutateAsync);
    return { ...m, mutation: { ...m.mutation, error: held.error } };
  },
}));

const AGENT: StoredAgent = {
  id: "a1",
  label: "research bot",
  chainId: "31337",
  address: "lelantos1agent",
  nsk: "0xdead",
  createdAt: 0,
};

function setup(assets = [USDC, WETH], over: Partial<typeof held> = {}) {
  mutateAsync.mockClear();
  Object.assign(held, { balance: 5_000_000n, error: null }, over);
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

  const send = () => screen.getByRole("button", { name: "Send" });
  const why = () => screen.queryByRole("alert")?.textContent;

  it("holds Send on an unparseable amount and says why", () => {
    setup();
    fill("Top up", "not a number");

    expect(send()).toBeDisabled();
    expect(why()).toBe("Enter the amount as a number");
  });

  it("holds Send on more decimals than the asset keeps", () => {
    // USDC moves in steps of 0.001 here; a fourth place cannot be represented.
    setup();
    fill("Top up", "1.0001");

    expect(send()).toBeDisabled();
    expect(why()).toBe("USDC can't be split that finely");
  });

  it("holds Send on more than the wallet can send", () => {
    setup([USDC, WETH], { balance: 1_000n });
    fill("Top up", "5");

    expect(send()).toBeDisabled();
    expect(why()).toBe("More than you hold");
  });

  it("keeps Send dead, with nothing said, until an amount is entered", () => {
    setup();
    expect(send()).toBeDisabled();
    expect(why()).toBeUndefined();
    fill("Top up", "1");
    expect(send()).not.toBeDisabled();
  });

  it("shows the shielded balance and fills the most that can be sent", () => {
    setup();
    expect(screen.getByText(/Shielded 5,000 USDC/)).toBeTruthy();

    // 4,999,990 circuit units at 0.001 USDC each.
    press("Max");
    expect((screen.getByLabelText("Top up") as HTMLInputElement).value).toBe("4999.99");
    expect(send()).not.toBeDisabled();
  });

  it("caps the relayer fee at the one shown", async () => {
    setup();
    fill("Top up", "1");
    press("Send");

    await waitFor(() => expect(mutateAsync).toHaveBeenCalled());
    expect(mutateAsync.mock.calls[0]?.[0].maxFee).toBe(10n);
  });

  it("says why a top-up failed, in the row", () => {
    setup([USDC, WETH], { error: new Error("relayer unreachable") });
    expect(why()).toBeTruthy();
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
    expect(screen.getByText(/No assets on this network/)).toBeTruthy();
  });
});
