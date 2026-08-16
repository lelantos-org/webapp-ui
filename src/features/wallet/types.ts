import type { WalletApi } from "@lelantos-org/sdk/wallet";
import type { ChainEntry } from "@/config/chains";

export type WalletStatus =
  | "disconnected"
  | "connecting"
  /// Connected, but the wallet's network is not one this deployment serves.
  /// Blocking: no balance or form would be meaningful on an unknown pool.
  | "unsupported-chain"
  /// Awaiting EIP-712 signature in the user's wallet.
  | "deriving"
  /// Rebuilding from a cached nsk in sessionStorage — no signature prompt.
  | "resuming"
  | "ready"
  | "error";

export interface WalletContextValue {
  status: WalletStatus;
  error?: string;
  wallet?: WalletApi;
  ethAddress?: `0x${string}`;
  connect(): void;
  disconnect(): void;
  switchChain(target: ChainEntry): void;
  refresh(): Promise<void>;
}
