import { ADDRESS_HRP } from "@lelantos-org/sdk/primitives";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeActionMutation } from "@/test/fakes/operation";
import { SHIELDED_ADDRESS as ADDRESS } from "@/test/fixtures/addresses";
import { makeAsset } from "@/test/fixtures/assets";
import { fill, press, pressAndSettle } from "@/test/interact";
import { appWrapper, appWrapperAt } from "@/test/render";
import { TransferForm, transferSchema } from "./TransferForm";

const WETH = makeAsset(1n, "WETH", { scale: 10n ** 12n });
const DAI = makeAsset(2n, "DAI", { scale: 10n ** 12n });
let assets = [WETH];
const mutateAsync = vi.fn(async (_: unknown) => ({ txHash: "0x1" }));

vi.mock("@/features/assets", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/assets")>()),
  ...(await import("@/test/fakes/assets")).assetReads(() => ({ assets, balance: 5_000_000n })),
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
    useFeePanel: pricedTransferPanel(real.feeSummary, 1_000n),
  };
});
vi.mock("@/features/wallet", async () =>
  (await import("@/test/fakes/wallet")).spendFormWalletHooks(),
);
vi.mock("./use-transfer", () => ({ useTransfer: () => fakeActionMutation(mutateAsync) }));

beforeEach(() => {
  assets = [WETH];
});

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

/// The reason under the submit button, when it is held.
const why = () => document.querySelector(".action-form__why")?.textContent;

describe("TransferForm", () => {
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

  it("says why an amount that is not a number cannot be reviewed", () => {
    render(<TransferForm />, { wrapper: appWrapper });
    fill("To", ADDRESS);

    fill("You send", "abc");
    expect(why()).toBe("Enter the amount as a number");

    fill("You send", "0");
    expect(why()).toBe("Enter an amount you hold");
  });

  it("does not open the review on Enter while the form is blocked", async () => {
    render(<TransferForm />, { wrapper: appWrapper });
    fill("You send", "0.5");
    fill("To", "lelantos1nope");

    const enter = () =>
      act(async () => {
        fireEvent.keyDown(screen.getByLabelText("To"), { key: "Enter" });
      });

    await enter();
    expect(screen.queryByRole("heading", { name: "Review" })).not.toBeInTheDocument();
    expect(mutateAsync).not.toHaveBeenCalled();

    fill("To", ADDRESS);
    await enter();
    expect(screen.getByRole("heading", { name: "Review" })).toBeInTheDocument();
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
      // `maxFee` is the relayer fee the review showed.
      [{ amount: 500_000n, asset: 1n, recipient: ADDRESS, feeAsset: undefined, maxFee: 1_000n }],
    ]);
    expect(screen.getByLabelText("You send")).toHaveValue("");
    expect(screen.getByLabelText("To")).toHaveValue(ADDRESS);
  });
});

describe("TransferForm memo", () => {
  it("shows the memo in the review and sends it with the payment", async () => {
    mutateAsync.mockClear();
    render(<TransferForm />, { wrapper: appWrapper });
    fill("You send", "0.5");
    fill("To", ADDRESS);
    fill("Memo (optional)", "INV-0042 · grazie");
    expect(screen.getByText("18 / 128 bytes")).toBeInTheDocument();

    await pressAndSettle("Review");
    expect(screen.getByRole("region", { name: "Memo" })).toHaveTextContent("INV-0042 · grazie");

    await pressAndSettle("Confirm and send");
    expect(mutateAsync.mock.calls).toEqual([
      [
        {
          amount: 500_000n,
          asset: 1n,
          recipient: ADDRESS,
          memo: "INV-0042 · grazie",
          feeAsset: undefined,
          maxFee: 1_000n,
        },
      ],
    ]);
  });

  it("holds the review while the memo is too long, and the field says by how much", () => {
    render(<TransferForm />, { wrapper: appWrapper });
    fill("You send", "0.5");
    fill("To", ADDRESS);

    fill("Memo (optional)", "租".repeat(43));
    expect(screen.getByRole("button", { name: "Review" })).toBeDisabled();
    expect(screen.getByLabelText("Memo (optional)")).toBeInvalid();
    // Said once, by the field.
    expect(screen.getAllByText("That memo is 1 byte too long")).toHaveLength(1);
    expect(why()).toBeUndefined();

    fill("Memo (optional)", "租".repeat(42));
    expect(screen.getByRole("button", { name: "Review" })).toBeEnabled();
  });
});

describe("TransferForm opened from a payment request", () => {
  const openedAt = (fragment: string) => appWrapperAt(`/send#${fragment}`);
  const request = (chain: string) => `to=${ADDRESS}&asset=1&amount=0.5&chain=${chain}`;

  it("fills the form and still asks for a review", async () => {
    render(<TransferForm />, { wrapper: openedAt(request("1")) });

    expect(screen.getByLabelText("You send")).toHaveValue("0.5");
    expect(screen.getByLabelText("To")).toHaveValue(ADDRESS);
    expect(screen.getByText("Payment request · 0.5 WETH")).toBeInTheDocument();
    expect(mutateAsync).not.toHaveBeenCalled();

    await pressAndSettle("Review");
    await pressAndSettle("Confirm and send");
    expect(mutateAsync.mock.calls).toEqual([
      [{ amount: 500_000n, asset: 1n, recipient: ADDRESS, feeAsset: undefined, maxFee: 1_000n }],
    ]);
  });

  it("fills the memo the request asks for, and says it came from the link", async () => {
    mutateAsync.mockClear();
    render(<TransferForm />, { wrapper: openedAt(`${request("1")}&memo=rent%2C+3B`) });

    expect(screen.getByLabelText("Memo (optional)")).toHaveValue("rent, 3B");
    expect(screen.getByText(/The amount, asset, address and memo came from/)).toBeInTheDocument();

    await pressAndSettle("Review");
    await pressAndSettle("Confirm and send");
    expect(mutateAsync.mock.calls[0]?.[0]).toMatchObject({ memo: "rent, 3B" });
  });

  it("keeps the requested asset over the one the page URL opens on", () => {
    assets = [WETH, DAI];
    window.history.replaceState(null, "", "/send?asset=1");
    try {
      render(<TransferForm />, {
        wrapper: openedAt(`to=${ADDRESS}&asset=2&amount=0.5&chain=1`),
      });
      expect(screen.getByLabelText("Asset")).toHaveValue("2");
      expect(screen.getByText("Payment request · 0.5 DAI")).toBeInTheDocument();
    } finally {
      window.history.replaceState(null, "", "/");
    }
  });

  it("leaves the form empty for a request made on another network", () => {
    render(<TransferForm />, { wrapper: openedAt(request("10")) });

    expect(screen.getByLabelText("You send")).toHaveValue("");
    expect(screen.getByLabelText("To")).toHaveValue("");
    expect(screen.getByText("This payment request is for another network")).toBeInTheDocument();
  });

  it("says so when the link cannot be read", () => {
    render(<TransferForm />, { wrapper: openedAt("to=lelantos1nope&asset=1&amount=0.5&chain=1") });

    expect(screen.getByLabelText("To")).toHaveValue("");
    expect(screen.getByText("This payment request can't be read")).toBeInTheDocument();
  });
});
