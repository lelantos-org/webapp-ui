import { renderHook } from "@testing-library/react";
import { act } from "react";
import { beforeEach, describe, expect, it } from "vitest";
import { SHIELDED_ADDRESS } from "@/test/fixtures/addresses";
import { claimedHandlesSnapshot, rememberClaimedHandle, resetForTest } from "./store";
import { useClaimedHandle } from "./use-claimed-handle";

const CHAIN = 31337n;
const ME = SHIELDED_ADDRESS;
const OTHER = `${SHIELDED_ADDRESS}-other`;
const PUBLISHED = "lelantos1published";

beforeEach(() => {
  localStorage.clear();
  resetForTest();
});

describe("claimed handle store", () => {
  it("remembers a handle and reads it back after a reload", () => {
    rememberClaimedHandle(CHAIN, ME, { label: "mehow", address: PUBLISHED }, 1_000);
    resetForTest();
    expect(claimedHandlesSnapshot(CHAIN, ME)).toEqual([
      { label: "mehow", address: PUBLISHED, claimedAt: 1_000 },
    ]);
  });

  it("keeps each account's and each chain's handles apart", () => {
    rememberClaimedHandle(CHAIN, ME, { label: "mehow", address: PUBLISHED });
    expect(claimedHandlesSnapshot(CHAIN, OTHER)).toEqual([]);
    expect(claimedHandlesSnapshot(1n, ME)).toEqual([]);
  });

  it("does not spell the account in the key it stores under", () => {
    rememberClaimedHandle(CHAIN, ME, { label: "mehow", address: PUBLISHED });
    const keys = Object.keys(localStorage);
    expect(keys).toHaveLength(1);
    expect(keys[0]).toMatch(/^lelantos:handles:v1:7a69:[0-9a-f]{16}$/);
    expect(keys[0]).not.toContain(ME);
  });

  it("orders newest first, and moves a handle claimed again to the front", () => {
    rememberClaimedHandle(CHAIN, ME, { label: "first", address: PUBLISHED }, 1_000);
    rememberClaimedHandle(CHAIN, ME, { label: "second", address: PUBLISHED }, 2_000);
    expect(claimedHandlesSnapshot(CHAIN, ME).map((h) => h.label)).toEqual(["second", "first"]);

    rememberClaimedHandle(CHAIN, ME, { label: "first", address: PUBLISHED }, 3_000);
    expect(claimedHandlesSnapshot(CHAIN, ME).map((h) => h.label)).toEqual(["first", "second"]);
  });

  it.each([
    ["a label the registrar would refuse", [{ label: "Me", address: "a", claimedAt: 1 }]],
    ["a missing address", [{ label: "mehow", address: "", claimedAt: 1 }]],
    ["a missing time", [{ label: "mehow", address: "a" }]],
    ["something that is not a list", { label: "mehow" }],
  ])("treats a store holding %s as empty", (_, stored) => {
    rememberClaimedHandle(CHAIN, ME, { label: "mehow", address: PUBLISHED });
    const [key] = Object.keys(localStorage);
    localStorage.setItem(key ?? "", JSON.stringify(stored));
    resetForTest();
    expect(claimedHandlesSnapshot(CHAIN, ME)).toEqual([]);
  });
});

describe("useClaimedHandle", () => {
  it("is undefined before an account or a chain is known", () => {
    expect(renderHook(() => useClaimedHandle(undefined, ME)).result.current).toBeUndefined();
    expect(renderHook(() => useClaimedHandle(CHAIN, undefined)).result.current).toBeUndefined();
  });

  it("follows the account's newest handle as it is claimed", () => {
    const { result } = renderHook(() => useClaimedHandle(CHAIN, ME));
    expect(result.current).toBeUndefined();

    act(() => rememberClaimedHandle(CHAIN, ME, { label: "mehow", address: PUBLISHED }, 1_000));
    expect(result.current).toEqual({ label: "mehow", address: PUBLISHED, claimedAt: 1_000 });

    act(() => rememberClaimedHandle(CHAIN, OTHER, { label: "other", address: PUBLISHED }, 2_000));
    expect(result.current?.label).toBe("mehow");
  });
});
