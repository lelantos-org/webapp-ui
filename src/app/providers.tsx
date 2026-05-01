import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode, useEffect } from "react";
import { BrowserRouter } from "react-router-dom";
import { Toaster } from "sonner";
import { WalletProvider } from "@/features/wallet";
import { walletStore } from "@/features/wallet/wallet-store";
import { ErrorBoundary } from "@/shared/ui/ErrorBoundary";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false },
    mutations: { retry: 0 },
  },
});

/// Boot the wallet store once at mount: EIP-6963 discovery plus silent
/// reconnect to the last-used wallet (no popup unless permission was revoked).
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
        <WalletBoot>
          <WalletProvider>
            <BrowserRouter>{children}</BrowserRouter>
          </WalletProvider>
        </WalletBoot>
      </QueryClientProvider>
      <Toaster position="bottom-right" theme="dark" richColors closeButton />
    </ErrorBoundary>
  );
}
