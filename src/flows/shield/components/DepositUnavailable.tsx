import { useWallet } from "@/features/wallet";
import { kindAdapter } from "@/features/wallet-kinds";
import "./DepositUnavailable.css";

/// Shown in place of the deposit form when this wallet cannot deposit.
export function DepositUnavailable({ reason }: { reason?: string | undefined }) {
  const { connect, kind } = useWallet();
  const advice = (kind && kindAdapter(kind).copy.noDepositAdvice) || [];

  return (
    <section
      className="surface surface--card screen-card shield-off"
      aria-labelledby="shield-off-t"
    >
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
