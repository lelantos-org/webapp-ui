// One shared timer, backing off, running exactly while someone has joined.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSettlingPoll } from "./settling-poll";

vi.mock("@/features/tx", () => ({ pruneExpired: vi.fn() }));

beforeEach(() => {
  vi.useFakeTimers();
  // No jitter, so the schedule below is exact.
  vi.spyOn(Math, "random").mockReturnValue(0.5);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("createSettlingPoll", () => {
  it("prunes and resyncs on each tick, doubling the wait up to its ceiling", () => {
    const prune = vi.fn();
    const invalidate = vi.fn(async () => {});
    const poll = createSettlingPoll(prune);
    const leave = poll.join(invalidate);

    vi.advanceTimersByTime(5_000);
    expect(invalidate).toHaveBeenCalledTimes(1);
    expect(prune).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(10_000);
    expect(invalidate).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(20_000);
    expect(invalidate).toHaveBeenCalledTimes(3);
    // Capped at 30s from here on.
    vi.advanceTimersByTime(30_000);
    expect(invalidate).toHaveBeenCalledTimes(4);
    leave();
  });

  it("runs one timer for every joiner and stops after the last leaves", () => {
    const invalidate = vi.fn(async () => {});
    const poll = createSettlingPoll(vi.fn());
    const leaveA = poll.join(invalidate);
    const leaveB = poll.join(invalidate);

    vi.advanceTimersByTime(5_000);
    expect(invalidate).toHaveBeenCalledTimes(1);

    leaveA();
    vi.advanceTimersByTime(10_000);
    expect(invalidate).toHaveBeenCalledTimes(2);

    leaveB();
    vi.advanceTimersByTime(60_000);
    expect(invalidate).toHaveBeenCalledTimes(2);
  });

  it("starts again from the shortest wait after going idle", () => {
    const invalidate = vi.fn(async () => {});
    const poll = createSettlingPoll(vi.fn());
    poll.join(invalidate)();
    poll.join(invalidate);
    vi.advanceTimersByTime(5_000);
    expect(invalidate).toHaveBeenCalledTimes(1);
  });
});
