import type { WalletApi } from "@lelantos-org/sdk";
import { createContext, useContext } from "react";
import type { WalletKind } from "@/features/wallet-kinds";
import type { WalletCapabilities } from "./capabilities";

export type WalletStatus =
  | "disconnected"
  | "connecting"
  /// Connected, fetching the chain registry.
  | "loading-networks"
  /// Connected, but on a network this deployment does not serve.
  | "unsupported-chain"
  /// Awaiting the key derivation prompt (EIP-712 signature or passkey unlock).
  | "deriving"
  /// Rebuilding from a cached nsk, without a prompt.
  | "resuming"
  | "ready"
  | "error";

export interface WalletContextValue {
  status: WalletStatus;
  error?: string | undefined;
  wallet?: WalletApi | undefined;
  /// Undefined while disconnected.
  kind?: WalletKind | undefined;
  /// Absent for a passkey session.
  ethAddress?: `0x${string}` | undefined;
  /// What this wallet may do; all-denied while disconnected.
  capabilities: WalletCapabilities;
  connect(): void;
  disconnect(): void;
}

export const WalletContext = createContext<WalletContextValue | null>(null);

/// The SDK wallet alone, so its readers do not re-render on session status changes.
export const WalletInstanceContext = createContext<{ wallet: WalletApi | undefined } | null>(null);

export function useWallet(): WalletContextValue {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet called outside <WalletProvider>");
  return ctx;
}

/// The connected SDK wallet, or `undefined` before one is built.
export function useWalletInstance(): WalletApi | undefined {
  const ctx = useContext(WalletInstanceContext);
  if (!ctx) throw new Error("useWalletInstance called outside <WalletProvider>");
  return ctx.wallet;
}
