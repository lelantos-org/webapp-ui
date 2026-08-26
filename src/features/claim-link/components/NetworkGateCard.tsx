import { ChainSwitchButtons } from "@/features/chain";
import type { ChainMismatch } from "../chain-guard";

/// The stop between connect and scan: the wallet is on a chain where the link's
/// notes do not exist.
///
/// Uses the same structure as `BadLinkCard` — mark, short title, one line of
/// explanation, one action — since both mark a halted flow with a single
/// remedy. A warning rather than an error: nothing has failed and the link is
/// still valid.
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
