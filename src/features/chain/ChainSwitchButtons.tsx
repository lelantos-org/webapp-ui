import type { ChainEntry } from "@/config/chains";
import { useSwitchChain } from "@/features/wallet-kinds";
import { ChainIcon } from "@/shared/ui/icons/ChainIcon";
import { useActiveChainOrUndefined, useChainRegistry } from "./context";

/// Buttons that switch the wallet to another supported chain (the current one is omitted).
export function ChainSwitchButtons() {
  const registry = useChainRegistry();
  const switchChain = useSwitchChain();
  const active = useActiveChainOrUndefined();

  const offered = registry.filter((c) => c.chainId !== active?.chainId);
  if (offered.length === 0) return null;

  return (
    <div className="row row--center row--wrap row--start">
      {offered.map((c: ChainEntry) => (
        <button
          key={c.chainId.toString()}
          type="button"
          className="btn"
          onClick={() => switchChain(c)}
        >
          <ChainIcon chainId={c.chainId} chainName={c.chainName} />
          switch to {c.chainName}
        </button>
      ))}
    </div>
  );
}
