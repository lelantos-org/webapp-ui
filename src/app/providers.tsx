import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode, useEffect } from "react";
import { BrowserRouter } from "react-router-dom";
import { Toaster } from "sonner";
import { PwaUpdatePrompt } from "@/app/PwaUpdatePrompt";
import { ChainProvider } from "@/features/chain/ChainProvider";
import { walletStore } from "@/features/eip1193/store";
import { WalletProvider } from "@/features/wallet";
import { ErrorBoundary } from "@/shared/ui/ErrorBoundary";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false },
    mutations: { retry: 0 },
  },
});

/// Boot the wallet store once at mount: EIP-6963 discovery plus silent
/// reconnect to the last connected wallet. Prompts only if the site's
/// permission has been revoked.
function WalletBoot({ children }: { children: ReactNode }) {
  useEffect(() => {
    walletStore.startDiscovery();
    void walletStore.resumeFromStorage();
  }, []);
  return <>{children}</>;
}

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        {/* Router above `ChainProvider` so `RouteErrorBoundary` — which keys on
            the location — and any future route-driven chain selection have one.
            (An earlier note here claimed `ChainProvider` reads and writes
            `?chain=`; it does neither, the chain comes from the wallet.) */}
        <BrowserRouter>
          <ChainProvider>
            <WalletBoot>
              <WalletProvider>{children}</WalletProvider>
            </WalletBoot>
          </ChainProvider>
        </BrowserRouter>
      </QueryClientProvider>
      <Toaster position="bottom-right" theme="light" richColors closeButton />
      <PwaUpdatePrompt />
    </ErrorBoundary>
  );
}
