// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useTheme } from "./use-theme";

afterEach(() => {
  document.documentElement.removeAttribute("data-theme");
  localStorage.clear();
});

describe("useTheme", () => {
  it("keeps every mounted control on the same theme", () => {
    document.documentElement.setAttribute("data-theme", "dark");
    const header = renderHook(() => useTheme());
    const menu = renderHook(() => useTheme());

    act(() => header.result.current.toggle());
    expect(header.result.current.theme).toBe("light");
    expect(menu.result.current.theme).toBe("light");

    // The control that did not make the last switch must still flip on its
    // first click, rather than re-applying the theme already showing.
    act(() => menu.result.current.toggle());
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(header.result.current.theme).toBe("dark");
  });

  it("persists an explicit choice", () => {
    document.documentElement.setAttribute("data-theme", "light");
    const { result } = renderHook(() => useTheme());
    act(() => result.current.toggle());
    expect(localStorage.getItem("lelantos:theme")).toBe("dark");
  });
});
