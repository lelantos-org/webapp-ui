import { useSwitchChain } from "@/features/wallet-kinds";
import { ArrowRightGlyph } from "@/shared/ui/glyphs";
import { ChainIcon } from "@/shared/ui/icons/ChainIcon";
import type { ChainMismatch } from "../chain-guard";
import "./claim-cards.css";

/// The stop between connect and scan: the wallet is on a chain where the link's
/// notes do not exist.
///
/// A warning rather than an error: nothing has failed and the link is still
/// valid. One remedy, named after where the funds are rather than after the
/// mistake — "These funds live on Base", not "Wrong network".
export function NetworkGateCard({ mismatch }: { mismatch: ChainMismatch }) {
  const switchChain = useSwitchChain();
  const { link, walletChainId, walletLabel } = mismatch;
  return (
    <section className="surface surface--card claim-card claim-card--warn">
      <div className="claim-card__head">
        <h2 className="claim-card__t">These funds live on {link.chainName}</h2>
        <p className="claim-card__sub">
          Your wallet is on {walletLabel}. They can only be claimed from the network they were sent
          on.
        </p>
      </div>
      <div className="claim-hop">
        <span className="pill claim-hop__pill">
          <ChainIcon chainId={walletChainId} chainName={walletLabel} />
          {walletLabel}
        </span>
        <ArrowRightGlyph size={16} className="claim-hop__arrow" />
        <span className="pill claim-hop__pill claim-hop__pill--to">
          <ChainIcon chainId={link.chainId} chainName={link.chainName} />
          {link.chainName}
        </span>
      </div>
      <button type="button" className="btn btn--cta btn--sm" onClick={() => switchChain(link)}>
        Switch to {link.chainName}
      </button>
    </section>
  );
}
