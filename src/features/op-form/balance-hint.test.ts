import { RAY } from "@lelantos-org/sdk/core";
import type { SpendableMax } from "@lelantos-org/sdk/wallet";
import { describe, expect, it } from "vitest";
import { settlingHint, withheldHint } from "./balance-hint";

// 0 decimals and unit scale, so the figures in the assertions are the figures
// passed in — this is about which number is chosen, not about formatting.
const META = { symbol: "WETH", decimals: 0, scale: 1n, index: RAY };

describe("settlingHint", () => {
  it("names the settling delta with its sign", () => {
    expect(settlingHint(1000n, 5n, 0n, META)).toBe("Settling +5 WETH");
    expect(settlingHint(1000n, 5n, 7n, META)).toBe("Settling −7 WETH");
  });

  it("says nothing when nothing is in flight or the balance is loading", () => {
    expect(settlingHint(1000n, 0n, 0n, META)).toBeUndefined();
    expect(settlingHint(undefined, 5n, 0n, META)).toBeUndefined();
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

  it("leaves the slot cap to MaxNotice, which explains it properly", () => {
    // "Needs consolidating" named a remedy the user cannot perform (#04).
    expect(withheldHint(spendable({ slots: 42n }), META)).toBeUndefined();
    expect(withheldHint(spendable({ slots: 42n, cooldown: 3n }), META)).toBe(
      "3 WETH still settling",
    );
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
