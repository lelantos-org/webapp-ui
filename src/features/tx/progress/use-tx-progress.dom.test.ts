import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { recordProveDuration } from "./prove-eta";
import { stepsFor } from "./tx-progress";
import { useTxProgress } from "./use-tx-progress";

vi.mock("./prove-eta", () => ({ recordProveDuration: vi.fn() }));

afterEach(() => {
  vi.useRealTimers();
});

describe("useTxProgress", () => {
  it("walks a spend's steps and completes on its last one", () => {
    const { result } = renderHook(() => useTxProgress());
    act(() => result.current.start(stepsFor("transfer")));
    expect(result.current.steps.map((s) => s.id)).toEqual([
      "preparing",
      "proving",
      "submitting",
      "mined",
    ]);
    expect(result.current.phase).toBeUndefined();

    act(() => result.current.set("preparing"));
    expect(result.current.phase).toBe("preparing");
    expect(result.current.done).toBe(false);

    act(() => result.current.set("mined"));
    expect(result.current).toMatchObject({ phase: "mined", done: true, endedAs: "mined" });
  });

  it("holds a deposit open on `mined` until the relayer flushes", () => {
    const { result } = renderHook(() => useTxProgress());
    act(() => result.current.start(stepsFor("deposit", { asEth: true })));
    act(() => result.current.set("mined"));
    expect(result.current).toMatchObject({ phase: "mined", done: false, endedAs: undefined });

    act(() => result.current.set("flushed"));
    expect(result.current).toMatchObject({ phase: "mined", done: true, endedAs: "flushed" });
  });

  it("drops a phase that is not in the step list", () => {
    const { result } = renderHook(() => useTxProgress());
    act(() => result.current.start(stepsFor("transfer")));
    act(() => result.current.set("proving"));
    act(() => result.current.set("broadcast"));
    expect(result.current.phase).toBe("proving");
    expect(result.current.done).toBe(false);
  });

  it("records where a failure happened, and ends on it", () => {
    const { result } = renderHook(() => useTxProgress());
    act(() => result.current.start(stepsFor("transfer")));
    act(() => result.current.set("proving"));
    act(() => result.current.set("failed"));
    expect(result.current).toMatchObject({
      phase: "failed",
      failedAt: "proving",
      done: true,
      endedAs: "failed",
    });
  });

  it("settles as `unknown` without an observed outcome", () => {
    const { result } = renderHook(() => useTxProgress());
    act(() => result.current.start(stepsFor("swap")));
    act(() => result.current.set("submitting"));
    act(() => result.current.set("unknown"));
    expect(result.current).toMatchObject({ phase: "submitting", done: true, endedAs: "unknown" });
  });

  it("times a successful proof, and only a successful one", () => {
    vi.useFakeTimers({ now: 1_000 });
    const { result } = renderHook(() => useTxProgress());
    act(() => result.current.start(stepsFor("withdraw")));

    act(() => result.current.set("proving"));
    expect(result.current.provingSince).toBe(1_000);
    vi.setSystemTime(2_000);
    act(() => result.current.set("proving"));
    expect(result.current.provingSince).toBe(1_000);

    vi.setSystemTime(21_000);
    act(() => result.current.set("submitting"));
    expect(result.current.provingSince).toBeUndefined();
    expect(recordProveDuration).toHaveBeenCalledWith(20_000);

    vi.mocked(recordProveDuration).mockClear();
    act(() => result.current.start(stepsFor("withdraw")));
    act(() => result.current.set("proving"));
    act(() => result.current.set("failed"));
    expect(result.current.provingSince).toBeUndefined();
    expect(recordProveDuration).not.toHaveBeenCalled();
  });

  it("starts clean, and reset empties it", () => {
    const { result } = renderHook(() => useTxProgress());
    act(() => result.current.start(stepsFor("transfer")));
    act(() => result.current.set("preparing"));
    act(() => result.current.set("failed"));

    act(() => result.current.start(stepsFor("transfer")));
    expect(result.current).toMatchObject({
      phase: undefined,
      done: false,
      failedAt: undefined,
      endedAs: undefined,
      provingSince: undefined,
    });
    act(() => result.current.set("failed"));
    expect(result.current.failedAt).toBeUndefined();

    act(() => result.current.reset());
    expect(result.current).toMatchObject({ steps: [], phase: undefined, done: false });
  });

  it("keeps `set` and `start` stable across renders", () => {
    const { result, rerender } = renderHook(() => useTxProgress());
    const { set, start, reset } = result.current;
    act(() => result.current.start(stepsFor("transfer")));
    rerender();
    expect(result.current.set).toBe(set);
    expect(result.current.start).toBe(start);
    expect(result.current.reset).toBe(reset);
  });
});
