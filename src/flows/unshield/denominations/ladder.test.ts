import { PUBLIC_IN_MAX, RAY, universalLadder } from "@lelantos-org/sdk/protocol";
import { describe, expect, it } from "vitest";
import type { AssetMeta } from "@/features/op-form";
import { parseAmountInput } from "@/shared/lib/format/asset";
import { type LadderInputs, ladderModel } from "./ladder";

// Mainnet USDC: 6 decimals, unit scale, so a circuit unit is a base unit and the
// ladder integers below read as the on-chain figures they are. The `token` is
// load-bearing — it is what `ladderModel` looks up to decide whether these rungs
// are the shared ones other wallets publish.
const USDC: AssetMeta = {
  symbol: "USDC",
  decimals: 6,
  scale: 1n,
  index: RAY,
  token: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
};

// The shape of the built-in table — {1,2,5} × powers of ten — at three rungs.
const TEN = 10_000_000n;
const TWENTY = 20_000_000n;
const FIFTY = 50_000_000n;
const LADDER = [TEN, TWENTY, FIFTY];

// The dev stack's mock DAI: 18 decimals against a 1e10 scale, so one token is
// 1e8 circuit units. It used to be absent from the SDK's six-entry table and
// therefore had no shared ladder; since 0.32.0 the ladder is derived from the
// asset itself, so this asset is no longer a special case.
const MDAI: AssetMeta = {
  symbol: "mDAI",
  decimals: 18,
  scale: 10n ** 10n,
  index: RAY,
  token: "0xdev1",
};

// A yield index that makes every rung a non-round number of token units — the
// case where a capped label and the written amount visibly diverge.
const YIELDING: AssetMeta = {
  symbol: "yWETH",
  decimals: 18,
  scale: 10n ** 10n,
  index: (RAY * 1_179_551_100_000_000_000n) / 1_000_000_000_000_000_000n,
  token: "0xdev2",
};

const model = (over: Partial<LadderInputs> = {}) =>
  ladderModel({ ladder: LADDER, meta: USDC, amount: undefined, max: undefined, ...over });

const values = (m: ReturnType<typeof ladderModel>) => m.options.map((o) => o.value);
const stateOf = (m: ReturnType<typeof ladderModel>, value: bigint) =>
  m.options.find((o) => o.value === value)?.state;
const suggested = (m: ReturnType<typeof ladderModel>) =>
  m.options.find((o) => o.state === "suggested")?.value;

describe("ladderModel options", () => {
  // The property the whole module rests on: a chip writes text, the form parses
  // that text, and the parsed value is what `withdraw` publishes. A formatter
  // that did not invert would put the user off the ladder while telling them
  // they were on it. `ladder.ts` writes the text and `parseAmountInput` reads
  // it back, so if only one side learns about the index — or about a capped
  // label — the chip silently stops meaning what it says.
  it.each<[string, AssetMeta, readonly bigint[]]>([
    ["a plain asset", USDC, LADDER],
    ["an asset whose index has moved 10%", { ...USDC, index: (RAY * 11n) / 10n }, LADDER],
    ["a ladder derived from the asset", MDAI, universalLadder(MDAI)],
    ["a yielding asset whose label is capped", YIELDING, universalLadder(YIELDING)],
  ])("writes text that parses back to the rung exactly, for %s", (_label, meta, ladder) => {
    const { options } = model({ ladder, meta });
    expect(options.length).toBeGreaterThan(0);
    for (const { value, text } of options) {
      expect(parseAmountInput(text, meta)).toBe(value);
    }
  });

  it("offers only what a spend can cover", () => {
    expect(values(model({ max: TWENTY }))).toEqual([TEN, TWENTY]);
  });

  it("offers the whole ladder while the ceiling is unknown", () => {
    expect(values(model())).toEqual(LADDER);
  });

  it("drops denominations past the publicOut cap", () => {
    // `validateAmount` rejects these, so a chip for one is a dead button.
    expect(values(model({ ladder: [...LADDER, PUBLIC_IN_MAX + 1n] }))).toEqual(LADDER);
  });

  it("marks the entered denomination as chosen", () => {
    const m = model({ amount: TWENTY });
    expect(stateOf(m, TWENTY)).toBe("chosen");
    expect(stateOf(m, TEN)).toBe("plain");
  });
});

describe("ladderModel suggestion", () => {
  it("points at the nearest denomination for an off-ladder amount", () => {
    expect(suggested(model({ amount: 21_000_000n }))).toBe(TWENTY);
  });

  it("only ever points at a denomination that is offered", () => {
    // `nearest` rounds to whichever side is closer, so over the whole ladder it
    // would pick 50 here — an amount the selector then refuses. Drawing the
    // suggestion from the offered set is what keeps the advice actionable.
    const m = model({ amount: 49_000_000n, max: 30_000_000n });
    expect(suggested(m)).toBe(TWENTY);
    expect(values(m)).toContain(TWENTY);
  });

  it("suggests nothing when no denomination is within reach", () => {
    const m = model({ amount: 5_000_000n, max: 9_000_000n });
    expect(m.options).toEqual([]);
    expect(suggested(m)).toBeUndefined();
  });

  it("suggests nothing for an amount already on the ladder", () => {
    expect(suggested(model({ amount: TWENTY }))).toBeUndefined();
  });

  it("does not suggest against an on-ladder amount the balance cannot cover", () => {
    // Unaffordable is `validateAmount`'s complaint and the selector's, not this
    // control's: 50 is a shared denomination however little the wallet holds.
    const m = model({ amount: FIFTY, max: TWENTY });
    expect(m.notice?.tone).toBe("ok");
    expect(suggested(m)).toBeUndefined();
  });
});

