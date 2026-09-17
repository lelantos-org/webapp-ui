import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stubReducedMotion } from "@/test/browser";
import { useCollapseTransition } from "./use-collapse-transition";

const DURATION = 220;

const render = (open: boolean) =>
  renderHook(({ o }) => useCollapseTransition(o, DURATION), { initialProps: { o: open } });

describe("useCollapseTransition", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    stubReducedMotion(false);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("mounts already expanded when it starts open", () => {
    const { result } = render(true);
    expect(result.current).toEqual({ mounted: true, expanded: true });
  });

  it("mounts first and expands a frame later on the way in", () => {
    const { result, rerender } = render(false);
    act(() => rerender({ o: true }));
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

    act(() => void vi.advanceTimersByTime(DURATION));
    expect(result.current).toEqual({ mounted: true, expanded: true });
  });

  it("unmounts at once under reduced motion", () => {
    stubReducedMotion(true);
    const { result, rerender } = render(true);
    act(() => rerender({ o: false }));

    expect(result.current.mounted).toBe(false);
  });
});
