// Shared scaffolding for hook tests.
//
// Centralised so every test gets a per-test `QueryClient` with retries disabled;
// leaving retries on is a common source of tests that pass locally and hang in
// CI.

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";

/// `renderHook` wrapper providing a fresh, isolated `QueryClient`.
///
/// Fresh per render so no cache leaks between tests, with `retry: false` so an
/// intentionally failing query settles immediately rather than running the
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
/// Holds an async step open across assertions, so a test can observe what the UI
/// reports while the work is in flight.
export function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
