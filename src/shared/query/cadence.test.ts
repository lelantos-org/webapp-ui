// The cadence helpers every polled query goes through: the per-tick jitter and
// the idle widening.

import { describe, expect, it, vi } from "vitest";
import { IDLE_POLL_FACTOR, jitter, pollInterval } from "./cadence";

describe("jitter", () => {
  const BASE = 30_000;

  it("stays inside ±20% of the base", () => {
    for (let i = 0; i < 1000; i += 1) {
      const v = jitter(BASE);
      expect(v).toBeGreaterThanOrEqual(BASE * 0.8);
      expect(v).toBeLessThanOrEqual(BASE * 1.2);
    }
  });

  /// A value fixed once per mount would be a constant offset, and so a stable
  /// per-session fingerprint. Callers pass a function to `refetchInterval`, so
  /// this is re-drawn per tick.
  it("draws afresh on every call, spanning the range rather than clustering", () => {
    const seen = new Set(Array.from({ length: 200 }, () => jitter(BASE)));
    expect(seen.size).toBeGreaterThan(50);
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
});

describe("pollInterval", () => {
  const BASE = 30_000;

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
