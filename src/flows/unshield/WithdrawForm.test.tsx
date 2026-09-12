// @vitest-environment jsdom
// A fee asset chosen before switching Unshield to "ETH (native)".
//
// `withdrawEth` takes no `feeAsset`: the relayer is paid from the WETH notes the
// spend already moves. The picker is withheld on that path, but the choice made
// before the switch used to stay live behind it — pricing the relayer row in
// the other asset, saying so in the footnote, and reserving an input slot in
// the max for a cover the spend never takes.
//
// The form, its hooks and `ActionForm` are real; the feature boundaries around
// them are stubbed, and the fee panel and max reads record what they were asked.

import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeWalletContext } from "@/test/fakes/wallet";
import { makeAsset } from "@/test/fixtures/assets";
import { appWrapper } from "@/test/render";
import { WithdrawForm } from "./WithdrawForm";

const WETH = makeAsset(1n, "WETH", { token: `0x${"11".repeat(20)}` });
const USDC = makeAsset(2n, "USDC", { decimals: 6, token: `0x${"22".repeat(20)}` });

type PanelInputs = {
  selected: { id: bigint } | undefined;
  feeAsset?: bigint;
  onFeeAsset?: (asset: bigint) => void;
};

const seen = vi.hoisted(() => ({
  panel: [] as PanelInputs[],
  spendable: [] as { crossAssetFee?: boolean }[],
}));

// The pure helpers (`findAsset`, `nativeEthView`, `useEthAssetField`) are the
// real ones; only the hooks that read the chain or the wallet are replaced.
vi.mock("@/features/assets", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/assets")>()),
  usePrices: () => new Map(),
  useRegisteredAssets: () => [WETH, USDC],
  useAssetBalance: () => ({ balance: 10n ** 18n, pending: 0n, outflow: 0n }),
  useBalances: () => ({ isLoading: false }),
  useAssetSelectOptions: () => [
    { value: "eth:1", symbol: "ETH", label: "ETH (native)" },
    { value: "1", symbol: "WETH", label: "WETH" },
    { value: "2", symbol: "USDC", label: "USDC" },
  ],
}));
vi.mock("@/features/chain", async () => ({
  ...(await import("@/test/fakes/chain")).activeChainHooks({ chainId: 1n }),
  useTxExplorerUrl: () => () => undefined,
}));
vi.mock("@/features/fees", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/fees")>()),
  FeeDetails: () => null,
  FeeSummary: () => null,
  useFeePreview: () => ({}),
  // Stands in for the model's cross-asset rule, so the footnote can be read.
  useFeePanel: (inputs: PanelInputs) => {
    seen.panel.push(inputs);
    const cross = inputs.feeAsset !== undefined && inputs.feeAsset !== inputs.selected?.id;
    return {
      model: {
        crossAsset: cross,
        rows: cross ? [{ key: "relayer", asset: { symbol: "USDC" } }] : [],
      },
      block: undefined,
      pending: false,
      relayerAmount: 0n,
    };
  },
}));
vi.mock("@/features/wallet", () => ({
  SyncNotice: () => null,
  useSpendableMax: (_asset: bigint | undefined, opts: { crossAssetFee?: boolean }) => {
    seen.spendable.push(opts);
    return undefined;
  },
  useWallet: () => fakeWalletContext(),
  useWalletInstance: () => undefined,
  useWalletState: () => ({ error: null }),
  preloadProverWorker: async () => {},
}));
vi.mock("./use-withdraw", () => ({
  useWithdraw: () => ({
    mutation: { mutateAsync: vi.fn(), isPending: false, error: null, data: undefined, reset() {} },
    progress: { steps: [], phase: undefined, done: false, reset() {} },
  }),
}));

const last = <T,>(xs: T[]): T => {
  const x = xs[xs.length - 1];
  if (x === undefined) throw new Error("never called");
  return x;
};

const FOOTNOTE = "The relayer is paid from your USDC balance, not the amount above.";

function renderForm() {
  render(<WithdrawForm />, { wrapper: appWrapper });
  // A complete form, so the CTA's line is the footnote rather than a blocked
  // reason standing in its place.
  fireEvent.change(screen.getByLabelText("You unshield"), { target: { value: "0.5" } });
  fireEvent.change(screen.getByLabelText("To public address"), {
    target: { value: `0x${"ab".repeat(20)}` },
  });
  return {
    pick: (value: string) =>
      fireEvent.change(screen.getByRole("combobox", { name: "Asset" }), { target: { value } }),
    chooseFeeAsset: (asset: bigint) => {
      const onFeeAsset = last(seen.panel).onFeeAsset;
      if (!onFeeAsset) throw new Error("fee asset picker withheld");
      act(() => onFeeAsset(asset));
    },
  };
}

beforeEach(() => {
  seen.panel = [];
  seen.spendable = [];
});

describe("WithdrawForm, native ETH", () => {
  it("ignores a fee asset chosen before the switch, and restores it after", () => {
    const { pick, chooseFeeAsset } = renderForm();

    pick("1");
    chooseFeeAsset(USDC.id);
    expect(last(seen.panel).feeAsset).toBe(USDC.id);
    expect(last(seen.spendable).crossAssetFee).toBe(true);
    expect(screen.getByText(FOOTNOTE)).toBeInTheDocument();

    pick("eth:1");
    expect(last(seen.panel).feeAsset).toBeUndefined();
    expect(last(seen.panel).onFeeAsset).toBeUndefined();
    expect(last(seen.spendable).crossAssetFee).toBe(false);
    expect(screen.queryByText(FOOTNOTE)).toBeNull();

    // The stored choice survives the native detour.
    pick("1");
    expect(last(seen.panel).feeAsset).toBe(USDC.id);
    expect(last(seen.spendable).crossAssetFee).toBe(true);
  });
});
