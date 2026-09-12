import { ChainIcon } from "@/shared/ui/icons/ChainIcon";
import { useActiveChainOrUndefined } from "./ChainProvider";
import "./ChainBadge.css";

/// Which network the app is connected to. Read-only: the wallet's network is the
/// single source of truth, so there is nothing to select here.
///
/// A pill of its own with the network's mark and name: the header gives each of
/// health, network and account its own pill, and the mark says "network" faster
/// than a label would. A "Network" label stays for screen readers, where the
/// name alone would be read out of context.
///
/// Renders nothing when the wallet is absent or on an unsupported chain, which
/// `Welcome` already covers.
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
