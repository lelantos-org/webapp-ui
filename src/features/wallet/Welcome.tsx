import { ChainSwitchButtons } from "@/features/chain/ChainSwitchButtons";
import { useWallet } from "@/features/wallet";

export interface WelcomeProps {
  /// Bottom marketing copy; pages can override for context.
  tagline?: string;
}

/// Big, centered first-paint panel; adapts to wallet status.
export function Welcome({
  tagline = "private balances + transfers on Ethereum, secured by zk-SNARKs.",
}: WelcomeProps) {
  const { status, connect, error } = useWallet();

  return (
    <div className="welcome">
      <div className="welcome__inner">
        <div className="welcome__brand">LELANTOS</div>
        <h1 className="welcome__t">shielded wallet</h1>
        <p className="welcome__sub muted">{tagline}</p>

        {status === "disconnected" ? (
          <>
            <button type="button" className="btn btn--xl" onClick={connect}>
              connect wallet
            </button>
            <p className="welcome__hint muted">
              no funds move — just an EIP-712 signature to derive your shielded keys.
            </p>
          </>
        ) : null}

        {status === "unsupported-chain" ? (
          <div className="welcome__panel">
            <h3 className="warn">unsupported network</h3>
            <p className="muted">
              your wallet is on a network this deployment does not serve. switch it to continue —
              your shielded address is the same on every chain.
            </p>
            <ChainSwitchButtons />
          </div>
        ) : null}

        {status === "connecting" ? (
          <div className="welcome__panel">
            <span className="spinner spinner--lg" aria-hidden />
            <h3>connecting…</h3>
            <p className="muted">approve the connection request in your wallet.</p>
          </div>
        ) : null}

        {status === "deriving" ? (
          <div className="welcome__panel">
            <span className="spinner spinner--lg" aria-hidden />
            <h3>check your wallet</h3>
            <p>sign the EIP-712 message to derive your shielded key.</p>
            <div className="welcome__rule" />
            <p className="muted txt-xs">
              no funds move. the signature only proves ownership of your eth address.
            </p>
          </div>
        ) : null}

        {status === "resuming" ? (
          <div className="welcome__panel">
            <span className="spinner spinner--lg" aria-hidden />
            <h3>resuming session…</h3>
            <p className="muted">unlocking your shielded wallet.</p>
          </div>
        ) : null}

        {status === "error" ? (
          <div className="welcome__panel">
            <h3 className="err">connection failed</h3>
            <p className="muted">{error ?? "unknown error"}</p>
            <button type="button" className="btn" onClick={connect}>
              retry
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
