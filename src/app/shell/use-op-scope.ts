import { useActiveChainOrUndefined } from "@/features/chain";
import { opScope } from "@/features/tx";
import { useWallet } from "@/features/wallet";

/// The scope the connected account's transactions are filed under; empty before a chain is known.
export function useOpScope(): string {
  const { wallet } = useWallet();
  const chain = useActiveChainOrUndefined();
  return chain ? opScope(chain.chainId, wallet?.address) : "";
}
