// Pure derivation: connection + build state → user-facing wallet status.

import type { WalletApi } from "@lelantos-org/sdk";
import type { WalletStatus } from "./context";
import type { Session } from "./session";

export interface WalletStatusInputs {
  session: Session;
  wallet: WalletApi | undefined;
  deriveError: string | undefined;
  hasCachedKey: boolean;
}

/// The wallet's network is the app's chain, so an unsupported one is a hard stop
/// rather than a mismatch to reconcile later.
///
/// Only for a wallet that has a network of its own. A passkey does not: it
/// selects a chain from the registry, so `chainSupported` is always true for it
/// and `unsupported-chain` is unreachable.
///
/// There is no chain to fall back to: every pool address, tree depth and asset
/// list is per-chain, so on an unknown network there is nothing correct to show.
/// Ranked above `deriveError`, since a derive failure there is a consequence
/// rather than the cause.
export function deriveWalletStatus({
  session,
  wallet,
  deriveError,
  hasCachedKey,
}: WalletStatusInputs): WalletStatus {
  if (!session.isConnected) return session.isConnecting ? "connecting" : "disconnected";
  if (!session.chainSupported) return "unsupported-chain";
  if (deriveError) return "error";
  if (wallet) return "ready";
  return hasCachedKey ? "resuming" : "deriving";
}
