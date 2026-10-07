import { describe, expect, it } from "vitest";
import { handleInFragment } from "./handle-fragment";

describe("handleInFragment", () => {
  it("reads the handle from a hash, with or without its #, decoded", () => {
    expect(handleInFragment("#mehow")).toBe("mehow");
    expect(handleInFragment("mehow.lelantos.xyz")).toBe("mehow.lelantos.xyz");
    expect(handleInFragment("#%40mehow")).toBe("@mehow");
  });

  it("is empty for a hash that carries nothing", () => {
    expect(handleInFragment("#")).toBe("");
    expect(handleInFragment("")).toBe("");
  });

  it("keeps a hash that is not valid percent-encoding as written", () => {
    expect(handleInFragment("#100%")).toBe("100%");
  });
});
