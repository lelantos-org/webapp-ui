import { ADDRESS_HRP } from "@lelantos-org/sdk/primitives";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { fakeActionMutation } from "@/test/fakes/operation";
import { makeAsset } from "@/test/fixtures/assets";
import { fill, press, pressAndSettle } from "@/test/interact";
import { appWrapper } from "@/test/render";
import { TransferForm, transferSchema } from "./TransferForm";

const WETH = makeAsset(1n, "WETH", { scale: 10n ** 12n });
const mutateAsync = vi.fn(async (_: unknown) => ({ txHash: "0x1" }));

vi.mock("@/features/assets", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/assets")>()),
  ...(await import("@/test/fakes/assets")).assetReads(() => ({
    assets: [WETH],
    balance: 5_000_000n,
  })),
}));
vi.mock("@/features/chain", async () =>
  (await import("@/test/fakes/chain")).activeChainHooks({ chainId: 1n }),
);
vi.mock("@/features/fees", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/features/fees")>();
  const { blankFeeChrome, idleFeePanel } = await import("@/test/fakes/fees");
  return {
    ...real,
    ...blankFeeChrome(),
    useFeePanel: (i: { selected: typeof WETH | undefined; amount: bigint | undefined }) =>
      idleFeePanel({
        model: real.feeSummary({
          kind: "transfer",
          amount: i.amount,
          spendAsset: i.selected,
          protocol: undefined,
          relayer: i.selected ? { amount: 1_000n, asset: i.selected } : undefined,
        }),
        relayerAmount: 1_000n,
      }),
  };
});
vi.mock("@/features/wallet", async () =>
  (await import("@/test/fakes/wallet")).spendFormWalletHooks(),
);
vi.mock("./use-transfer", () => ({ useTransfer: () => fakeActionMutation(mutateAsync) }));

const ADDRESS =
  "lelantos1mzzmpusj5uw9jktrllg86psuvjsght583tvlaj0gt5pywqwx3krgyp5h37paffcqkjnrx8zegjcldfgpchw0p6d773g657e5jvfluydsr5za9sgdvm8pdauhzkrzng5tzwpgg2qyhaykrv887pgvsz599ua4r0dl";

function parseTo(to: string) {
  return transferSchema.safeParse({ to, amount: "1.0", asset: "1" });
}

describe("transferSchema.to", () => {
  it("accepts a real derived address", () => {
    expect(parseTo(ADDRESS).success).toBe(true);
  });

  it("is pinned to the SDK's HRP", () => {
    expect(ADDRESS.startsWith(`${ADDRESS_HRP}1`)).toBe(true);
  });

  it("rejects characters outside the bech32 charset", () => {
    for (const c of ["b", "i", "o", "1"]) {
      const swapped = `${ADDRESS.slice(0, -1)}${c}`;
      expect(parseTo(swapped).success, `char ${c}`).toBe(false);
    }
  });

  it("rejects a truncated or padded address", () => {
    expect(parseTo(ADDRESS.slice(0, -1)).success).toBe(false);
    expect(parseTo(`${ADDRESS}q`).success).toBe(false);
  });

  it("rejects an EVM address and empty input", () => {
    expect(parseTo("0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266").success).toBe(false);
    expect(parseTo("").success).toBe(false);
  });
});

describe("TransferForm", () => {
  const why = () => document.querySelector(".action-form__why")?.textContent;

  it("says what is missing under the button, in order", () => {
    render(<TransferForm />, { wrapper: appWrapper });
    expect(why()).toBe("Enter an amount you hold");

    fill("You send", "0.5");
    expect(why()).toBe("Enter a recipient address");

    fill("To", "lelantos1nope");
    expect(why()).toBe("That is not a shielded address");
    expect(screen.getByRole("button", { name: "Review" })).toBeDisabled();

    fill("To", ADDRESS);
    expect(why()).toBeUndefined();
    expect(screen.getByRole("button", { name: "Review" })).toBeEnabled();
  });

  it("reviews first, sends on confirm, and keeps everything but the amount", async () => {
    render(<TransferForm />, { wrapper: appWrapper });
    fill("You send", "0.5");
    fill("To", ADDRESS);

    await pressAndSettle("Review");
    expect(screen.getByRole("heading", { name: "Review" })).toBeInTheDocument();
    expect(screen.getByText("To this shielded address")).toBeInTheDocument();
    expect(mutateAsync).not.toHaveBeenCalled();

    press("Back to the form");
    expect(screen.getByLabelText("You send")).toHaveValue("0.5");
    await pressAndSettle("Review");

    await pressAndSettle("Confirm and send");
    expect(mutateAsync.mock.calls).toEqual([
      [{ amount: 500_000n, asset: 1n, recipient: ADDRESS, feeAsset: undefined }],
    ]);
    expect(screen.getByLabelText("You send")).toHaveValue("");
    expect(screen.getByLabelText("To")).toHaveValue(ADDRESS);
  });
});
