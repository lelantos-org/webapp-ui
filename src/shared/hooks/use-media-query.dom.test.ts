import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useMediaQuery } from "./use-media-query";

function stubMatchMedia(matches: boolean) {
  const listeners = new Set<() => void>();
  const media = {
    matches,
    addEventListener: (_: string, fn: () => void) => listeners.add(fn),
    removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
  };
  vi.stubGlobal("matchMedia", () => media);
  return {
    set(next: boolean) {
      media.matches = next;
      for (const fn of listeners) fn();
    },
    listeners,
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("useMediaQuery", () => {
  it("follows the query as it starts and stops matching", () => {
    const media = stubMatchMedia(false);
    const { result, unmount } = renderHook(() => useMediaQuery("(max-width: 600px)"));
    expect(result.current).toBe(false);

    act(() => media.set(true));
    expect(result.current).toBe(true);

    unmount();
    expect(media.listeners.size).toBe(0);
  });

  it("reads false where matchMedia does not exist", () => {
    vi.stubGlobal("matchMedia", undefined);
    expect(renderHook(() => useMediaQuery("(max-width: 600px)")).result.current).toBe(false);
  });
});
