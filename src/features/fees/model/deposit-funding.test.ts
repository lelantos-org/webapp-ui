import { RAY } from "@lelantos-org/sdk/protocol";
import { describe, expect, it } from "vitest";
import { asBaseUnits } from "@/shared/domain/units";
import { makeAsset } from "@/test/fixtures/assets";
import { type DepositFunding, depositFeeFunding, principalOverruns } from "./deposit-funding";

const USDC = makeAsset(1n, "USDC", { decimals: 6, scale: 100n });
const USDC2 = makeAsset(2n, "USDC2", { decimals: 6, scale: 100n, token: USDC.token.toUpperCase() });
const DAI = makeAsset(3n, "DAI", { scale: 100n, index: (RAY * 3n) / 2n });

const funding = (balances: [bigint, bigint][], principal?: bigint): DepositFunding => ({
  principal: principal === undefined ? undefined : asBaseUnits(principal),
  balances: new Map(balances.map(([id, v]) => [id, asBaseUnits(v)])),
});

describe("depositFeeFunding", () => {
  it("judges a fee over the deposited token against what the principal leaves", () => {
    const f = funding([[USDC2.id, 11_050n]], 10_000n);
    expect(depositFeeFunding({ ...USDC2, amount: 10n }, USDC, f)).toEqual({
      balance: 10n,
      affordable: true,
    });
    expect(depositFeeFunding({ ...USDC2, amount: 11n }, USDC, f)).toEqual({
      balance: 10n,
      affordable: false,
    });
  });

  it("judges a fee in another token against its whole balance, through its index", () => {
    const f = funding([[DAI.id, 1_499n]], 10n ** 9n);
    expect(depositFeeFunding({ ...DAI, amount: 10n }, USDC, f)).toEqual({
      balance: 9n,
      affordable: false,
    });
  });

  it("states an unread balance as unknown, never as a shortfall", () => {
    expect(depositFeeFunding({ ...DAI, amount: 10n }, USDC, funding([], 0n))).toEqual({
      balance: undefined,
      affordable: true,
    });
  });
});

describe("principalOverruns", () => {
  it("holds only when the principal alone exceeds a token the fee is drawn from too", () => {
    const over = funding([[USDC.id, 999n]], 1_000n);
    expect(principalOverruns(USDC2, USDC, over)).toBe(true);
    expect(principalOverruns(DAI, USDC, over)).toBe(false);
    expect(principalOverruns(USDC, USDC, funding([[USDC.id, 1_000n]], 1_000n))).toBe(false);
    expect(principalOverruns(USDC, USDC, funding([], 1_000n))).toBe(false);
    expect(principalOverruns(USDC, USDC, funding([[USDC.id, 0n]]))).toBe(false);
  });
});
