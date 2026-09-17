import { act, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { FeePanel } from "@/features/fees";
import { idleFeePanel } from "@/test/fakes/fees";
import { fakeActionMutation } from "@/test/fakes/operation";
import { ALL_CAPABILITIES, fakeWalletContext } from "@/test/fakes/wallet";
import { hexAddress } from "@/test/fixtures/addresses";
import { makeAsset } from "@/test/fixtures/assets";
import { fill, press, pressAndSettle } from "@/test/interact";
import { appWrapper } from "@/test/render";
import { lastArg } from "@/test/spies";
import { DepositForm } from "./DepositForm";

const USDC = makeAsset(1n, "USDC", { decimals: 6, token: hexAddress("11") });
const WETH = makeAsset(2n, "WETH", { token: hexAddress("22") });
const DAI = makeAsset(3n, "DAI", { token: hexAddress("33") });

type PanelInputs = {
  selected: { id: bigint } | undefined;
  feeAsset?: bigint;
  onFeeAsset?: (asset: bigint) => void;
  deposit?: { asEth: boolean; principal?: bigint };
};
type SetupInputs = { pulls: { asset: { symbol: string }; amount: bigint | undefined }[] };

const useFeePanel = vi.fn((_: PanelInputs): FeePanel => idleFeePanel());
const useDepositSetup = vi.fn((_: SetupInputs) => ({
  needs: { needsSetup: false, willApproveErc20: false },
  assets: [],
  willApproveErc20: () => false,
  applicable: false,
  unknown: false,
  blocked: false,
  open: false,
  show() {},
  dismiss() {},
  complete() {},
}));
const mutateAsync = vi.fn(async (_: unknown) => ({}));

vi.mock("@/features/assets", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/assets")>()),
  ...(await import("@/test/fakes/assets")).assetReads(() => ({ assets: [USDC, WETH, DAI] })),
  useDepositSourceBalance: () => 10n ** 24n,
  ShieldAssetPicker: ({ onChange }: { onChange(next: string): void }) => (
    <div>
      <button type="button" onClick={() => onChange(`eth:${WETH.id}`)}>
        native ETH
      </button>
      <button type="button" onClick={() => onChange(USDC.id.toString())}>
        USDC
      </button>
    </div>
  ),
}));
vi.mock("@/features/chain", async () =>
  (await import("@/test/fakes/chain")).activeChainHooks({ chainId: 1n }),
);
vi.mock("@/features/fees", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/fees")>()),
  FeeDetails: () => null,
  useAssetFeeBps: () => 0n,
  useFeePreview: () => ({
    data: { inAmt: 100_000_000n, fee: 1_000_000n, total: 101_000_000n, feeBps: 100n },
    stale: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useFeeQuote: () => ({
    data: {
      charged: true,
      options: [
        { asset: USDC, amount: 500_000n, balance: 0n, affordable: true },
        { asset: WETH, amount: 10n ** 14n, balance: 0n, affordable: true },
        { asset: DAI, amount: 10n ** 18n, balance: 0n, affordable: true },
      ],
    },
    isError: false,
  }),
  useFeePanel: (inputs: PanelInputs) => useFeePanel(inputs),
}));
vi.mock("@/features/wallet", () => ({
  useWallet: () => fakeWalletContext({ capabilities: ALL_CAPABILITIES }),
  useWalletInstance: () => undefined,
}));
vi.mock("./use-deposit", () => ({ useDeposit: () => fakeActionMutation(mutateAsync) }));
vi.mock("./use-deposit-setup", () => ({
  useDepositSetup: (inputs: SetupInputs) => useDepositSetup(inputs),
}));

function renderForm() {
  render(<DepositForm />, { wrapper: appWrapper });
  fill("You shield", "100");
  return {
    chooseFeeAsset: (asset: bigint) => {
      const { onFeeAsset } = lastArg(useFeePanel);
      if (!onFeeAsset) throw new Error("fee asset picker withheld");
      act(() => onFeeAsset(asset));
    },
    pick: (name: string) => {
      press(/choose another asset/);
      press(name);
    },
  };
}

describe("DepositForm fee asset", () => {
  it("offers the picker, and sizes setup per token once another is chosen", () => {
    const { chooseFeeAsset } = renderForm();
    expect(lastArg(useFeePanel).feeAsset).toBeUndefined();
    expect(lastArg(useFeePanel).deposit).toEqual({ asEth: false, principal: 101_000_000n });

    chooseFeeAsset(DAI.id);
    expect(lastArg(useFeePanel).feeAsset).toBe(DAI.id);
    expect(lastArg(useDepositSetup).pulls.map((p) => [p.asset.symbol, p.amount])).toEqual([
      ["USDC", 101_000_000n],
      ["DAI", 10n ** 18n],
    ]);
    expect(screen.getByText(/permit for USDC and DAI/)).toBeInTheDocument();
  });

  it("sends the chosen fee asset with the deposit", async () => {
    const { chooseFeeAsset } = renderForm();
    chooseFeeAsset(DAI.id);
    await pressAndSettle(/^Shield 100/);
    expect(mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ asset: USDC.id, native: false, feeAsset: DAI.id }),
    );
  });

  it("withholds the picker on native ETH, and restores the choice after", () => {
    const { chooseFeeAsset, pick } = renderForm();
    chooseFeeAsset(DAI.id);

    pick("native ETH");
    expect(lastArg(useFeePanel).onFeeAsset).toBeUndefined();
    expect(lastArg(useFeePanel).feeAsset).toBeUndefined();
    expect(lastArg(useFeePanel).deposit).toEqual({ asEth: true });
    expect(lastArg(useDepositSetup).pulls.map((p) => p.asset.symbol)).toEqual(["WETH"]);

    pick("USDC");
    expect(lastArg(useFeePanel).feeAsset).toBe(DAI.id);
  });
});
