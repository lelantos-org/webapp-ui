import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { fakeWalletApi } from "@/test/fakes/wallet";
import { SHIELDED_ADDRESS } from "@/test/fixtures/addresses";
import { makeAsset, USDC_ASSET } from "@/test/fixtures/assets";
import { fill, press } from "@/test/interact";
import { appWrapper } from "@/test/render";
import { RequestForm } from "./RequestForm";

const DAI = makeAsset(2n, "DAI", { scale: 10n ** 12n });

vi.mock("@/features/assets", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/assets")>()),
  ...(await import("@/test/fakes/assets")).assetReads(() => ({ assets: [USDC_ASSET, DAI] })),
}));
vi.mock("@/features/chain", async () =>
  (await import("@/test/fakes/chain")).activeChainHooks({ chainId: 31337n, chainName: "anvil" }),
);
vi.mock("@/features/wallet", () => ({
  useWalletInstance: () => fakeWalletApi({ address: SHIELDED_ADDRESS }),
}));

const linkFor = (asset: number, amount: string) =>
  `${window.location.origin}/send#to=${SHIELDED_ADDRESS}&asset=${asset}&amount=${amount}&chain=31337`;

describe("RequestForm", () => {
  it("has no link until there is an amount to ask for", () => {
    render(<RequestForm />, { wrapper: appWrapper });
    expect(screen.getByText("Enter an amount to request")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Copy link" })).not.toBeInTheDocument();

    fill("You request", "abc");
    expect(screen.getByText("Enter the amount as a number")).toBeInTheDocument();
  });

  it("builds the link from the amount and the asset, and copies it", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<RequestForm />, { wrapper: appWrapper });

    fill("You request", "12.5");
    expect(screen.getByText("12.5 USDC")).toBeInTheDocument();
    expect(await screen.findByTitle("Payment request for 12.5 USDC")).toBeInTheDocument();

    press("Copy link");
    await screen.findByRole("button", { name: "Copied" });
    expect(writeText).toHaveBeenLastCalledWith(linkFor(1, "12.5"));

    fill("Asset", "2");
    expect(screen.getByTitle(linkFor(2, "12.5"))).toBeInTheDocument();
  });

  it("adds the memo to the link, and withholds the link while the memo is too long", () => {
    render(<RequestForm />, { wrapper: appWrapper });
    fill("You request", "12.5");

    fill("Memo (optional)", "rent, 3B");
    expect(screen.getByTitle(`${linkFor(1, "12.5")}&memo=rent%2C+3B`)).toBeInTheDocument();

    fill("Memo (optional)", "a".repeat(129));
    expect(screen.getByText("That memo is 1 byte too long")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Copy link" })).not.toBeInTheDocument();
  });

  it("does not bound the request by what the wallet holds", () => {
    render(<RequestForm />, { wrapper: appWrapper });
    fill("You request", "1000000");
    expect(screen.queryByText("More than you hold")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy link" })).toBeInTheDocument();
  });
});
