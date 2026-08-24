import { useActiveChainOrUndefined } from "@/features/chain/ChainProvider";
import { ChainIcon } from "@/features/icons/ChainIcon";

/// Which network the app is talking to. Read-only by design.
///
/// The wallet's network is the single source of truth, so there is nothing to
/// pick here — this reports, it does not configure.
///
/// Renders the label and name only: the surrounding pill and the status dot
/// belong to `hdr__status` in `Layout`, which groups this with the health
/// indicator. They are one fact from the user's side — "am I connected, and to
/// what" — and were two competing widgets when each drew its own chrome.
///
/// Nothing when the wallet is absent or on an unsupported chain; `Welcome` is
/// already covering the screen with that reason.
export function ChainBadge() {
  const chain = useActiveChainOrUndefined();
  if (!chain) return null;

  return (
    <span className="chain-badge" title={`chain id ${chain.chainId}`}>
      <span className="chain-badge__label">network</span>
      <ChainIcon chainId={chain.chainId} chainName={chain.chainName} />
      <span className="chain-badge__name">{chain.chainName}</span>
    </span>
  );
}
