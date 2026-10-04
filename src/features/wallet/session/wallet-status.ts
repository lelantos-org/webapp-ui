import type { WalletApi } from "@lelantos-org/sdk";
import type { WalletStatus } from "./context";
import type { Session } from "./session";

export interface WalletStatusInputs {
  session: Session;
  wallet: WalletApi | undefined;
  deriveError: string | undefined;
  hasCachedKey: boolean;
  /// The key was derived in this build: the prompt is answered and the wallet is on its way.
  keyResolved: boolean;
}

const WAITING: ReadonlySet<WalletStatus> = new Set([
  "connecting",
  "loading-networks",
  "deriving",
  "preparing",
  "resuming",
]);

/// Whether the connection is under way: neither settled nor waiting on the user to start it.
export function isConnectionPending(status: WalletStatus): boolean {
  return WAITING.has(status);
}

/// The user-facing wallet status; an unserved chain outranks a derive error, which it causes.
export function deriveWalletStatus({
  session,
  wallet,
  deriveError,
  hasCachedKey,
  keyResolved,
}: WalletStatusInputs): WalletStatus {
  if (!session.isConnected) {
    if (!session.isConnecting) return "disconnected";
    // A stored session coming back asks nothing of the user: not "approve in your wallet".
    return session.isRestoring ? "resuming" : "connecting";
  }
  if (session.registry.status === "loading" || session.registry.status === "idle") {
    return "loading-networks";
  }
  if (session.registry.status === "failed") return "error";
  if (!session.chainSupported) return "unsupported-chain";
  if (deriveError) return "error";
  if (wallet) return "ready";
  if (hasCachedKey) return "resuming";
  return keyResolved ? "preparing" : "deriving";
}
