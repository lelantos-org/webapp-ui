// Which wallet to reattach to, in `localStorage`.
//
// Two keys with opposite lifetimes, which is why they are not one:
//
//   - the *attached* rdns is a session latch, cleared by `disconnect`, so a
//     resume never reattaches something the user explicitly walked away from;
//   - the *preferred* rdns is a lasting choice that must outlive a session, so
//     the picker can order by it on the connect following a disconnect.

import { localStore } from "@/shared/lib/storage";

/// The wallet currently attached. Cleared on disconnect.
const ATTACHED_KEY = "lelantos:wallet:rdns";

/// The wallet last chosen, kept across disconnects.
const PREFERRED_KEY = "lelantos:wallet:preferred-rdns";

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

/// The wallet chosen last time, if any. Survives a disconnect.
///
/// Used to order the picker.
export function preferredRdns(): string | undefined {
  return localStore.get(PREFERRED_KEY);
}
