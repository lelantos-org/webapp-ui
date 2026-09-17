import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

type Module = typeof import("./sync-progress-store");

let mod: Module;

beforeEach(async () => {
  vi.resetModules();
  mod = await import("./sync-progress-store");
});

const IDLE = { active: false, scanned: 0, hits: 0 };

describe("syncProgress", () => {
  it("starts idle and reports what the running sync has scanned", () => {
    const { result } = renderHook(() => mod.useSyncProgress());
    expect(result.current).toEqual(IDLE);

    act(() => mod.syncProgress.scanning("1:alice", 200, 3));
    expect(result.current).toEqual({ active: true, scanned: 200, hits: 3 });
  });

  it("hands the counter to the newer sync and ignores the old one's finish", () => {
    const { result } = renderHook(() => mod.useSyncProgress());
    act(() => {
      mod.syncProgress.scanning("1:alice", 200, 3);
      mod.syncProgress.scanning("8453:alice", 40, 0);
    });

    act(() => mod.syncProgress.finished("1:alice"));
    expect(result.current).toEqual({ active: true, scanned: 40, hits: 0 });

    act(() => mod.syncProgress.finished("8453:alice"));
    expect(result.current).toEqual(IDLE);
  });

  it("lets a finish through when nothing holds the counter", () => {
    const { result } = renderHook(() => mod.useSyncProgress());
    act(() => mod.syncProgress.finished("1:alice"));
    expect(result.current).toEqual(IDLE);
  });

  it("releases the counter on reset whoever holds it, so any later finish lands", () => {
    const { result } = renderHook(() => mod.useSyncProgress());
    act(() => mod.syncProgress.scanning("1:alice", 200, 3));
    act(() => mod.syncProgress.reset());
    expect(result.current).toEqual(IDLE);

    act(() => mod.syncProgress.scanning("8453:bob", 10, 1));
    act(() => mod.syncProgress.reset());
    act(() => mod.syncProgress.finished("1:alice"));
    expect(result.current).toEqual(IDLE);
  });
});
