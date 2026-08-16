import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useExitTransition } from "./use-exit-transition";

const DURATION = 240;

function stubReducedMotion(reduce: boolean) {
  vi.stubGlobal("matchMedia", (media: string) => ({ media, matches: reduce }));
}

describe("useExitTransition", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    stubReducedMotion(false);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("flags `exiting` immediately and defers `done` until the animation ends", () => {
    const done = vi.fn();
    const { result } = renderHook(() => useExitTransition(DURATION));

    act(() => result.current.exit(done));
    expect(result.current.exiting).toBe(true);
    expect(done).not.toHaveBeenCalled();

    act(() => void vi.advanceTimersByTime(DURATION - 1));
    expect(done).not.toHaveBeenCalled();

    act(() => void vi.advanceTimersByTime(1));
    expect(done).toHaveBeenCalledTimes(1);
  });

  it("ignores a second exit while one is playing", () => {
    const first = vi.fn();
    const second = vi.fn();
    const { result } = renderHook(() => useExitTransition(DURATION));

    act(() => {
      result.current.exit(first);
      result.current.exit(second);
    });
    act(() => void vi.advanceTimersByTime(DURATION));

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).not.toHaveBeenCalled();
  });

  it("closes synchronously under reduced motion, with no exit state", () => {
    stubReducedMotion(true);
    const done = vi.fn();
    const { result } = renderHook(() => useExitTransition(DURATION));

    act(() => result.current.exit(done));

    expect(done).toHaveBeenCalledTimes(1);
    expect(result.current.exiting).toBe(false);
  });

  it("still ignores a repeat exit under reduced motion", () => {
    stubReducedMotion(true);
    const done = vi.fn();
    const { result } = renderHook(() => useExitTransition(DURATION));

    act(() => {
      result.current.exit(done);
      result.current.exit(done);
    });

    expect(done).toHaveBeenCalledTimes(1);
  });

  it("drops a pending callback when the caller unmounts first", () => {
    const done = vi.fn();
    const { result, unmount } = renderHook(() => useExitTransition(DURATION));

    act(() => result.current.exit(done));
    unmount();
    act(() => void vi.advanceTimersByTime(DURATION));

    expect(done).not.toHaveBeenCalled();
  });
});
