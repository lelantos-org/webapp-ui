import { useQuery } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import { useEffect, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderQueryHook } from "@/test/render";
import { usePolling } from "./cadence";

afterEach(() => vi.useRealTimers());

describe("usePolling", () => {
  it("keeps polling while the observer re-renders every second", async () => {
    vi.useFakeTimers();
    const queryFn = vi.fn(async () => 1);
    renderQueryHook(() => {
      const [, setTick] = useState(0);
      useEffect(() => {
        const id = setInterval(() => setTick((t) => t + 1), 1_000);
        return () => clearInterval(id);
      }, []);
      return useQuery({ queryKey: ["poll"], queryFn, ...usePolling(10_000) });
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(queryFn).toHaveBeenCalledTimes(1);

    for (let s = 0; s < 25; s++) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1_000);
      });
    }
    expect(queryFn.mock.calls.length).toBeGreaterThanOrEqual(3);
  });

  it("holds one draw across renders and re-draws once a fetch settles", async () => {
    const { result } = renderHook(() => usePolling(10_000));
    const query = { state: { dataUpdatedAt: 1, errorUpdatedAt: 0 } };
    const first = result.current.refetchInterval(query);
    for (let i = 0; i < 20; i++) expect(result.current.refetchInterval(query)).toBe(first);

    const draws = new Set<number>();
    for (let i = 2; i < 50; i++) {
      query.state.dataUpdatedAt = i;
      draws.add(result.current.refetchInterval(query));
    }
    expect(draws.size).toBeGreaterThan(10);
  });
});
