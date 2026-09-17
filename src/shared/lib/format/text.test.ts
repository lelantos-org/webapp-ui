import { describe, expect, it } from "vitest";
import { capitalizeFirst, joinHint, plural } from "./text";

describe("joinHint", () => {
  it("drops the fragments that have nothing to say", () => {
    expect(joinHint("balance 1 USDC", undefined, "fee 0.003")).toBe("balance 1 USDC · fee 0.003");
  });

  it("is undefined rather than empty when every fragment is absent", () => {
    expect(joinHint(undefined, undefined)).toBeUndefined();
  });
});

describe("capitalizeFirst", () => {
  it("moves only the first letter", () => {
    expect(capitalizeFirst("generate proof")).toBe("Generate proof");
    expect(capitalizeFirst("this signature IS your key")).toBe("This signature IS your key");
  });

  it("leaves an empty string empty", () => {
    expect(capitalizeFirst("")).toBe("");
  });
});

describe("plural", () => {
  it("counts in the singular only for one", () => {
    expect(plural(1, "link")).toBe("1 link");
    expect(plural(0, "link")).toBe("0 links");
    expect(plural(3, "link")).toBe("3 links");
  });

  it("takes an irregular plural", () => {
    expect(plural(1, "copy", "copies")).toBe("1 copy");
    expect(plural(2, "copy", "copies")).toBe("2 copies");
  });
});
