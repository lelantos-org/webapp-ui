import { LOCAL_KEYS } from "@/shared/lib/storage/keys";
import { localStore } from "@/shared/lib/storage/safe";

/// The wallet currently attached. Cleared on disconnect.
const ATTACHED_KEY = LOCAL_KEYS.walletRdns;

/// The wallet last chosen, kept across disconnects.
const PREFERRED_KEY = LOCAL_KEYS.preferredRdns;

/// The wallet a resume should reattach to, if any.
export function attachedRdns(): string | undefined {
  return localStore.get(ATTACHED_KEY);
}

/// Record a successful connect, updating both the latch and the preference.
export function rememberRdns(rdns: string): void {
  localStore.set(ATTACHED_KEY, rdns);
  localStore.set(PREFERRED_KEY, rdns);
}

/// Release the latch, leaving the preference intact.
export function forgetAttachedRdns(): void {
  localStore.remove(ATTACHED_KEY);
}

/// The wallet chosen last time, kept across disconnects. Orders the picker.
export function preferredRdns(): string | undefined {
  return localStore.get(PREFERRED_KEY);
}
