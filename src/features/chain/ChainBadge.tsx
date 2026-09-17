import { ChainIcon } from "@/shared/ui/icons/ChainIcon";
import { useActiveChainOrUndefined } from "./ChainProvider";
import "./ChainBadge.css";

/// Read-only pill naming the connected network; nothing when there is no supported chain.
export function ChainBadge() {
  const chain = useActiveChainOrUndefined();
  if (!chain) return null;

  return (
    <span className="pill chain-badge" title={`chain id ${chain.chainId}`}>
      <ChainIcon
        chainId={chain.chainId}
        chainName={chain.chainName}
        className="chain-badge__mark"
      />
      <span className="sr-only">Network: </span>
      <span className="chain-badge__name">{chain.chainName}</span>
    </span>
  );
}
