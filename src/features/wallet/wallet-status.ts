// Pure derivation: connection + build state → user-facing wallet status.

import type { WalletApi } from "@lelantos-org/sdk/wallet";
import type { WalletStatus } from "@/features/wallet/types";
import type { Connection } from "@/features/wallet/use-connection";

export interface WalletStatusInputs {
  conn: Connection;
  wallet: WalletApi | undefined;
  deriveError: string | undefined;
  hasCachedKey: boolean;
}

export function deriveWalletStatus({
  conn,
  wallet,
  deriveError,
  hasCachedKey,
}: WalletStatusInputs): WalletStatus {
  if (!conn.isConnected) return conn.isConnecting ? "connecting" : "disconnected";
  if (!conn.chainOk) return "wrong-chain";
  if (deriveError) return "error";
  if (wallet) return "ready";
  return hasCachedKey ? "resuming" : "deriving";
}
