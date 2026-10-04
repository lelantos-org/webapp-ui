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

/// Each theme's ground colour, `--bg` in tokens.css, for the browser chrome. `index.html`,
/// `public/theme-init.js` and the web manifest repeat them; `vite/theme-ground.test.ts` holds
/// the copies together.
const GROUND: Record<Theme, string> = { light: "#F7F4ED", dark: "#14110E" };

/// Sets every `theme-color` meta, the OS-conditional one included, to the chosen theme's ground.
function paintChrome(theme: Theme): void {
  for (const meta of document.querySelectorAll('meta[name="theme-color"]')) {
    meta.setAttribute("content", GROUND[theme]);
  }
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

/// The active theme and its toggle. Reads the `data-theme` attribute `public/theme-init.js` sets.
export function useTheme(): { theme: Theme; toggle(): void } {
  const theme = useSyncExternalStore(subscribe, current, () => "dark" as const);
  const toggle = useCallback(() => choose(current() === "dark" ? "light" : "dark"), []);
  return { theme, toggle };
}
