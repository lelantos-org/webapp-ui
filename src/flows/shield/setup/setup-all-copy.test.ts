// The setup card on Shield is an invitation, not a gate, so its copy has to say
// whether the deposit on screen needs it — and never promise more than the
// AllowanceTransfer path delivers (one wallet confirmation, not zero).

import { describe, expect, it } from "vitest";
import { joinNames, setupAllCopy } from "./setup-all-copy";

describe("joinNames", () => {
  it("joins with commas and a final and", () => {
    expect(joinNames(["USDC"])).toBe("USDC");
    expect(joinNames(["USDC", "WBTC"])).toBe("USDC and WBTC");
    expect(joinNames(["USDC", "DAI", "WBTC"])).toBe("USDC, DAI and WBTC");
  });
});

describe("setupAllCopy", () => {
  it("matches shield.dc for two tokens while ETH is selected", () => {
    const c = setupAllCopy(["USDC", "WBTC"], { symbol: "ETH", native: true });
    expect(c.title).toBe("USDC and WBTC need one-time setup");
    expect(c.short).toBe("One-time setup for 2 tokens");
    expect(c.body).toMatch(/^Not needed for this deposit — ETH never requires it\. /);
    expect(c.body).toMatch(/shielding those two later/);
  });

  it("says an approved token is already set up, rather than that it never needs it", () => {
    expect(setupAllCopy(["WBTC"], { symbol: "USDC", native: false }).body).toMatch(
      /USDC is already set up/,
    );
  });

  it("makes no claim about the current deposit when it is not known", () => {
    const c = setupAllCopy(["USDC"], undefined);
    expect(c.title).toBe("USDC needs one-time setup");
    expect(c.body).not.toMatch(/this deposit/);
  });

  it("counts rather than lists past three", () => {
    expect(setupAllCopy(["A", "B", "C", "D"], undefined).title).toBe(
      "4 tokens need one-time setup",
    );
  });
});
