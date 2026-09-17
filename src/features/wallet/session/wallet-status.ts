import type { WalletApi } from "@lelantos-org/sdk";
import type { WalletStatus } from "./context";
import type { Session } from "./session";

export interface WalletStatusInputs {
  session: Session;
  wallet: WalletApi | undefined;
  deriveError: string | undefined;
  hasCachedKey: boolean;
}

/// The user-facing wallet status; an unserved chain outranks a derive error, which it causes.
export function deriveWalletStatus({
  session,
  wallet,
  deriveError,
  hasCachedKey,
}: WalletStatusInputs): WalletStatus {
  if (!session.isConnected) return session.isConnecting ? "connecting" : "disconnected";
  if (session.registry.status === "loading" || session.registry.status === "idle") {
    return "loading-networks";
  }
  if (session.registry.status === "failed") return "error";
  if (!session.chainSupported) return "unsupported-chain";
  if (deriveError) return "error";
  if (wallet) return "ready";
  return hasCachedKey ? "resuming" : "deriving";
}
