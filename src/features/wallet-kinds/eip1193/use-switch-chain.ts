import type { ChainEntry } from "@/config/chains";
import { eip1193Kind } from "./kind";

/// Move the injected wallet to `target`.
export function useSwitchChain(): (target: ChainEntry) => void {
  return eip1193Kind.switchChain;
}
