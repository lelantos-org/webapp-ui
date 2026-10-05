import { useCallback } from "react";
import { createStore, useStore } from "@/shared/lib/external-store";
import { LOCAL_KEYS } from "@/shared/lib/storage/keys";
import { localStore } from "@/shared/lib/storage/safe";

const KEY = LOCAL_KEYS.hideAmounts;

const store = createStore(localStore.get(KEY) === "1");

function choose(hidden: boolean): void {
  if (hidden) localStore.set(KEY, "1");
  else localStore.remove(KEY);
  store.setState(hidden);
}

/// Privacy mode: whether the figures of what the wallet holds are masked, and its toggle.
export function usePrivacy(): { hidden: boolean; toggle(): void } {
  const hidden = useStore(store);
  const toggle = useCallback(() => choose(!store.getState()), []);
  return { hidden, toggle };
}
