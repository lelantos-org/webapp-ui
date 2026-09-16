// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { asBaseUnits } from "@/shared/domain/units";
import { makeAsset, USDC_ASSET } from "@/test/fixtures/assets";
import { feeBlockReason } from "../model/fee-block";
import { feeLine } from "../model/fee-copy";
import { useFeePanel } from "./use-fee-panel";

const WETH = makeAsset(7n, "WETH");
const USDC = USDC_ASSET;
const DAI = makeAsset(8n, "DAI");
/// A yield variant over USDC's own token.
const YUSDC = makeAsset(9n, "yUSDC", { token: USDC.token, yieldEnabled: true, decimals: 6 });

/// Only the reads are stubbed; the registry join, the model and the block are
/// the real ones, since relabelling has to reach all three.
const stubs = vi.hoisted(() => ({
  feeQuote: {} as Record<string, unknown>,
  publicBalances: new Map<bigint, bigint>(),
  publicRead: [] as bigint[][],
}));

vi.mock("../quote/use-fee-quote", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../quote/use-fee-quote")>()),
  useFeeQuote: () => stubs.feeQuote,
}));

vi.mock("../quote/use-fee-preview", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../quote/use-fee-preview")>()),
  useAssetFeeBps: () => undefined,
}));

vi.mock("@/features/assets", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/assets")>()),
  useRegisteredAssets: () => [WETH, USDC, DAI, YUSDC],
  usePublicBalances: (ids: readonly bigint[]) => {
    stubs.publicRead.push([...ids]);
    return stubs.publicBalances;
  },
}));

function panel({
  spendSymbol,
  affordable = true,
  kind = "withdraw",
}: {
  spendSymbol?: string;
  affordable?: boolean;
  kind?: "withdraw" | "deposit";
}) {
  stubs.feeQuote = {
    data: {
      charged: true,
      options: [
        { asset: WETH, amount: 10n, balance: affordable ? 1_000n : 1n, affordable },
        { asset: USDC, amount: 10n, balance: 1_000n, affordable: true },
      ],
    },
    isError: false,
    isFetching: false,
    isPlaceholderData: false,
  };
  return renderHook(() =>
    useFeePanel({
      kind,
      selected: WETH,
      amount: 1_000n,
      protocol: undefined,
      spendSymbol,
      ...(kind === "deposit" ? { deposit: { asEth: true } as const } : {}),
    }),
  ).result.current;
}

describe("useFeePanel spendSymbol", () => {
  it("names the registry symbol when the form does not override it", () => {
    expect(feeLine(panel({}).model)).toContain("WETH");
  });

  it("names the moved asset as the form does, on every row", () => {
    // Native-ETH unshield: WETH notes are spent, ETH arrives.
    const { model } = panel({ spendSymbol: "ETH" });
    const line = feeLine(model);

    expect(line).toContain("ETH");
    expect(line).not.toContain("WETH");
    expect(model?.rows.every((r) => r.asset.symbol === "ETH")).toBe(true);
    // Both sides relabelled together, so the fee is still same-asset.
    expect(model?.crossAsset).toBe(false);
  });

  it("names it in a shortfall too, leaving other assets alone", () => {
    const { block } = panel({ spendSymbol: "ETH", affordable: false });

    expect(block && feeBlockReason(block)).toBe(
      "Not enough ETH to pay the relayer fee — pay it in USDC instead",
    );
  });
});

describe("useFeePanel on a native-ETH deposit", () => {
  // No picker: the relayer is paid in the wrapped coin out of `msg.value`, and
  // the quote's `affordable` is about shielded notes the deposit never touches.
  it("reports no shortfall against shielded notes, offers no choice, and reads no balance", () => {
    stubs.publicRead = [];
    const p = panel({ kind: "deposit", affordable: false });
    expect(p.block).toBeUndefined();
    expect(p.feeAsset).toBeUndefined();
    expect(stubs.publicRead.flat()).toEqual([]);
  });
});

