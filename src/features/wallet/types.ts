import type { WalletApi } from "@lelantos-org/sdk/wallet";

export type WalletStatus =
  | "disconnected"
  | "connecting"
  | "wrong-chain"
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
  chainOk: boolean;
  connect(): void;
  disconnect(): void;
  switchChain(): void;
  refresh(): Promise<void>;
}
