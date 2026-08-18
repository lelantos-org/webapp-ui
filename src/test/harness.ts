// Shared scaffolding for hook tests.
//
// Small, but worth centralising: a per-test `QueryClient` with retries left on
// is a classic source of tests that pass locally and hang in CI, and each copy
// of the wrapper was one more place to get that wrong.

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";

/// `renderHook` wrapper providing a fresh, isolated `QueryClient`.
///
/// Fresh per render so no cache leaks between tests, and `retry: false` so a
/// deliberately-failing query settles immediately instead of running the
/// default backoff schedule past the test timeout.
export function queryWrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  return createElement(QueryClientProvider, { client }, children);
}

export interface Deferred<T> {
  promise: Promise<T>;
  resolve(value: T): void;
  reject(reason: unknown): void;
}

/// A promise plus the handles to settle it.
///
/// For holding an async step open across assertions — the point being to
/// observe what the UI reports *while* the work is in flight, which is where
/// most of the interesting states live.
export function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
