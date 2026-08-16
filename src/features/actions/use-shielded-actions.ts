import type { ShieldedActions } from "@/features/actions/port";
import { createSdkActions } from "@/features/actions/sdk-adapter";
import { useActiveChain } from "@/features/chain/ChainProvider";
import { useWallet } from "@/features/wallet";

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