// A deposit with a picker pays its relayer from the public wallet, so each option
// is judged against that token's public balance.
describe("useFeePanel on an ERC-20 deposit", () => {
  const ONE_USDC = 1_000_000n;

  function deposit({
    balances,
    feeAsset,
    principal = 100n * ONE_USDC,
    charged = true,
    placeholder = false,
  }: {
    balances: [bigint, bigint][];
    feeAsset?: bigint;
    principal?: bigint;
    charged?: boolean;
    placeholder?: boolean;
  }) {
    stubs.publicBalances = new Map(balances);
    stubs.publicRead = [];
    stubs.feeQuote = {
      data: {
        charged,
        // The quote's own verdicts say every option is short: shielded notes,
        // which must not decide a deposit.
        options: [
          { asset: USDC, amount: 500_000n, balance: 0n, affordable: false },
          { asset: DAI, amount: 10n ** 18n, balance: 0n, affordable: false },
          { asset: YUSDC, amount: 400_000n, balance: 0n, affordable: false },
        ],
      },
      isError: false,
      isFetching: false,
      isPlaceholderData: placeholder,
    };
    return renderHook(() =>
      useFeePanel({
        kind: "deposit",
        selected: USDC,
        amount: 100n * ONE_USDC,
        protocol: undefined,
        feeAsset,
        onFeeAsset: () => {},
        deposit: { asEth: false, principal: asBaseUnits(principal) },
      }),
    ).result.current;
  }

  const optionOf = (p: ReturnType<typeof useFeePanel>, id: bigint) =>
    p.feeAsset?.options.find((o) => o.id === id);

  it("offers the quoted assets judged against public balances", () => {
    const p = deposit({
      balances: [
        [USDC.id, 101n * ONE_USDC],
        [DAI.id, 2n * 10n ** 18n],
      ],
    });
    // Same token: 101 USDC covers the 100 principal and the 0.5 fee, and what
    // is stated is what is left for the fee once the principal is taken.
    expect(optionOf(p, USDC.id)).toMatchObject({ affordable: true, balance: ONE_USDC });
    expect(optionOf(p, DAI.id)).toMatchObject({ affordable: true, balance: 2n * 10n ** 18n });
    expect(p.block).toBeUndefined();
  });

  it("leaves out a yield asset other than the one being deposited, and does not read it", () => {
    const p = deposit({ balances: [] });
    expect(p.feeAsset?.options.map((o) => o.symbol)).toEqual(["USDC", "DAI"]);
    expect(stubs.publicRead.at(-1)).not.toContain(YUSDC.id);
    expect(stubs.publicRead.at(-1)).toEqual(expect.arrayContaining([USDC.id, DAI.id]));
  });

  it("counts the principal against a relayer fee in the same token", () => {
    // 100.4 USDC: the principal fits, the fee on top does not.
    const p = deposit({
      balances: [
        [USDC.id, 100_400_000n],
        [DAI.id, 0n],
      ],
    });
    expect(optionOf(p, USDC.id)?.affordable).toBe(false);
    expect(block(p)).toBe("Not enough USDC to pay the relayer fee");
  });

  it("reports a fee-token shortfall, offering the deposit token instead", () => {
    const p = deposit({
      feeAsset: DAI.id,
      balances: [
        [USDC.id, 200n * ONE_USDC],
        [DAI.id, 10n ** 17n],
      ],
    });
    expect(block(p)).toBe("Not enough DAI to pay the relayer fee — pay it in USDC instead");
    // The model states the fee in DAI, beside the principal rather than inside it.
    expect(p.model?.crossAsset).toBe(true);
    expect(p.model?.headlineExtra?.asset.symbol).toBe("DAI");
  });

  it("leaves a principal that overruns its own token to the amount field", () => {
    const p = deposit({ balances: [[USDC.id, 50n * ONE_USDC]] });
    expect(p.block).toBeUndefined();
  });

  it("states an unread balance as unknown: selectable, not short, not zero", () => {
    const p = deposit({ feeAsset: DAI.id, balances: [] });
    expect(optionOf(p, DAI.id)).toMatchObject({ balance: undefined, affordable: true });
    expect(p.block).toBeUndefined();
  });

  it("reads no balance while there is no charge to judge", () => {
    const free = deposit({ balances: [], charged: false });
    expect(free.feeAsset).toBeUndefined();
    expect(free.block).toBeUndefined();
    expect(stubs.publicRead.flat()).toEqual([]);

    // Another chain's quote, kept on screen while this one loads.
    deposit({ balances: [], placeholder: true });
    expect(stubs.publicRead.flat()).toEqual([]);
  });
});

const block = (p: ReturnType<typeof useFeePanel>) => p.block && feeBlockReason(p.block);
