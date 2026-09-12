// State that lives outside React and is read through `useSyncExternalStore`.
//
// Two layers, because the app's stores differ in where their snapshot comes
// from. Most hold it in memory, and `createStore` is the whole store. A few
// derive it from something else on each read — the DOM attribute the theme is
// stamped on, the raw `localStorage` string the claim-link vault caches against
// — and need only the subscription half, `createSubscribers`, around a snapshot
// function of their own.
//
// Either way the contract `useSyncExternalStore` depends on is the caller's:
// the snapshot must keep its identity until something actually changed, or the
// subscribing component re-renders indefinitely.

import { useSyncExternalStore } from "react";

/// A listener set that can be told something changed.
export interface Subscribers {
  /// Add `listener`; returns the function that removes it.
  subscribe(listener: () => void): () => void;
  /// Call every current listener.
  notify(): void;
}

export interface SubscriberHooks {
  /// Before the first listener is added: attach whatever produces changes.
  onFirst?(): void;
  /// After the last listener is removed: detach it again.
  onLast?(): void;
}

/// A listener set, optionally starting work on its first listener and stopping
/// it after its last — so nothing is bound in a test or a tree that never
/// subscribes.
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
  /// Replace the state and notify. The new value becomes the snapshot as given,
  /// so pass a fresh object for a change and never mutate the current one.
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

/// Subscribe a component to `store`, re-rendering when `selector`'s result
/// changes.
///
/// Selectors must return a stable value for unchanged state — a primitive, a
/// field of the state, or the state itself. One building a fresh object on every
/// call re-renders indefinitely.
export function useStore<T>(store: Store<T>): T;
export function useStore<T, S>(store: Store<T>, selector: (state: T) => S): S;
export function useStore<T, S>(store: Store<T>, selector?: (state: T) => S): T | S {
  const read = () => (selector ? selector(store.getState()) : store.getState());
  return useSyncExternalStore(store.subscribe, read, read);
}
