// Test-only entry: imported by tests and `src/test`, never by the app.

import type { WalletApi } from "@lelantos-org/sdk";
import { type ReactNode, useMemo } from "react";
import { vi } from "vitest";
import type { WalletCapabilities } from "./session/capabilities";
import { WalletContext, type WalletContextValue, WalletInstanceContext } from "./session/context";

const DISCONNECTED = { allowed: false, reason: "Connect a wallet first." } as const;

const NO_CAPABILITIES: WalletCapabilities = {
  deposit: DISCONNECTED,
  depositEth: DISCONNECTED,
  govern: DISCONNECTED,
};

export const ALL_CAPABILITIES: WalletCapabilities = {
  deposit: { allowed: true },
  depositEth: { allowed: true },
  govern: { allowed: true },
};

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

const EVERY_SDK_CAPABILITY: WalletApi["capabilities"] = {
  prove: true,
  deposit: true,
  depositAllowance: true,
  nativeDeposit: true,
  nativeWithdraw: true,
  swap: true,
  registerName: true,
};

/// A `WalletApi` for an account at `address` that may do everything, syncs at once and holds
/// nothing, with `members` over that.
export function connectedWalletApi(
  address: string,
  members: Partial<WalletApi> | Record<string, unknown> = {},
): WalletApi {
  return fakeWalletApi({
    address,
    capabilities: EVERY_SDK_CAPABILITY,
    sync: async () => {},
    notes: async () => [],
    ...members,
  });
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

type BuildWallet = typeof import("./build/build-wallet").buildWallet;

let build: BuildWallet | undefined;

/// Build every wallet with `next`, in place of the SDK connection, its workers and its stores.
/// Call before a wallet connects.
export function stubWalletBuild(next: BuildWallet): void {
  build = next;
  // The build chunk is fetched once per test file, so the stand-in defers to the latest stub.
  vi.doMock("./build/build-wallet", () => ({
    buildWallet: (...args: Parameters<BuildWallet>) => {
      if (!build) throw new Error("stubWalletBuild: no build stubbed");
      return build(...args);
    },
  }));
}

/// The wallet contexts a test dictates, in place of `WalletProvider`: `useWallet()` answers
/// `value` and `useWalletInstance()` its `wallet`.
export function WalletTestProvider({
  value,
  children,
}: {
  value: WalletContextValue;
  children: ReactNode;
}) {
  const instance = useMemo(() => ({ wallet: value.wallet }), [value.wallet]);
  return (
    <WalletContext.Provider value={value}>
      <WalletInstanceContext.Provider value={instance}>{children}</WalletInstanceContext.Provider>
    </WalletContext.Provider>
  );
}
