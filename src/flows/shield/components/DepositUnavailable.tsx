// Shown in place of the deposit form when this wallet cannot deposit.
//
// A card rather than a disabled submit button. The gate is not about this
// deposit — the amount, the allowance, the fee — but about the wallet, and
// nothing the user types will change the answer. Letting them fill the form in
// first and refusing at submit would be the worse of the two.
//
// Built from the Shield screen's own card, so the route still reads as Shield
// with its header above it, and says exactly what is wrong and what would fix it.

import { useWallet } from "@/features/wallet";
import { kindAdapter } from "@/features/wallet-kinds";
import "../shield.css";

export function DepositUnavailable({ reason }: { reason?: string | undefined }) {
  const { connect, kind } = useWallet();
  const advice = (kind && kindAdapter(kind).copy.noDepositAdvice) || [];

  return (
    <section
      className="surface surface--card screen-card shield-off"
      aria-labelledby="shield-off-t"
    >
      {/* The generic heading: this card also serves a wallet whose chain
          connection simply cannot sign, for which "needs a browser wallet"
          would be the wrong advice. The verdict's own reason says which. */}
      <h2 className="shield-off__t" id="shield-off-t">
        Deposits unavailable
      </h2>
      {reason ? <p className="shield-off__p">{reason}</p> : null}
      {advice.map((line) => (
        <p key={line} className="shield-off__p shield-off__p--mute">
          {line}
        </p>
      ))}
      <button type="button" className="btn btn--cta" onClick={connect}>
        Connect a browser wallet
      </button>
    </section>
  );
}