describe("ladderModel notice", () => {
  it("says nothing at all for an asset with no ladder", () => {
    // Falsy notice is what tells the field to render nothing; see
    // `DenominationField`. This is also the in-flight state: the ladder query is
    // unresolved, and the control stays absent rather than asserting "no shared
    // ladder covers this asset" about an asset that may well have one.
    const m = model({ ladder: [], amount: TWENTY });
    expect(m.notice).toBeUndefined();
    expect(m.options).toEqual([]);
  });

  it("explains the control before anything is entered, without a verdict", () => {
    // Standing rather than appearing on the first keystroke: a line that grows
    // in moves the submit button under the pointer.
    const m = model();
    expect(m.notice?.tag).toBeUndefined();
    expect(m.notice?.tone).toBe("ok");
    expect(m.notice?.text).toContain("many others publish");
  });

  it("treats a zero or mid-edit amount as nothing entered", () => {
    expect(model({ amount: 0n }).notice?.tag).toBeUndefined();
    expect(model({ amount: undefined }).notice?.tag).toBeUndefined();
  });

  it("confirms an on-ladder amount", () => {
    const n = model({ amount: TWENTY }).notice;
    expect(n?.tone).toBe("ok");
    expect(n?.tag).toBe("blends in");
  });

  it("keeps the intro ahead of the verdict, as unshield.dc reads", () => {
    // The verdict alone is a claim with no reason attached.
    expect(model({ amount: TWENTY }).notice?.text).toBe(
      "Withdrawing one of these amounts publishes a figure many others publish too. " +
        "20 USDC is a shared denomination, so this withdrawal looks like every other one for it.",
    );
    expect(model({ amount: 21_000_000n }).notice?.text).toMatch(
      /^Withdrawing one of these amounts publishes a figure many others publish too\. 21 USDC is published/,
    );
  });

  it("states the verdict for the observer panel", () => {
    expect(model().verdict).toBeUndefined();
    expect(model({ amount: 0n }).verdict).toBeUndefined();
    expect(model({ amount: TWENTY }).verdict).toBe("on");
    expect(model({ amount: 21_000_000n }).verdict).toBe("off");
    // No ladder: nothing to be on or off.
    expect(model({ ladder: [], amount: TWENTY }).verdict).toBeUndefined();
  });

  it("warns about an off-ladder amount and names the alternative", () => {
    const n = model({ amount: 21_000_000n }).notice;
    expect(n?.tone).toBe("warn");
    expect(n?.tag).toBe("stands out");
    // Both figures: what is being published, and what to publish instead.
    expect(n?.text).toContain("21 USDC");
    expect(n?.text).toContain("20 USDC");
  });

  it("warns without an alternative when none is affordable", () => {
    const n = model({ amount: 5_000_000n, max: 9_000_000n }).notice;
    expect(n?.tone).toBe("warn");
    expect(n?.text).toContain("No shared denomination");
  });

  it("omits the symbol for an asset that has none", () => {
    // Token kept: this asserts the symbol is omitted, not that the source
    // changed — dropping it would silently reword the whole notice.
    const n = model({
      amount: TWENTY,
      meta: { decimals: 6, scale: 1n, index: RAY, token: USDC.token },
    }).notice;
    expect(n?.text).toContain("20 is a shared denomination");
  });
});

// Every ladder reaches the model the same way — through `wallet.asset().ladder`
// — and since SDK 0.32.0 they all have the same provenance: derived from the
// asset's own `scale` and `decimals`, identically in every wallet. These cover
// what the wording may therefore claim.
describe("ladderModel source", () => {
  const ONE = 10n ** 8n;
  const DERIVED = universalLadder(MDAI);

  const fb = (over: Partial<LadderInputs> = {}) =>
    ladderModel({ ladder: DERIVED, meta: MDAI, amount: undefined, max: undefined, ...over });

  /**
   * The SDK derives the same rungs for every wallet holding an asset, so every
   * rung is shared: there is no round-but-not-shared case.
   */
  it("reads every asset's rungs as shared, table or not", () => {
    expect(model({ amount: TWENTY }).notice?.text).toContain("is a shared denomination");
    expect(fb({ amount: ONE }).notice?.text).toContain("is a shared denomination");
    expect(fb().notice?.text).toContain("many others publish");
  });

  it("still warns about an off-ladder amount", () => {
    const n = fb({ amount: ONE + ONE / 3n }).notice;
    expect(n?.tone).toBe("warn");
    expect(n?.tag).toBe("stands out");
    expect(n?.text).toContain("links this withdrawal");
  });

  it("names the shortfall as a shared denomination", () => {
    expect(fb({ max: 1n }).notice?.text).toContain("below the smallest shared denomination");
    expect(model({ max: 9_000_000n }).notice?.text).toContain(
      "below the smallest shared denomination",
    );
  });
});

describe("chip label vs written text", () => {
  const options = ladderModel({
    ladder: universalLadder(YIELDING),
    meta: YIELDING,
    amount: undefined,
    max: undefined,
  }).options;

  it("caps the label at five fractional digits", () => {
    expect(options.length).toBeGreaterThan(0);
    for (const o of options) {
      const frac = o.label.split(".")[1] ?? "";
      // Dust below the cap is allowed to run longer rather than read as "0";
      // every chip with a whole part must obey the cap.
      if (!o.label.startsWith("0.")) {
        expect(frac.length).toBeLessThanOrEqual(5);
      }
    }
  });

  // `label` is a caption; `text` is the amount (round-tripped above). Unless the
  // two differ here, that round trip proves nothing about the cap.
  it("actually differs — otherwise the capped case proves nothing", () => {
    expect(options.some((o) => o.label !== o.text)).toBe(true);
  });
});
