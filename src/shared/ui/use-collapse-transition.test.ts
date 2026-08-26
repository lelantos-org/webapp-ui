import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCollapseTransition } from "./use-collapse-transition";

const DURATION = 220;

function stubReducedMotion(reduce: boolean) {
  vi.stubGlobal("matchMedia", (media: string) => ({ media, matches: reduce }));
}

const render = (open: boolean) =>
  renderHook(({ o }) => useCollapseTransition(o, DURATION), { initialProps: { o: open } });

describe("useCollapseTransition", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    stubReducedMotion(false);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("mounts already expanded when it starts open", () => {
    // Nothing to interpolate from, so animating would mean a flash of the
    // closed state that was never on screen.
    const { result } = render(true);
    expect(result.current).toEqual({ mounted: true, expanded: true });
  });

  it("mounts first and expands a frame later on the way in", () => {
    const { result, rerender } = render(false);
    act(() => rerender({ o: true }));
    // Mounted closed, so the transition has a state to start from.
    expect(result.current).toEqual({ mounted: true, expanded: false });

    act(() => void vi.advanceTimersByTime(16));
    expect(result.current).toEqual({ mounted: true, expanded: true });
  });

  it("stays mounted for the collapse after closing", () => {
    const { result, rerender } = render(true);
    act(() => rerender({ o: false }));
    expect(result.current).toEqual({ mounted: true, expanded: false });

    act(() => void vi.advanceTimersByTime(DURATION - 1));
    expect(result.current.mounted).toBe(true);

    act(() => void vi.advanceTimersByTime(1));
    expect(result.current.mounted).toBe(false);
  });

  it("stays mounted when it is reopened mid-collapse", () => {
    const { result, rerender } = render(true);
    act(() => rerender({ o: false }));
    act(() => void vi.advanceTimersByTime(DURATION / 2));
    act(() => rerender({ o: true }));

    // The pending unmount must not fire behind the reopen.
    act(() => void vi.advanceTimersByTime(DURATION));
    expect(result.current).toEqual({ mounted: true, expanded: true });
  });

  it("unmounts at once under reduced motion", () => {
    stubReducedMotion(true);
    const { result, rerender } = render(true);
    act(() => rerender({ o: false }));

    // There is no animation left to hold the node open for.
    expect(result.current.mounted).toBe(false);
  });
});
