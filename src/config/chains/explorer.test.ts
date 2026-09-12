import { describe, expect, it } from "vitest";
import { txExplorerUrl } from "./explorer";

describe("txExplorerUrl", () => {
  it("links the tx under the chain's explorer", () => {
    expect(txExplorerUrl("https://basescan.org", "0xabc")).toBe("https://basescan.org/tx/0xabc");
  });

  it("does not double the slash of a base written with one", () => {
    expect(txExplorerUrl("https://basescan.org/", "0xabc")).toBe("https://basescan.org/tx/0xabc");
  });

  // Rendered as plain text by callers, rather than as a link to nowhere.
  it("gives no link for a chain without an explorer", () => {
    expect(txExplorerUrl(undefined, "0xabc")).toBeUndefined();
    expect(txExplorerUrl("", "0xabc")).toBeUndefined();
  });
});
