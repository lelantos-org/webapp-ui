import { ChainSwitchButtons } from "@/features/chain";
import type { ChainMismatch } from "../chain-guard";

/// The stop between "connect" and "scan": the wallet is somewhere the link's
/// notes do not exist.
///
/// Built on the same grammar as `BadLinkCard` — mark, short title, one line of
/// why, one action — because it is the same kind of card: the flow has halted
/// and there is exactly one thing to do. Warn rather than error: nothing has
/// gone wrong, and the link is still good.
export function NetworkGateCard({ mismatch }: { mismatch: ChainMismatch }) {
  return (
    <div className="card gate gate--warn">
      <div className="gate__mark" aria-hidden>
        ⇄
      </div>
      <div className="stack stack--sm">
        <div className="gate__t">wrong network</div>
        <div className="claim-hop">
          <span className="pill pill--sm claim-hop__from">{mismatch.walletLabel}</span>
          <span className="claim-hop__arrow" aria-hidden>
            →
          </span>
          <span className="pill pill--sm claim-hop__to">{mismatch.link.chainName}</span>
        </div>
        <div className="muted txt-sm">
          these funds exist only on {mismatch.link.chainName}, and can be claimed only from there.
        </div>
        <ChainSwitchButtons only={mismatch.link.chainId} align="start" />
      </div>
    </div>
  );
}
