import type { ChainEntry } from "@/config/chains";
import { eip1193Kind } from "./eip1193/kind";
import { useWalletKinds } from "./kinds";

/// Move the session to `target` the way its kind does: the wallet is asked, or the app selects.
/// Before a session, the injected wallet is asked.
export function useSwitchChain(): (target: ChainEntry) => void {
  const adapter = useWalletKinds().active?.adapter ?? eip1193Kind;
  return (target) => adapter.switchChain(target);
}
