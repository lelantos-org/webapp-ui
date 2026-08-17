// Covers the listener bookkeeping: handlers attach on the first subscriber,
// detach after the last, and one input event reaches every subscriber exactly
// once.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { onActivity } from "./activity";

function input(): void {
  window.dispatchEvent(new Event("pointerdown"));
}

let addSpy: ReturnType<typeof vi.spyOn>;
let removeSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  addSpy = vi.spyOn(window, "addEventListener");
  removeSpy = vi.spyOn(window, "removeEventListener");
});

afterEach(() => {
  addSpy.mockRestore();
  removeSpy.mockRestore();
});

describe("onActivity", () => {
  it("notifies every subscriber once per input event", () => {
    const a = vi.fn();
    const b = vi.fn();
    const stopA = onActivity(a);
    const stopB = onActivity(b);

    input();

    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    stopA();
    stopB();
  });

  it("wires the DOM once however many subscribers there are", () => {
    const stopA = onActivity(vi.fn());
    const afterFirst = addSpy.mock.calls.length;
    const stopB = onActivity(vi.fn());

    // The second subscriber reuses the first one's handlers; registration is
    // not repeated per subscriber.
    expect(addSpy.mock.calls.length).toBe(afterFirst);
    stopA();
    stopB();
  });

  it("stops notifying an unsubscribed listener but keeps serving the rest", () => {
    const a = vi.fn();
    const b = vi.fn();
    const stopA = onActivity(a);
    const stopB = onActivity(b);

    stopA();
    input();

    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledTimes(1);
    stopB();
  });

  it("detaches from the DOM once the last subscriber leaves", () => {
    const seen = vi.fn();
    onActivity(seen)();

    expect(removeSpy).toHaveBeenCalled();
    input();
    expect(seen).not.toHaveBeenCalled();
  });

  it("re-wires cleanly after going empty", () => {
    // Teardown resets module state; a later subscriber must still receive
    // events.
    onActivity(vi.fn())();

    const later = vi.fn();
    const stop = onActivity(later);
    input();

    expect(later).toHaveBeenCalledTimes(1);
    stop();
  });
});
