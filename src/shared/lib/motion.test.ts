import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { animationDelay, MODAL_EXIT_MS, prefersReducedMotion } from "./motion";

function stubReducedMotion(reduce: boolean) {
  vi.stubGlobal("matchMedia", (media: string) => ({ media, matches: reduce }));
}

describe("prefersReducedMotion", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("reads the media query", () => {
    stubReducedMotion(true);
    expect(prefersReducedMotion()).toBe(true);
    stubReducedMotion(false);
    expect(prefersReducedMotion()).toBe(false);
  });

  it("is false where `matchMedia` does not exist", () => {
    vi.stubGlobal("matchMedia", undefined);
    expect(prefersReducedMotion()).toBe(false);
  });
});

describe("animationDelay", () => {
  beforeEach(() => vi.useFakeTimers());

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("waits the full duration by default", async () => {
    stubReducedMotion(false);
    const settled = vi.fn();
    const p = animationDelay(MODAL_EXIT_MS).then(settled);

    await vi.advanceTimersByTimeAsync(MODAL_EXIT_MS - 1);
    expect(settled).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    await p;
    expect(settled).toHaveBeenCalledTimes(1);
  });

  it("resolves without waiting under reduced motion", async () => {
    stubReducedMotion(true);
    const settled = vi.fn();
    const p = animationDelay(MODAL_EXIT_MS).then(settled);

    // No timers advanced: a pending timeout would leave this unresolved.
    await p;
    expect(settled).toHaveBeenCalledTimes(1);
  });
});
