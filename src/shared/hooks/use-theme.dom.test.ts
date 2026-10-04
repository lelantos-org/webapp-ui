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

  it("paints the browser chrome for an explicit choice, over the OS-conditional tag too", () => {
    const metas = ["(prefers-color-scheme: light)", ""].map((media) => {
      const meta = document.createElement("meta");
      meta.name = "theme-color";
      if (media) meta.media = media;
      document.head.append(meta);
      return meta;
    });
    document.documentElement.setAttribute("data-theme", "dark");

    const { result } = renderHook(() => useTheme());
    act(() => result.current.toggle());

    expect(metas.map((m) => m.content)).toEqual(["#F7F4ED", "#F7F4ED"]);
    for (const meta of metas) meta.remove();
  });
});
