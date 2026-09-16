// Stand-ins for the `wallet` feature's context.
//
// For `vi.mock` factories: call these inside the returned hooks
// (`useWallet: () => fakeWalletContext(...)`), not in the factory body — see
// `fakes/chain.ts` for why. Types only from the app, so importing this never
// pulls in a module a test is mocking.

import type { WalletApi } from "@lelantos-org/sdk";
import type { WalletCapabilities, WalletContextValue } from "@/features/wallet";

const DISCONNECTED = { allowed: false, reason: "Connect a wallet first." } as const;

/// What a disconnected wallet may do: nothing, with the provider's reason.
const NO_CAPABILITIES: WalletCapabilities = {
  deposit: DISCONNECTED,
  depositEth: DISCONNECTED,
};

/// A `WalletApi` carrying only the members a test gives it.
///
/// The one sanctioned cast for wallet fakes: `WalletApi` is a wide SDK surface
/// and a hook under test reads two or three members of it. A member the test did
/// not supply is `undefined` at runtime, so an unexpected read fails loudly.
export function fakeWalletApi(
  members: Partial<WalletApi> | Record<string, unknown> = {},
): WalletApi {
  return members as WalletApi;
}

/// A full `useWallet()` value.
///
/// `status` follows `wallet` — `"ready"` with one, `"disconnected"` without —
/// unless given. The actions are plain no-ops; a test asserting on one passes its
/// own `vi.fn()`.
export function fakeWalletContext(over: Partial<WalletContextValue> = {}): WalletContextValue {
  return {
    status: over.wallet ? "ready" : "disconnected",
    capabilities: NO_CAPABILITIES,
    connect: () => {},
    disconnect: () => {},
    ...over,
  };
}
