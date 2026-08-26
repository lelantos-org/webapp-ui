import { useActiveChain } from "@/features/chain";
import { useWallet } from "@/features/wallet";
import type { ShieldedActions } from "./port";
import { createSdkActions } from "./sdk-adapter";

/// Returns a `ShieldedActions` port bound to the current wallet, or
/// `undefined` while the wallet isn't ready. Mutation hooks should fail loudly
/// (`requireActions`) rather than silently no-op.
export function useShieldedActions(): ShieldedActions | undefined {
  const { wallet } = useWallet();
  const chain = useActiveChain();
  return wallet ? createSdkActions(wallet, chain) : undefined;
}

export function requireActions(a: ShieldedActions | undefined): ShieldedActions {
  if (!a) throw new Error("wallet not ready");
  return a;
}
