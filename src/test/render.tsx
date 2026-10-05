import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { ROUTER_FUTURE } from "@/app/providers/router-future";

type WrapperProps = { children: ReactNode };

export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
}

/// Wrapper around a client the test holds, to seed or inspect its cache.
export function withQueryClient(client: QueryClient) {
  return function QueryClientWrapper({ children }: WrapperProps) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

/// Wrapper providing a fresh `createTestQueryClient()` per render.
export function queryWrapper({ children }: WrapperProps) {
  return <QueryClientProvider client={createTestQueryClient()}>{children}</QueryClientProvider>;
}

export function routerWrapper({ children }: WrapperProps) {
  return <MemoryRouter future={ROUTER_FUTURE}>{children}</MemoryRouter>;
}

/// Router outside, query client inside — the order `AppProviders` nests them — with the router
/// opened at `entry`, e.g. `/send#to=…`.
export function appWrapperAt(entry: string) {
  return function AppWrapperAt({ children }: WrapperProps) {
    return (
      <MemoryRouter future={ROUTER_FUTURE} initialEntries={[entry]}>
        {queryWrapper({ children })}
      </MemoryRouter>
    );
  };
}

/// `appWrapperAt` the root path.
export const appWrapper = appWrapperAt("/");

/// `renderHook` inside a query client, returned alongside the result.
export function renderQueryHook<Result, Props>(
  hook: (props: Props) => Result,
  options: { initialProps?: Props; client?: QueryClient } = {},
) {
  const client = options.client ?? createTestQueryClient();
  const rendered = renderHook(hook, {
    initialProps: options.initialProps,
    wrapper: withQueryClient(client),
  });
  return { ...rendered, client };
}
