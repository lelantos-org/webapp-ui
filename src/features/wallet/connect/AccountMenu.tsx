import { useEffect, useId, useRef, useState } from "react";
import { useTheme } from "@/shared/hooks/use-theme";
import "./ConnectButton.css";

/// The phone header's avatar and its menu: copy address, theme, disconnect.
///
/// A disclosure of plain buttons rather than an ARIA `menu`: three actions do
/// not need roving focus, and a `menu` role promises arrow-key behaviour a
/// screen-reader user would then expect. Escape and a press outside close it,
/// and Escape returns focus to the avatar so the keyboard is not stranded.
export function AccountMenu({
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
