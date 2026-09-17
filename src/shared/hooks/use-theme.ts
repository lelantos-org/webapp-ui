import { useCallback, useSyncExternalStore } from "react";
import { createSubscribers } from "@/shared/lib/external-store";
import { LOCAL_KEYS } from "@/shared/lib/storage/keys";
import { localStore } from "@/shared/lib/storage/safe";

export type Theme = "dark" | "light";

const KEY = LOCAL_KEYS.theme;
const LIGHT_QUERY = "(prefers-color-scheme: light)";

const subscribers = createSubscribers();

/// The explicit choice on `<html>`, else the system preference.
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
  const media = typeof matchMedia === "function" ? matchMedia(LIGHT_QUERY) : undefined;
  media?.addEventListener("change", onChange);
  return () => {
    unsubscribe();
    media?.removeEventListener("change", onChange);
  };
}

function choose(next: Theme): void {
  document.documentElement.setAttribute("data-theme", next);
  paintChrome(next);
  localStore.set(KEY, next);
  subscribers.notify();
}

/// The active theme, read from the `data-theme` attribute `public/theme-init.js` stamps, and its toggle.
export function useTheme(): { theme: Theme; toggle(): void } {
  const theme = useSyncExternalStore(subscribe, current, () => "dark" as const);
  const toggle = useCallback(() => choose(current() === "dark" ? "light" : "dark"), []);
  return { theme, toggle };
}
