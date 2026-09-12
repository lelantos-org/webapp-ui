// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createStore, createSubscribers, useStore } from "./external-store";

describe("createSubscribers", () => {
  it("starts on the first listener and stops after the last", () => {
    const onFirst = vi.fn();
    const onLast = vi.fn();
    const subs = createSubscribers({ onFirst, onLast });

    const offA = subs.subscribe(vi.fn());
    const offB = subs.subscribe(vi.fn());
    expect(onFirst).toHaveBeenCalledOnce();

    offA();
    expect(onLast).not.toHaveBeenCalled();
    offB();
    expect(onLast).toHaveBeenCalledOnce();

    // A repeated unsubscribe is not a second "last".
    offB();
    expect(onLast).toHaveBeenCalledOnce();
  });

  it("notifies every current listener", () => {
    const subs = createSubscribers();
    const a = vi.fn();
    const b = vi.fn();
    subs.subscribe(a);
    const offB = subs.subscribe(b);
    offB();
    subs.notify();
    expect(a).toHaveBeenCalledOnce();
    expect(b).not.toHaveBeenCalled();
  });
});

describe("createStore", () => {
  it("keeps the snapshot's identity until it is replaced", () => {
    const initial = { n: 1 };
    const store = createStore(initial);
    expect(store.getState()).toBe(initial);

    const listener = vi.fn();
    store.subscribe(listener);
    const next = { n: 2 };
    store.setState(next);
    expect(store.getState()).toBe(next);
    expect(listener).toHaveBeenCalledOnce();
  });
});

describe("useStore", () => {
  it("re-renders with the selected slice", () => {
    const store = createStore({ status: "idle", count: 0 });
    const { result } = renderHook(() => useStore(store, (s) => s.status));
    expect(result.current).toBe("idle");

    act(() => store.setState({ status: "ready", count: 1 }));
    expect(result.current).toBe("ready");
  });

  it("returns the whole state without a selector", () => {
    const store = createStore(7);
    const { result } = renderHook(() => useStore(store));
    expect(result.current).toBe(7);
  });
});
