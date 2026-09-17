import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { BrowserRouter } from "react-router-dom";
import { Toaster } from "sonner";
import { ErrorBoundary } from "@/app/errors/ErrorBoundary";
import { ChainProvider } from "@/features/chain";
import { WalletProvider } from "@/features/wallet";
import { PwaUpdatePrompt } from "./PwaUpdatePrompt";
import { ROUTER_FUTURE } from "./router-future";
// Unlayered on purpose, unlike every other stylesheet.
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
        {/* Router must wrap ChainProvider: RouteErrorBoundary resets on location. */}
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
