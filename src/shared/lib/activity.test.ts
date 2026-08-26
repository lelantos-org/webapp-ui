// Covers the listener bookkeeping: handlers attach on the first subscriber,
// detach after the last, and one input event reaches every subscriber exactly
// once.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IDLE_POLL_FACTOR, jitter, onActivity, pollInterval } from "./activity";

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

describe("jitter", () => {
  const BASE = 30_000;

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("stays inside ±20% of the base", () => {
    for (let i = 0; i < 1000; i += 1) {
      const v = jitter(BASE);
      expect(v).toBeGreaterThanOrEqual(BASE * 0.8);
      expect(v).toBeLessThanOrEqual(BASE * 1.2);
    }
  });

  it("spans the range rather than clustering on the base", () => {
    const seen = new Set(Array.from({ length: 200 }, () => jitter(BASE)));
    expect(seen.size).toBeGreaterThan(50);
  });

  /// A value fixed once per mount would be a constant offset, and so a stable
  /// per-session fingerprint. Callers pass a function to `refetchInterval`, so
  /// this is re-drawn per tick.
  it("draws a fresh value on every call", () => {
    const a = jitter(BASE);
    const b = jitter(BASE);
    const c = jitter(BASE);
    expect(new Set([a, b, c]).size).toBeGreaterThan(1);
  });

  it("maps the extremes of Math.random onto the bounds", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    expect(jitter(BASE)).toBe(BASE * 0.8);
    vi.spyOn(Math, "random").mockReturnValue(1);
    expect(jitter(BASE)).toBe(BASE * 1.2);
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    expect(jitter(BASE)).toBe(BASE);
  });

  it("honours an explicit fraction", () => {
    vi.spyOn(Math, "random").mockReturnValue(1);
    expect(jitter(BASE, 0.5)).toBe(BASE * 1.5);
  });

  /// Idle intervals are jittered too, and the widened base must not push a poll
  /// so far out that a spend is built against a stale nullifier view.
  it("keeps an idle interval within a bounded window", () => {
    const idleBase = BASE * IDLE_POLL_FACTOR;
    for (let i = 0; i < 200; i += 1) {
      expect(jitter(idleBase)).toBeLessThanOrEqual(idleBase * 1.2);
    }
  });
});

describe("pollInterval", () => {
  const BASE = 30_000;

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns the base interval while active", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    expect(pollInterval(BASE, false)).toBe(BASE);
  });

  /// The regression this helper exists to prevent: `transparent-balances` polled
  /// a bare 30s with no idle factor, so an unattended tab kept sending the
  /// user's EOA to a third-party RPC every 30s for the life of the session.
  it("widens by IDLE_POLL_FACTOR while idle", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    expect(pollInterval(BASE, true)).toBe(BASE * IDLE_POLL_FACTOR);
  });

  it("is always longer when idle than when active", () => {
    for (let i = 0; i < 200; i += 1) {
      expect(pollInterval(BASE, true)).toBeGreaterThan(pollInterval(BASE, false));
    }
  });

  it("jitters both states", () => {
    const active = new Set(Array.from({ length: 100 }, () => pollInterval(BASE, false)));
    const idle = new Set(Array.from({ length: 100 }, () => pollInterval(BASE, true)));
    expect(active.size).toBeGreaterThan(10);
    expect(idle.size).toBeGreaterThan(10);
  });
});
