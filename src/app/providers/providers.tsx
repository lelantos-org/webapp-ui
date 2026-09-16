import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { BrowserRouter } from "react-router-dom";
import { Toaster } from "sonner";
import { ErrorBoundary } from "@/app/errors/ErrorBoundary";
import { ChainProvider } from "@/features/chain";
import { WalletProvider } from "@/features/wallet";
import { PwaUpdatePrompt } from "./PwaUpdatePrompt";
import { ROUTER_FUTURE } from "./router-future";
// Unlayered, unlike every other stylesheet: see the note in toast.css.
import "./toast.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false },
    mutations: { retry: 0 },
  },
});

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        {/* Router above `ChainProvider`, so `RouteErrorBoundary` — which resets
            on the location — has one available. `ChainProvider` itself reads no
            route state; the chain comes from the wallet. */}
        <BrowserRouter future={ROUTER_FUTURE}>
          <ChainProvider>
            <WalletProvider>{children}</WalletProvider>
          </ChainProvider>
        </BrowserRouter>
      </QueryClientProvider>
      <Toaster position="bottom-right" theme="light" richColors closeButton />
      <PwaUpdatePrompt />
    </ErrorBoundary>
  );
}
