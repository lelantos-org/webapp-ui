import { useWallet } from "@/features/wallet";
import { shortAddr } from "@/shared/lib/format";

export function ConnectButton() {
  const { status, ethAddress, connect, disconnect, error } = useWallet();

  if (status === "disconnected") {
    return (
      <button type="button" className="btn" onClick={connect}>
        connect wallet
      </button>
    );
  }
  if (status === "connecting") return <span className="muted">connecting…</span>;
  if (status === "deriving") {
    return <span className="muted">check your wallet — sign to derive your shielded key</span>;
  }
  if (status === "resuming") {
    return <span className="muted">resuming…</span>;
  }
  if (status === "error") {
    return (
      <span className="err" title={error}>
        error
      </span>
    );
  }
  // One chip, not an address beside a button: the word "disconnect" was the
  // widest thing in the bar and is a rare action, so it becomes an icon that
  // keeps its accessible name.
  return (
    <span className="pill account">
      <span className="mono account__addr">{shortAddr(ethAddress)}</span>
      <button
        type="button"
        className="account__disconnect"
        onClick={disconnect}
        title="disconnect"
        aria-label="disconnect"
      >
        <DisconnectIcon />
      </button>
    </span>
  );
}

function DisconnectIcon() {
  return (
    // Decorative: `aria-hidden` keeps it out of the accessibility tree and the
    // wrapping button carries the name, so a <title> would be inert markup.
    // biome-ignore lint/a11y/noSvgWithoutTitle: labelled by the parent button
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M10 5H7a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h3M16 15l4-3-4-3M20 12H10"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
