import { RAY } from "@lelantos-org/sdk/core";
import type { SpendableMax } from "@lelantos-org/sdk/wallet";
import { describe, expect, it } from "vitest";
import { balanceHint, withheldHint } from "./balance-hint";

// 0 decimals and unit scale, so the figures in the assertions are the figures
// passed in — this is about which number is chosen, not about formatting.
const META = { symbol: "WETH", decimals: 0, scale: 1n, index: RAY };

describe("balanceHint", () => {
  it("states the balance alone when nothing is in flight", () => {
    expect(balanceHint(1000n, 0n, 0n, META)).toBe("balance 1,000 WETH");
  });

  it("prefers outflow over inflow when both are in flight", () => {
    // Money leaving is the one that can make a later spend fail, so it is the
    // one worth naming.
    expect(balanceHint(1000n, 5n, 7n, META)).toContain("-7");
  });

  it("is absent while the balance is still loading", () => {
    expect(balanceHint(undefined, 0n, 0n, META)).toBeUndefined();
  });
});

// The line explaining a max lower than the balance printed beside it. Without
// it, the app's own max is rejected by its own selector with "insufficient
// unspent value for asset 1: have X, need Y".
describe("withheldHint", () => {
  const spendable = (withheld: Partial<SpendableMax["withheld"]>): SpendableMax =>
    ({
      max: 100n,
      withheld: { reserved: 0n, cooldown: 0n, dust: 0n, slots: 0n, ...withheld },
    }) as SpendableMax;

  it("names the cause, not just the amount", () => {
    expect(withheldHint(spendable({ cooldown: 700n }), META)).toBe("700 WETH still settling");
    expect(withheldHint(spendable({ reserved: 5n }), META)).toBe("5 WETH awaiting an earlier send");
    expect(withheldHint(spendable({ dust: 3n }), META)).toBe("3 WETH below the dust threshold");
  });

  it("calls out the slot cap as consolidatable, since it is the actionable one", () => {
    expect(withheldHint(spendable({ slots: 42n }), META)).toBe("42 WETH needs consolidating");
  });

  it("reports the largest cause when several apply", () => {
    // One clause, not three: this sits inline under the amount field.
    expect(withheldHint(spendable({ cooldown: 700n, dust: 3n }), META)).toBe(
      "700 WETH still settling",
    );
  });

  it("says nothing when everything is reachable", () => {
    expect(withheldHint(spendable({}), META)).toBeUndefined();
  });

  it("says nothing while the figure is still loading", () => {
    expect(withheldHint(undefined, META)).toBeUndefined();
  });
});
