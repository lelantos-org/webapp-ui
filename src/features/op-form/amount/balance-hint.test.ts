import type { SpendableMax } from "@lelantos-org/sdk";
import { RAY } from "@lelantos-org/sdk/protocol";
import { describe, expect, it } from "vitest";
import { heldReason, maxNoticeCopy, settlingHint, spendReach, withheldHint } from "./balance-hint";

const META = { symbol: "WETH", decimals: 0, scale: 1n, index: RAY };

describe("settlingHint", () => {
  it("names the settling delta with its sign", () => {
    expect(settlingHint(1000n, 5n, 0n, META)).toBe("Settling +5 WETH");
    expect(settlingHint(1000n, 5n, 7n, META)).toBe("Settling −7 WETH");
  });

  it("keeps the sign and drops the figure when masked", () => {
    expect(settlingHint(1000n, 5n, 0n, META, true)).toBe("Settling +•••• WETH");
    expect(settlingHint(1000n, 5n, 7n, META, true)).toBe("Settling −•••• WETH");
  });

  it("says nothing when nothing is in flight or the balance is loading", () => {
    expect(settlingHint(1000n, 0n, 0n, META)).toBeUndefined();
    expect(settlingHint(undefined, 5n, 0n, META)).toBeUndefined();
  });
});

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

  it("names the cause without the amount when masked", () => {
    expect(withheldHint(spendable({ cooldown: 700n }), META, true)).toBe(
      "•••• WETH still settling",
    );
    const { symbol: _, ...bare } = META;
    expect(withheldHint(spendable({ dust: 3n }), bare, true)).toBe("•••• below the dust threshold");
  });

  it("leaves the slot cap to MaxNotice, which explains it properly", () => {
    expect(withheldHint(spendable({ slots: 42n }), META)).toBeUndefined();
    expect(withheldHint(spendable({ slots: 42n, cooldown: 3n }), META)).toBe(
      "3 WETH still settling",
    );
  });

  it("reports the largest cause when several apply", () => {
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

const USDC = { symbol: "USDC", decimals: 6, scale: 1n, index: RAY };

const spendable = (max: bigint, withheld: Partial<SpendableMax["withheld"]>): SpendableMax =>
  ({
    max,
    withheld: { reserved: 0n, cooldown: 0n, dust: 0n, slots: 0n, ...withheld },
  }) as SpendableMax;

describe("maxNoticeCopy", () => {
  it("says what send.dc says when the slot cap holds value back", () => {
    const c = maxNoticeCopy({
      spendable: spendable(3_180_000_000n, { slots: 5_240_000_000n }),
      meta: USDC,
      verb: "Sending",
    });
    expect(c).toBeDefined();
    expect(`Max is ${c?.max}${c?.tail}`).toBe(
      "Max is 3,180.00 — the most you can move at once. The rest of your balance is still there.",
    );
    expect(c?.follow).toBe("Sending raises this limit on its own, so nothing is stuck.");
  });

  it("names the op in the reassurance", () => {
    const c = maxNoticeCopy({
      spendable: spendable(1n, { slots: 1n }),
      meta: USDC,
      verb: "Unshielding",
    });
    expect(c?.follow).toMatch(/^Unshielding raises this limit/);
  });

  it("stays silent for causes that only need time", () => {
    expect(
      maxNoticeCopy({
        spendable: spendable(100n, { cooldown: 50n, reserved: 5n, dust: 1n }),
        meta: USDC,
        verb: "Sending",
      }),
    ).toBeUndefined();
  });

  it("keeps the wallet's internals out of the sentence", () => {
    const c = maxNoticeCopy({
      spendable: spendable(1n, { slots: 1n }),
      meta: USDC,
      verb: "Sending",
    });
    expect(`${c?.tail} ${c?.follow}`).not.toMatch(/note|slot|consolidat|circuit/i);
  });

  it("stays silent while the ceiling is unknown", () => {
    expect(maxNoticeCopy({ spendable: undefined, meta: USDC, verb: "Sending" })).toBeUndefined();
  });
});

describe("spendReach", () => {
  const spendable = {
    max: 100n,
    withheld: { reserved: 0n, cooldown: 20n, dust: 0n, slots: 50n },
  } as unknown as SpendableMax;

  it("is direct up to the max, and while the max is unknown", () => {
    expect(spendReach(100n, spendable)).toBe("direct");
    expect(spendReach(500n, undefined)).toBe("direct");
    expect(spendReach(undefined, spendable)).toBe("direct");
  });

  it("needs a merge for what only the slot cap holds back", () => {
    expect(spendReach(101n, spendable)).toBe("merge");
    expect(spendReach(150n, spendable)).toBe("merge");
  });

  it("is held beyond what a merge can free", () => {
    expect(spendReach(151n, spendable)).toBe("held");
    expect(heldReason(spendable, META)).toBe(
      "150 WETH is the most you can send right now: 20 WETH still settling",
    );
  });
});
