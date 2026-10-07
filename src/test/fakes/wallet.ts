import type { UseQueryResult } from "@tanstack/react-query";
import type { useSpendableMax, WalletContextValue, WalletState } from "@/features/wallet";
import { fakeWalletContext } from "@/features/wallet/testing";

export {
  ALL_CAPABILITIES,
  deniedCapabilities,
  fakeWalletApi,
  fakeWalletContext,
} from "@/features/wallet/testing";

interface SpendFormWalletHooks {
  SyncNotice: () => null;
  useSpendableMax: typeof useSpendableMax;
  useWallet: () => WalletContextValue;
  useWalletState: () => UseQueryResult<WalletState>;
  preloadProverWorker: () => Promise<void>;
}

/// The wallet hooks a spend form reads, for a synced wallet with an unknown max.
export function spendFormWalletHooks(): SpendFormWalletHooks {
  return {
    SyncNotice: () => null,
    useSpendableMax: () => undefined,
    useWallet: () => fakeWalletContext(),
    useWalletState: () => ({ error: null }) as UseQueryResult<WalletState>,
    preloadProverWorker: async () => {},
  };
}
