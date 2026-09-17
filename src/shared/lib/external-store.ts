import { useSyncExternalStore } from "react";

/// A listener set that can be told something changed.
export interface Subscribers {
  /// Add `listener`; returns the function that removes it.
  subscribe(listener: () => void): () => void;
  /// Call every current listener.
  notify(): void;
}

export interface SubscriberHooks {
  /// Before the first listener is added.
  onFirst?(): void;
  /// After the last listener is removed.
  onLast?(): void;
}

/// A listener set that can start work on its first listener and stop it after its last.
export function createSubscribers(hooks: SubscriberHooks = {}): Subscribers {
  const listeners = new Set<() => void>();
  return {
    subscribe(listener) {
      if (listeners.size === 0) hooks.onFirst?.();
      listeners.add(listener);
      return () => {
        if (!listeners.delete(listener) || listeners.size > 0) return;
        hooks.onLast?.();
      };
    },
    notify() {
      for (const listener of listeners) listener();
    },
  };
}

/// Read access to a store: what `useStore` needs.
export interface Store<T> {
  getState(): T;
  subscribe(listener: () => void): () => void;
}

export interface WritableStore<T> extends Store<T> {
  /// Replace the state and notify. Pass a fresh value; never mutate the current one.
  setState(next: T): void;
}

/// An in-memory store holding one immutable value.
export function createStore<T>(initial: T): WritableStore<T> {
  let state = initial;
  const subscribers = createSubscribers();
  return {
    getState: () => state,
    subscribe: subscribers.subscribe,
    setState(next) {
      state = next;
      subscribers.notify();
    },
  };
}

/// Subscribe to `store`; `selector` must return a stable value for unchanged state.
export function useStore<T>(store: Store<T>): T;
export function useStore<T, S>(store: Store<T>, selector: (state: T) => S): S;
export function useStore<T, S>(store: Store<T>, selector?: (state: T) => S): T | S {
  const read = () => (selector ? selector(store.getState()) : store.getState());
  return useSyncExternalStore(store.subscribe, read, read);
}
