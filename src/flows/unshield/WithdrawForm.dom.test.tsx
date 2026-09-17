import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { FeePanel, FeeSummaryModel } from "@/features/fees";
import { idleFeePanel } from "@/test/fakes/fees";
import { fakeActionMutation } from "@/test/fakes/operation";
import { fakeWalletContext } from "@/test/fakes/wallet";
import { hexAddress } from "@/test/fixtures/addresses";
import { makeAsset } from "@/test/fixtures/assets";
import { fill } from "@/test/interact";
import { appWrapper } from "@/test/render";
import { lastArg } from "@/test/spies";
import { WithdrawForm } from "./WithdrawForm";

const WETH = makeAsset(1n, "WETH", { token: hexAddress("11") });
const USDC = makeAsset(2n, "USDC", { decimals: 6, token: hexAddress("22") });

type PanelInputs = {
  selected: { id: bigint } | undefined;
  feeAsset?: bigint;
  onFeeAsset?: (asset: bigint) => void;
};

const useFeePanel = vi.fn((inputs: PanelInputs): FeePanel => {
  const cross = inputs.feeAsset !== undefined && inputs.feeAsset !== inputs.selected?.id;
  return idleFeePanel({
    model: {
      crossAsset: cross,
      rows: cross ? [{ key: "relayer", asset: { symbol: "USDC" } }] : [],
    } as unknown as FeeSummaryModel,
  });
});
const useSpendableMax = vi.fn(
  (_asset: bigint | undefined, _opts: { feeAsset?: bigint; native?: boolean }) => undefined,
);

vi.mock("@/features/assets", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/assets")>()),
  ...(await import("@/test/fakes/assets")).assetReads(() => ({
    assets: [WETH, USDC],
    balance: 10n ** 18n,
    options: [
      { value: "eth:1", symbol: "ETH", label: "ETH (native)" },
      { value: "1", symbol: "WETH", label: "WETH" },
      { value: "2", symbol: "USDC", label: "USDC" },
    ],
  })),
}));
vi.mock("@/features/chain", async () =>
  (await import("@/test/fakes/chain")).activeChainHooks({ chainId: 1n }),
);
vi.mock("@/features/fees", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/fees")>()),
  ...(await import("@/test/fakes/fees")).blankFeeChrome(),
  useFeePanel: (inputs: PanelInputs) => useFeePanel(inputs),
}));
vi.mock("@/features/wallet", async () => ({
  ...(await import("@/test/fakes/wallet")).spendFormWalletHooks(),
  useSpendableMax: (asset: bigint | undefined, opts: { feeAsset?: bigint; native?: boolean }) =>
    useSpendableMax(asset, opts),
  useWallet: () => fakeWalletContext(),
  useWalletInstance: () => undefined,
}));
vi.mock("./use-withdraw", () => ({ useWithdraw: () => fakeActionMutation() }));

const FOOTNOTE = "The relayer is paid from your USDC balance, not the amount above.";

function renderForm() {
  render(<WithdrawForm />, { wrapper: appWrapper });
  fill("You unshield", "0.5");
  fill("To public address", hexAddress("ab"));
  return {
    pick: (value: string) =>
      fireEvent.change(screen.getByRole("combobox", { name: "Asset" }), { target: { value } }),
    chooseFeeAsset: (asset: bigint) => {
      const { onFeeAsset } = lastArg(useFeePanel);
      if (!onFeeAsset) throw new Error("fee asset picker withheld");
      act(() => onFeeAsset(asset));
    },
  };
}

describe("WithdrawForm, native ETH", () => {
  it("keeps a fee asset chosen before the switch in effect on the native path", () => {
    const { pick, chooseFeeAsset } = renderForm();

    pick("1");
    chooseFeeAsset(USDC.id);
    expect(lastArg(useFeePanel).feeAsset).toBe(USDC.id);
    expect(lastArg(useSpendableMax, 1)).toMatchObject({ feeAsset: USDC.id, native: false });
    expect(screen.getByText(FOOTNOTE)).toBeInTheDocument();

    pick("eth:1");
    expect(lastArg(useFeePanel).feeAsset).toBe(USDC.id);
    expect(lastArg(useFeePanel).onFeeAsset).toBeDefined();
    expect(lastArg(useSpendableMax, 1)).toMatchObject({ feeAsset: USDC.id, native: true });
    expect(screen.getByText(FOOTNOTE)).toBeInTheDocument();
  });
});
