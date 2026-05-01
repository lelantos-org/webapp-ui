import { createContext, useContext } from "react";
import type { WalletContextValue } from "@/features/wallet/types";

export const WalletContext = createContext<WalletContextValue | null>(null);

export function useWallet(): WalletContextValue {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet called outside <WalletProvider>");
  return ctx;
}
