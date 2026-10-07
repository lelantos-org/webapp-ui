import { describe, expect, it } from "vitest";
import { handleStatus } from "./handle-status";

const PARENTS = ["lelantos.xyz"];
const MEHOW = { label: "mehow", name: "mehow.lelantos.xyz" };
const typed = { ok: true, value: MEHOW } as const;
const bad = (error: "empty" | "label" | "parent") => ({ ok: false, error }) as const;
const check = (label: string | undefined, available?: boolean, failed = false) => ({
  label,
  available,
  failed,
});

describe("handleStatus", () => {
  it("is empty for an empty field, with nothing asked of the registrar", () => {
    expect(handleStatus(bad("empty"), PARENTS, check(undefined))).toEqual({ kind: "empty" });
  });

  it("says why text is not a handle", () => {
    expect(handleStatus(bad("label"), PARENTS, check(undefined))).toEqual({
      kind: "invalid",
      problem: expect.stringContaining("3 to 32 characters"),
    });
    expect(handleStatus(bad("parent"), PARENTS, check(undefined))).toEqual({
      kind: "invalid",
      problem: expect.stringContaining(".lelantos.xyz"),
    });
  });

  it("is checking until the registrar has answered for this very label", () => {
    const checking = { kind: "checking", handle: MEHOW };
    expect(handleStatus(typed, PARENTS, check(undefined))).toEqual(checking);
    // The answer in hand is for what was typed a moment ago.
    expect(handleStatus(typed, PARENTS, check("meho", true))).toEqual(checking);
    expect(handleStatus(typed, PARENTS, check("mehow"))).toEqual(checking);
  });

  it("reports the registrar's answer, for the handle it is about", () => {
    expect(handleStatus(typed, PARENTS, check("mehow", true))).toEqual({
      kind: "available",
      handle: MEHOW,
    });
    expect(handleStatus(typed, PARENTS, check("mehow", false))).toEqual({
      kind: "taken",
      handle: MEHOW,
    });
  });

  it("reports a check that failed, and prefers an answer already in hand", () => {
    expect(handleStatus(typed, PARENTS, check("mehow", undefined, true)).kind).toBe("check-failed");
    expect(handleStatus(typed, PARENTS, check("mehow", true, true)).kind).toBe("available");
  });
});
