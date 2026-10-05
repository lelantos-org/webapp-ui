import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { usePrivacy } from "./use-privacy";

afterEach(() => {
  const { result } = renderHook(() => usePrivacy());
  if (result.current.hidden) act(() => result.current.toggle());
});

describe("usePrivacy", () => {
  it("starts with amounts shown", () => {
    expect(renderHook(() => usePrivacy()).result.current.hidden).toBe(false);
  });

  it("keeps every mounted control on the same mode", () => {
    const header = renderHook(() => usePrivacy());
    const menu = renderHook(() => usePrivacy());

    act(() => header.result.current.toggle());
    expect(menu.result.current.hidden).toBe(true);

    act(() => menu.result.current.toggle());
    expect(header.result.current.hidden).toBe(false);
  });

  it("persists the choice, and forgets it when turned off", () => {
    const { result } = renderHook(() => usePrivacy());
    act(() => result.current.toggle());
    expect(localStorage.getItem("lelantos:hide-amounts")).toBe("1");
    act(() => result.current.toggle());
    expect(localStorage.getItem("lelantos:hide-amounts")).toBeNull();
  });
});
