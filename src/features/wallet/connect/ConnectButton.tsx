import { kindAdapter } from "@/features/wallet-kinds";
import { copyWithToast } from "@/shared/hooks/use-copy";
import { shortAddr } from "@/shared/lib/address";
import { PowerGlyph } from "@/shared/ui/icons/glyphs";
import { useWallet } from "../session/context";
import { AccountMenu } from "./AccountMenu";
import { accountInitials } from "./account-initials";
import "./ConnectButton.css";

/// The account control, in whichever state the connection is in.
///
/// Connected, it is two elements of which CSS shows one: the account pill on
/// wider screens (address and a power button) and a 32px avatar on phones,
/// which opens a small menu holding what the pill and
/// the theme toggle hold on a desktop. Both stay mounted so a resize never
/// loses the control under the cursor.
///
/// Before that, it is the connect button — which the claim page's gate still
/// renders — or a word for the step in progress.
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
  if (status === "deriving") {
    // The same copy the `Welcome` card shows, from the same place.
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

  // A passkey has no eth address, so the shielded one identifies the session
  // instead — `shortAddr(undefined)` would render an empty chip.
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
