import { useActiveChainOrUndefined } from "./ChainProvider";

/// Which network the app is connected to. Read-only: the wallet's network is the
/// single source of truth, so there is nothing to select here.
///
/// Renders the label and name only. The surrounding pill and status dot belong to
/// `hdr__status` in `Layout`, which groups this with the health indicator so the
/// two read as one status rather than two widgets.
///
/// Renders nothing when the wallet is absent or on an unsupported chain, which
/// `Welcome` already covers.
export function ChainBadge() {
  const chain = useActiveChainOrUndefined();
  if (!chain) return null;

  return (
    <span className="chain-badge" title={`chain id ${chain.chainId}`}>
      <span className="chain-badge__label">network</span>
      <span className="chain-badge__name">{chain.chainName}</span>
    </span>
  );
}
