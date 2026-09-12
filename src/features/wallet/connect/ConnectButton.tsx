import { useEffect, useId, useRef, useState } from "react";
import { kindAdapter } from "@/features/wallet-kinds";
import { shortAddr } from "@/shared/lib/address";
import { copyWithToast } from "@/shared/lib/use-copy";
import { useTheme } from "@/shared/lib/use-theme";
import { PowerGlyph } from "@/shared/ui/glyphs";
import { useWallet } from "../session/use-wallet";
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

/// The phone header's avatar and its menu: copy address, theme, disconnect.
///
/// A disclosure of plain buttons rather than an ARIA `menu`: three actions do
/// not need roving focus, and a `menu` role promises arrow-key behaviour a
/// screen-reader user would then expect. Escape and a press outside close it,
/// and Escape returns focus to the avatar so the keyboard is not stranded.
function AccountMenu({
  initials,
  shown,
  onCopy,
  onDisconnect,
}: {
  initials: string;
  shown: string;
  onCopy(): void;
  onDisconnect(): void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    wrapRef.current?.querySelector<HTMLButtonElement>(".account-menu__item")?.focus();
    const onPointer = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const run = (action: () => void) => () => {
    setOpen(false);
    action();
  };

  return (
    <span className="account-menu" ref={wrapRef}>
      <button
        ref={triggerRef}
        type="button"
        className="account-menu__avatar mono"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label={`Account ${shown}`}
        onClick={() => setOpen((o) => !o)}
      >
        {initials}
      </button>
      {open ? (
        <div className="account-menu__panel" id={panelId}>
          <span className="account-menu__addr mono">{shown}</span>
          <button type="button" className="link-btn account-menu__item" onClick={run(onCopy)}>
            Copy address
          </button>
          {/* Mounted only while open, so it reads the theme in force now rather
              than the one the header's own toggle last set. It leaves the menu
              open: the new theme is the confirmation, and unmounting the item
              in the same commit would drop the effect that stamps it. */}
          <ThemeItem />
          <button
            type="button"
            className="link-btn account-menu__item account-menu__item--danger"
            onClick={run(onDisconnect)}
          >
            Disconnect
          </button>
        </div>
      ) : null}
    </span>
  );
}

function ThemeItem() {
  const { theme, toggle } = useTheme();
  return (
    <button type="button" className="link-btn account-menu__item" onClick={toggle}>
      {theme === "dark" ? "Light theme" : "Dark theme"}
    </button>
  );
}

/// Two characters that identify the connected account at a glance.
///
/// The Ethereum address when there is one, since that is the account the user's
/// wallet shows them: the two hex digits after `0x`, lower-cased so the avatar
/// does not change with checksum casing. A passkey session has no public
/// account, so the shielded address stands in — the first two characters of its
/// bech32 data part, after the `lelantos1` prefix every address shares and that
/// would make every avatar read the same.
export function accountInitials(eth: string | undefined, shielded: string | undefined): string {
  if (eth && /^0x[0-9a-f]{2}/i.test(eth)) return eth.slice(2, 4).toLowerCase();
  if (!shielded) return "";
  const sep = shielded.lastIndexOf("1");
  const data = sep > 0 ? shielded.slice(sep + 1) : shielded;
  return data.slice(0, 2).toLowerCase();
}
