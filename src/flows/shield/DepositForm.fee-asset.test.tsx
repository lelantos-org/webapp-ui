// @vitest-environment jsdom
// Shield's fee asset picker: offered as on the spends, withheld on native ETH,
// and carried to the deposit call.
//
// The form, `useDepositAmount` and `ActionForm` are real; the chain reads around
// them are stubbed, and the fee panel records what it was asked.

import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeWalletContext } from "@/test/fakes/wallet";
import { makeAsset } from "@/test/fixtures/assets";
import { appWrapper } from "@/test/render";
import { DepositForm } from "./DepositForm";

const USDC = makeAsset(1n, "USDC", { decimals: 6, token: `0x${"11".repeat(20)}` });
const WETH = makeAsset(2n, "WETH", { token: `0x${"22".repeat(20)}` });
const DAI = makeAsset(3n, "DAI", { token: `0x${"33".repeat(20)}` });

type PanelInputs = {
  selected: { id: bigint } | undefined;
  feeAsset?: bigint;
  onFeeAsset?: (asset: bigint) => void;
  deposit?: { asEth: boolean; principal?: bigint };
};

const seen = vi.hoisted(() => ({
  panel: [] as PanelInputs[],
  setup: [] as { pulls: { asset: { symbol: string }; amount: bigint | undefined }[] }[],
  mutateAsync: vi.fn(async () => ({})),
}));

vi.mock("@/features/assets", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/assets")>()),
  usePrices: () => new Map(),
  useRegisteredAssets: () => [USDC, WETH, DAI],
  useDepositSourceBalance: () => 10n ** 24n,
  // "Choose an asset", reduced to the two entries these cases pick.
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
vi.mock("@/features/chain", async () => ({
  ...(await import("@/test/fakes/chain")).activeChainHooks({ chainId: 1n }),
  useTxExplorerUrl: () => () => undefined,
}));
vi.mock("@/features/fees", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/fees")>()),
  FeeDetails: () => null,
  useAssetFeeBps: () => 0n,
  // Settled for whatever is typed: 100 USDC plus a 1 USDC protocol fee.
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
  useFeePanel: (inputs: PanelInputs) => {
    seen.panel.push(inputs);
    return { model: undefined, block: undefined, pending: false, relayerAmount: 0n };
  },
}));
vi.mock("@/features/wallet", () => ({
  useWallet: () =>
    fakeWalletContext({
      capabilities: { deposit: { allowed: true }, depositEth: { allowed: true } },
    }),
  useWalletInstance: () => undefined,
}));
vi.mock("./use-deposit", () => ({
  useDeposit: () => ({
    mutation: {
      mutateAsync: seen.mutateAsync,
      isPending: false,
      error: null,
      data: undefined,
      reset() {},
    },
    progress: { steps: [], phase: undefined, done: false, reset() {} },
  }),
}));
// Setup is its own suite's concern; here it only records what it was sized on.
vi.mock("./use-deposit-setup", () => ({
  useDepositSetup: (inputs: (typeof seen.setup)[number]) => {
    seen.setup.push(inputs);
    return {
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
    };
  },
}));

const last = <T,>(xs: T[]): T => {
  const x = xs[xs.length - 1];
  if (x === undefined) throw new Error("never called");
  return x;
};

function renderForm() {
  render(<DepositForm />, { wrapper: appWrapper });
  fireEvent.change(screen.getByLabelText("You shield"), { target: { value: "100" } });
  return {
    chooseFeeAsset: (asset: bigint) => {
      const onFeeAsset = last(seen.panel).onFeeAsset;
      if (!onFeeAsset) throw new Error("fee asset picker withheld");
      act(() => onFeeAsset(asset));
    },
    pick: (name: string) => {
      fireEvent.click(screen.getByRole("button", { name: /choose another asset/ }));
      fireEvent.click(screen.getByRole("button", { name }));
    },
  };
}

beforeEach(() => {
  seen.panel = [];
  seen.setup = [];
  seen.mutateAsync.mockClear();
});

describe("DepositForm fee asset", () => {
  it("offers the picker, and sizes setup per token once another is chosen", () => {
    const { chooseFeeAsset } = renderForm();
    expect(last(seen.panel).feeAsset).toBeUndefined();
    expect(last(seen.panel).deposit).toEqual({ asEth: false, principal: 101_000_000n });

    chooseFeeAsset(DAI.id);
    expect(last(seen.panel).feeAsset).toBe(DAI.id);
    expect(last(seen.setup).pulls.map((p) => [p.asset.symbol, p.amount])).toEqual([
      ["USDC", 101_000_000n],
      ["DAI", 10n ** 18n],
    ]);
    // One permit covers both tokens.
    expect(screen.getByText(/permit for USDC and DAI/)).toBeInTheDocument();
  });

  it("sends the chosen fee asset with the deposit", async () => {
    const { chooseFeeAsset } = renderForm();
    chooseFeeAsset(DAI.id);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^Shield 100/ }));
    });
    expect(seen.mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ asset: USDC.id, native: false, feeAsset: DAI.id }),
    );
  });

  it("withholds the picker on native ETH, and restores the choice after", () => {
    const { chooseFeeAsset, pick } = renderForm();
    chooseFeeAsset(DAI.id);

    pick("native ETH");
    expect(last(seen.panel).onFeeAsset).toBeUndefined();
    expect(last(seen.panel).feeAsset).toBeUndefined();
    expect(last(seen.panel).deposit).toEqual({ asEth: true });
    expect(last(seen.setup).pulls.map((p) => p.asset.symbol)).toEqual(["WETH"]);

    pick("USDC");
    expect(last(seen.panel).feeAsset).toBe(DAI.id);
  });
});
