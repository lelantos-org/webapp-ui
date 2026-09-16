import type { WalletApi } from "@lelantos-org/sdk";
import { createContext, useContext } from "react";
import type { WalletKind } from "@/features/wallet-kinds";
import type { WalletCapabilities } from "./capabilities";

export type WalletStatus =
  | "disconnected"
  | "connecting"
  /// Connected, but the wallet's network is not one this deployment serves.
  /// Blocking: no balance or form would be meaningful on an unknown pool.
  | "unsupported-chain"
  /// Awaiting the key derivation: an EIP-712 signature in an injected wallet,
  /// or a user-verification unlock on a passkey.
  | "deriving"
  /// Rebuilding from a cached nsk in sessionStorage — no prompt.
  | "resuming"
  | "ready"
  | "error";

export interface WalletContextValue {
  status: WalletStatus;
  error?: string | undefined;
  wallet?: WalletApi | undefined;
  /// Which kind of wallet backs this session. Undefined while disconnected.
  kind?: WalletKind | undefined;
  /// Absent for a passkey session, which holds no public Ethereum account.
  ethAddress?: `0x${string}` | undefined;
  /// What this wallet may do. Always a full record — all-denied while
  /// disconnected — so no consumer needs a `?.`.
  capabilities: WalletCapabilities;
  connect(): void;
  disconnect(): void;
}

export const WalletContext = createContext<WalletContextValue | null>(null);

/// The SDK wallet on its own, apart from the session around it.
///
/// Most readers — every query keyed on the wallet, every mutation — read nothing
/// else, and the full context changes with the connection's status and error
/// while the wallet does not. Behind its own context they re-render when the
/// wallet does, not when the session does.
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
