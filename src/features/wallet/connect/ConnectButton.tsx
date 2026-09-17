import { kindAdapter } from "@/features/wallet-kinds";
import { copyWithToast } from "@/shared/hooks/use-copy";
import { shortAddr } from "@/shared/lib/address";
import { PowerGlyph } from "@/shared/ui/icons/glyphs";
import { useWallet } from "../session/context";
import { AccountMenu } from "./AccountMenu";
import { accountInitials } from "./account-initials";
import "./ConnectButton.css";

/// The account control: connect button, progress word, or account pill (desktop) and avatar (phone).
export function ConnectButton() {
  const { status, ethAddress, kind, wallet, connect, disconnect, error } = useWallet();

  if (status === "disconnected") {
    return (
      <button type="button" className="btn" onClick={connect}>
        Connect wallet
      </button>
    );
  }
  if (status === "connecting") return <span className="muted">Connecting…</span>;
  if (status === "loading-networks") return <span className="muted">Loading networks…</span>;
  if (status === "deriving") {
    const deriving = kind ? kindAdapter(kind).copy.deriving : undefined;
    return (
      <span className="muted">{deriving ? `${deriving.title} — ${deriving.body}` : null}</span>
    );
  }
  if (status === "resuming") {
    return <span className="muted">Resuming…</span>;
  }
  if (status === "error") {
    return (
      <span className="err" title={error}>
        Error
      </span>
    );
  }

  const shielded = wallet?.address ?? "";
  const shown = ethAddress ? shortAddr(ethAddress, 4) : shortAddr(shielded, 8);
  const copyable = ethAddress ?? shielded;

  return (
    <>
      <span className="pill account">
        <span className="mono account__addr" title={copyable}>
          {shown}
        </span>
        <button
          type="button"
          className="account__power"
          onClick={disconnect}
          title="Disconnect"
          aria-label="Disconnect"
        >
          <PowerGlyph size={13} />
        </button>
      </span>
      <AccountMenu
        initials={accountInitials(ethAddress, shielded)}
        shown={shown}
        onCopy={() => void copyWithToast(copyable, "Address copied")}
        onDisconnect={disconnect}
      />
    </>
  );
}
