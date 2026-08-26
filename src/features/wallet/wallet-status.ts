// Pure derivation: connection + build state → user-facing wallet status.

import type { WalletApi } from "@lelantos-org/sdk/wallet";
import type { WalletStatus } from "./types";
import type { Connection } from "./use-connection";

export interface WalletStatusInputs {
  conn: Connection;
  wallet: WalletApi | undefined;
  deriveError: string | undefined;
  hasCachedKey: boolean;
}

/// The wallet's network *is* the app's chain, so an unsupported one is a hard
/// stop rather than a mismatch to reconcile later.
///
/// There is no chain to fall back to: every pool address, tree depth and asset
/// list is per-chain, so on an unknown network the app has nothing correct to
/// show. Ranked above `deriveError` because a derive failure there is a
/// consequence, not the cause.
export function deriveWalletStatus({
  conn,
  wallet,
  deriveError,
  hasCachedKey,
}: WalletStatusInputs): WalletStatus {
  if (!conn.isConnected) return conn.isConnecting ? "connecting" : "disconnected";
  if (!conn.chainSupported) return "unsupported-chain";
  if (deriveError) return "error";
  if (wallet) return "ready";
  return hasCachedKey ? "resuming" : "deriving";
}
