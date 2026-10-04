import { describe, expect, it } from "vitest";
import { recoveredSentence } from "./RecoverLinks";

describe("recoveredSentence", () => {
  it("says so when the wallet never made a link on the chain", () => {
    expect(recoveredSentence({ funded: 0, unclaimed: 0, restored: 0 }, "Base")).toBe(
      "This wallet has not made a link on Base.",
    );
  });

  it("says every link was claimed when none holds funds", () => {
    expect(recoveredSentence({ funded: 3, unclaimed: 0, restored: 0 }, "Base")).toBe(
      "Every one of this wallet's 3 links on Base has been claimed.",
    );
  });

  it("counts the unclaimed links and how many were added", () => {
    expect(recoveredSentence({ funded: 3, unclaimed: 2, restored: 1 }, "Base")).toBe(
      "2 unclaimed links on Base, 1 added to this list.",
    );
    expect(recoveredSentence({ funded: 1, unclaimed: 1, restored: 0 }, "Base")).toBe(
      "1 unclaimed link on Base, all already in this list.",
    );
  });
});
