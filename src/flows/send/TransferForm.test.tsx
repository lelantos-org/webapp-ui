// @vitest-environment jsdom
import { ADDRESS_HRP } from "@lelantos-org/sdk";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeAsset } from "@/test/fixtures/assets";
import { appWrapper } from "@/test/render";
import { TransferForm, transferSchema } from "./TransferForm";

// The form, its hooks, `ActionForm` and the fee panel's own copy are real; the
// balance, fee and max reads around them are stubbed.
const WETH = makeAsset(1n, "WETH", { scale: 10n ** 12n });
const sent = vi.hoisted(() => ({ calls: [] as unknown[] }));

vi.mock("@/features/assets", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/assets")>()),
  usePrices: () => new Map(),
  useRegisteredAssets: () => [WETH],
  useAssetBalance: () => ({ asset: 1n, balance: 5_000_000n, notes: 1, pending: 0n, outflow: 0n }),
  useAssetSelectOptions: () => [{ value: "1", symbol: "WETH", label: "WETH" }],
  useBalances: () => ({ isLoading: false }),
}));
vi.mock("@/features/chain", async () => ({
  ...(await import("@/test/fakes/chain")).activeChainHooks({ chainId: 1n }),
  useTxExplorerUrl: () => () => undefined,
}));
vi.mock("@/features/fees", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/features/fees")>();
  return {
    ...real,
    FeeDetails: () => null,
    FeeSummary: () => null,
    useFeePreview: () => ({}),
    useFeePanel: (i: { selected: typeof WETH | undefined; amount: bigint | undefined }) => ({
      model: real.feeSummary({
        kind: "transfer",
        amount: i.amount,
        spendAsset: i.selected,
        protocol: undefined,
        relayer: i.selected ? { amount: 1_000n, asset: i.selected } : undefined,
      }),
      block: undefined,
      pending: false,
      relayerAmount: 1_000n,
    }),
  };
});
vi.mock("@/features/wallet", () => ({
  SyncNotice: () => null,
  useSpendableMax: () => undefined,
  useWalletState: () => ({ error: null }),
  preloadProverWorker: async () => {},
}));
vi.mock("./use-transfer", () => ({
  useTransfer: () => ({
    mutation: {
      mutateAsync: async (input: unknown) => {
        sent.calls.push(input);
        return { txHash: "0x1" };
      },
      isPending: false,
      error: null,
      data: undefined,
      reset() {},
    },
    progress: { steps: [], phase: undefined, done: false, reset() {} },
  }),
}));

/// Produced by `deriveKeysFromNsk(123456789n)` against the installed SDK.
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
    // `b`, `i`, `o` and `1` are excluded; a plain [0-9a-z] regex lets them by.
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
  beforeEach(() => {
    sent.calls = [];
  });

  const why = () => document.querySelector(".action-form__why")?.textContent;

  it("says what is missing under the button, in order", () => {
    render(<TransferForm />, { wrapper: appWrapper });
    expect(why()).toBe("Enter an amount you hold");

    fireEvent.change(screen.getByLabelText("You send"), { target: { value: "0.5" } });
    expect(why()).toBe("Enter a recipient address");

    fireEvent.change(screen.getByLabelText("To"), { target: { value: "lelantos1nope" } });
    expect(why()).toBe("That is not a shielded address");
    expect(screen.getByRole("button", { name: "Review" })).toBeDisabled();

    fireEvent.change(screen.getByLabelText("To"), { target: { value: ADDRESS } });
    expect(why()).toBeUndefined();
    expect(screen.getByRole("button", { name: "Review" })).toBeEnabled();
  });

  it("reviews first, sends on confirm, and keeps everything but the amount", async () => {
    render(<TransferForm />, { wrapper: appWrapper });
    fireEvent.change(screen.getByLabelText("You send"), { target: { value: "0.5" } });
    fireEvent.change(screen.getByLabelText("To"), { target: { value: ADDRESS } });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Review" }));
    });
    expect(screen.getByRole("heading", { name: "Review" })).toBeInTheDocument();
    expect(screen.getByText("To this shielded address")).toBeInTheDocument();
    expect(sent.calls).toEqual([]);

    // Back returns to exactly the form that was reviewed.
    fireEvent.click(screen.getByRole("button", { name: "Back to the form" }));
    expect(screen.getByLabelText("You send")).toHaveValue("0.5");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Review" }));
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Confirm and send" }));
    });
    expect(sent.calls).toEqual([{ amount: 500_000n, asset: 1n, to: ADDRESS, feeAsset: undefined }]);
    expect(screen.getByLabelText("You send")).toHaveValue("");
    expect(screen.getByLabelText("To")).toHaveValue(ADDRESS);
  });
});
