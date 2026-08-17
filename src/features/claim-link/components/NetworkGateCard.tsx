import { ChainSwitchButtons } from "@/features/chain/ChainSwitchButtons";
import type { ChainMismatch } from "@/features/claim-link/chain-guard";

/// The stop between "connect" and "scan": the wallet is somewhere the link's
/// notes do not exist.
///
/// Built on the same grammar as `BadLinkCard` — mark, short title, one line of
/// why, one action — because it is the same kind of card: the flow has halted
/// and there is exactly one thing to do. Warn rather than error: nothing has
/// gone wrong, and the link is still good.
export function NetworkGateCard({ mismatch }: { mismatch: ChainMismatch }) {
  const from = mismatch.wallet?.chainName ?? `chain ${mismatch.walletChainId}`;

  return (
    <div className="card claim-net">
      <div className="claim-net__mark" aria-hidden>
        ⇄
      </div>
      <div className="stack stack--sm">
        <div className="claim-net__t">wrong network</div>
        <div className="claim-net__hop">
          <span className="claim-net__from">{from}</span>
          <span className="claim-net__arrow" aria-hidden>
            →
          </span>
          <span className="claim-net__to">{mismatch.link.chainName}</span>
        </div>
        <div className="muted txt-sm">
          these funds exist only on {mismatch.link.chainName}, and can be claimed only from there.
        </div>
        <ChainSwitchButtons only={mismatch.link.chainId} />
      </div>
    </div>
  );
}
