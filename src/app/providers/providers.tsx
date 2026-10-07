import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { BrowserRouter } from "react-router-dom";
import { Toaster } from "sonner";
import { ErrorBoundary } from "@/app/errors/ErrorBoundary";
import { ChainProvider } from "@/features/chain";
import { WalletProvider } from "@/features/wallet";
import { useMediaQuery } from "@/shared/hooks/use-media-query";
import { PwaUpdatePrompt } from "./PwaUpdatePrompt";
import { ROUTER_FUTURE } from "./router-future";
import "./toast.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false },
    mutations: { retry: 0 },
  },
});

interface AppProvidersProps {
  children: ReactNode;
  /// Default: the app's own client.
  client?: QueryClient | undefined;
}

export function AppProviders({ children, client = queryClient }: AppProvidersProps) {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={client}>
        {/* Router must wrap ChainProvider: RouteErrorBoundary resets on location. */}
        <BrowserRouter future={ROUTER_FUTURE}>
          <ChainProvider>
            <WalletProvider>{children}</WalletProvider>
          </ChainProvider>
        </BrowserRouter>
        {/* Inside the query client: it holds back while a transaction is being made. */}
        <PwaUpdatePrompt />
      </QueryClientProvider>
      <Toasts />
    </ErrorBoundary>
  );
}

/// Sonner's own breakpoint: below it a toast spans the viewport.
const PHONE = "(max-width: 600px)";

/// On a phone the bottom edge holds the pinned submit button, so toasts go to the top.
function Toasts() {
  const phone = useMediaQuery(PHONE);
  return (
    <Toaster
      position={phone ? "top-center" : "bottom-right"}
      mobileOffset={{ top: "calc(12px + env(safe-area-inset-top))" }}
      theme="light"
      richColors
      closeButton
    />
  );
}
