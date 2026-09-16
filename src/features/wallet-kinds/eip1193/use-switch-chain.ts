import type { ChainEntry } from "@/config/chains";
import { eip1193Kind } from "./kind";

/// Move the injected wallet to `target`.
///
/// Lives beside the store rather than on the shielded-wallet context: it is
/// purely an EIP-1193 operation, and `features/chain` needs it, so routing it
/// through `useWallet` would make `features/chain` depend on `features/wallet`,
/// which already depends on `features/chain`.
///
/// Fire-and-forget with a toast: the caller is a button, the outcome arrives
/// asynchronously through `chainChanged`, and a rejected prompt is a normal user
/// action rather than an error to propagate. The switch itself is
/// `eip1193Kind.switchChain`, a module constant, so the identity is stable.
export function useSwitchChain(): (target: ChainEntry) => void {
  return eip1193Kind.switchChain;
}
