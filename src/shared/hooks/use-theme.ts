// The active theme, and the one control that changes it.
//
// The attribute is stamped on <html> before first paint by `public/theme-init.js`
// — an external script rather than an inline one, because the production CSP
// drops 'unsafe-inline' from script-src. This hook reads what that script
// decided rather than re-deriving it, so the two can never disagree on the first
// frame.
//
// Persisted under one key so a cleared site storage falls back to the system
// preference rather than to a hardcoded default.
//
// The DOM is the store. Every caller reads the same attribute through
// `useSyncExternalStore`, so two mounted controls — the header toggle and the
// phone account menu — cannot drift apart. With a `useState` each, the second
// control's first click after the other switched would flip its stale copy back
// to what was already showing and do nothing visible.

import { useCallback, useSyncExternalStore } from "react";
import { createSubscribers } from "@/shared/lib/external-store";
import { LOCAL_KEYS } from "@/shared/lib/storage/keys";
import { localStore } from "@/shared/lib/storage/safe";

export type Theme = "dark" | "light";

const KEY = LOCAL_KEYS.theme;
const LIGHT_QUERY = "(prefers-color-scheme: light)";

/// Notified on an explicit choice. A system change reaches subscribers through
/// the media query each one attaches.
const subscribers = createSubscribers();

/// The theme in force: an explicit choice if there is one, otherwise whatever
/// the system currently prefers. Read rather than stored, so an OS change while
/// the app is open is followed until the user overrides it.
function current(): Theme {
  if (typeof document === "undefined") return "dark";
  const attr = document.documentElement.getAttribute("data-theme");
  if (attr === "light" || attr === "dark") return attr;
  return typeof matchMedia === "function" && matchMedia(LIGHT_QUERY).matches ? "light" : "dark";
}

/// Keep the browser-chrome colour in step with the ground, as `index.html` asks.
function paintChrome(theme: Theme): void {
  const meta = document.querySelector('meta[name="theme-color"]');
  meta?.setAttribute("content", theme === "light" ? "#F7F4ED" : "#14110E");
}

function subscribe(onChange: () => void): () => void {
  const unsubscribe = subscribers.subscribe(onChange);
  // Without an explicit choice the system preference is the theme, so a change
  // to it has to re-render the controls that name the current one.
  const media = typeof matchMedia === "function" ? matchMedia(LIGHT_QUERY) : undefined;
  media?.addEventListener("change", onChange);
  return () => {
    unsubscribe();
    media?.removeEventListener("change", onChange);
  };
}

/// Only stamps the attribute once a choice exists — see `public/theme-init.js`.
/// Until then it stays absent so the CSS media query keeps tracking the OS.
function choose(next: Theme): void {
  document.documentElement.setAttribute("data-theme", next);
  paintChrome(next);
  // Private mode or site data off: the write fails and the choice lasts the
  // session, which is better than refusing to switch at all.
  localStore.set(KEY, next);
  subscribers.notify();
}

export function useTheme(): { theme: Theme; toggle(): void } {
  const theme = useSyncExternalStore(subscribe, current, () => "dark" as const);
  const toggle = useCallback(() => choose(current() === "dark" ? "light" : "dark"), []);
  return { theme, toggle };
}
