import { beforeEach, describe, expect, it, vi } from "vitest";
import { onActivity } from "./idle";

function input(): void {
  window.dispatchEvent(new Event("pointerdown"));
}

let removeSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  removeSpy = vi.spyOn(window, "removeEventListener");
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
    onActivity(vi.fn())();

    const later = vi.fn();
    const stop = onActivity(later);
    input();

    expect(later).toHaveBeenCalledTimes(1);
    stop();
  });
});
