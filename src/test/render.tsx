// Provider wrappers for `render` / `renderHook`.
//
// Centralised so every test gets a per-test `QueryClient` with retries disabled
// — leaving retries on is a common source of tests that pass locally and hang in
// CI — and a router configured the way the app's own is.

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { ROUTER_FUTURE } from "@/app/providers/router-future";

type WrapperProps = { children: ReactNode };

/// A fresh, isolated `QueryClient`.
///
/// `retry: false` so an intentionally failing query settles immediately rather
/// than running the default backoff schedule past the test timeout; `gcTime: 0`
/// so nothing a test cached outlives it.
export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
}

/// Wrapper around a client the test holds, for tests that seed or inspect the
/// cache directly.
export function withQueryClient(client: QueryClient) {
  return function QueryClientWrapper({ children }: WrapperProps) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

/// Wrapper providing a fresh `createTestQueryClient()` per render, so no cache
/// leaks between tests.
export function queryWrapper({ children }: WrapperProps) {
  return <QueryClientProvider client={createTestQueryClient()}>{children}</QueryClientProvider>;
}

/// Wrapper providing an in-memory router with the app's future flags.
export function routerWrapper({ children }: WrapperProps) {
  return <MemoryRouter future={ROUTER_FUTURE}>{children}</MemoryRouter>;
}

/// Router outside, query client inside — the order `AppProviders` nests them.
export function appWrapper({ children }: WrapperProps) {
  return routerWrapper({ children: queryWrapper({ children }) });
}
