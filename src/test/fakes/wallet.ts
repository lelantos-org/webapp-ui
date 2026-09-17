import type { WalletApi } from "@lelantos-org/sdk";
import type { UseQueryResult } from "@tanstack/react-query";
import type {
  useSpendableMax,
  WalletCapabilities,
  WalletContextValue,
  WalletState,
} from "@/features/wallet";

const DISCONNECTED = { allowed: false, reason: "Connect a wallet first." } as const;

const NO_CAPABILITIES: WalletCapabilities = {
  deposit: DISCONNECTED,
  depositEth: DISCONNECTED,
  govern: DISCONNECTED,
};

/// Every capability allowed.
export const ALL_CAPABILITIES: WalletCapabilities = {
  deposit: { allowed: true },
  depositEth: { allowed: true },
  govern: { allowed: true },
};

/// Every capability refused, for the same reason.
export function deniedCapabilities(reason: string): WalletCapabilities {
  const no = { allowed: false, reason } as const;
  return { deposit: no, depositEth: no, govern: no };
}

/// A `WalletApi` carrying only the members a test gives it.
export function fakeWalletApi(
  members: Partial<WalletApi> | Record<string, unknown> = {},
): WalletApi {
  return members as WalletApi;
}

/// A full `useWallet()` value; `status` follows `wallet` unless given.
export function fakeWalletContext(over: Partial<WalletContextValue> = {}): WalletContextValue {
  return {
    status: over.wallet ? "ready" : "disconnected",
    capabilities: NO_CAPABILITIES,
    connect: () => {},
    disconnect: () => {},
    ...over,
  };
}

interface SpendFormWalletHooks {
  SyncNotice: () => null;
  useSpendableMax: typeof useSpendableMax;
  useWalletState: () => UseQueryResult<WalletState>;
  preloadProverWorker: () => Promise<void>;
}

/// The wallet hooks a spend form reads, for a synced wallet with an unknown max.
export function spendFormWalletHooks(): SpendFormWalletHooks {
  return {
    SyncNotice: () => null,
    useSpendableMax: () => undefined,
    useWalletState: () => ({ error: null }) as UseQueryResult<WalletState>,
    preloadProverWorker: async () => {},
  };
}
