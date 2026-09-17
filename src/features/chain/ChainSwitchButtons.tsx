import type { ChainEntry } from "@/config/chains";
import { useSwitchChain } from "@/features/wallet-kinds";
import { ChainIcon } from "@/shared/ui/icons/ChainIcon";
import { useActiveChainOrUndefined, useChainRegistry } from "./ChainProvider";

export interface ChainSwitchButtonsProps {
  /// Offer only this chain; omitted, every served chain is offered.
  only?: bigint;
  /// `"start"` aligns the buttons with a card body's text.
  align?: "center" | "start";
}

/// Buttons that switch the wallet to another supported chain (the current one is omitted).
export function ChainSwitchButtons({ only, align = "center" }: ChainSwitchButtonsProps) {
  const registry = useChainRegistry();
  const switchChain = useSwitchChain();
  const active = useActiveChainOrUndefined();

  const offered = registry.filter(
    (c) => (only === undefined || c.chainId === only) && c.chainId !== active?.chainId,
  );
  if (offered.length === 0) return null;

  return (
    <div className={`row row--center row--wrap${align === "start" ? " row--start" : ""}`}>
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
