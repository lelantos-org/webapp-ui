// The connect flow: which wallet first, then the connection.
//
// Split from `session.ts`: choosing among the available wallets has its own
// state and lifetime, while the stores track whichever one ended up attached.
// The chosen row is dispatched to the store that owns it, so a user with
// several wallets installed selects which one holds their key rather than
// falling through to `ProviderRegistry.pick`'s tiebreak.

import { useCallback, useMemo, useState } from "react";
import {
  type Eip6963ProviderDetail,
  eip1193Store,
  preferredRdns,
  selectKind,
  storedCredential,
  WALLET_KINDS,
  type WalletKind,
} from "@/features/wallet-kinds";
import { useStore } from "@/shared/lib/external-store";

/// One row in the picker.
///
/// `id` is whatever attaching needs: an EIP-6963 `rdns` for an injected wallet,
/// and the kind's own name for every other row, since those kinds have one
/// session each and read whatever they need from storage.
///
/// The injected variant is the only one written out, because it is the only one
/// carrying an extension-supplied `icon` — a string the picker must not trust.
/// Every other kind falls into the second variant without this file changing.
export type WalletChoice =
  | { kind: "eip1193"; id: string; name: string; icon: string }
  | { kind: Exclude<WalletKind, "eip1193">; id: string; name: string };

export interface ConnectFlow {
  /// The wallets to choose between, snapshotted when the picker opened;
  /// `null` while it is closed.
  ///
  /// A snapshot rather than a live subscription, so the list does not reorder
  /// under the cursor when a late extension announces; the modal's copy directs
  /// the user to reopen it in that case.
  choices: WalletChoice[] | null;
  /// What `useWallet().connect` becomes: choose, then connect.
  begin(): void;
  choose(choice: WalletChoice): void;
  cancel(): void;
}

export function useConnectFlow(): ConnectFlow {
  const [choices, setChoices] = useState<WalletChoice[] | null>(null);

  const begin = useCallback(() => {
    // Catches an extension installed after boot; `WalletProvider`'s mount effect
    // covers the usual case well before a click is possible.
    eip1193Store.startDiscovery();
    const discovered = eip1193Store.getState().discovered;
    const offered = offerings(discovered);
    if (offered.length > 1) {
      setChoices(offered);
      return;
    }
    // One wallet, or none announced yet. `connect()` waits out the announce
    // window and reports "no wallet detected" if it stays empty, so a picker with
    // zero or one row would add a click without adding information.
    //
    // The single row decides the kind rather than being assumed an extension: on
    // a device with no wallet installed but passkeys available, it is the
    // passkey. An empty list is the injected kind, which is the branch that
    // waits. No id is passed either way — zero and one announced wallets are the
    // same case, and `connect()` waits out the announce window itself.
    selectKind(offered[0]?.kind ?? "eip1193");
  }, []);

  const choose = useCallback((choice: WalletChoice) => {
    setChoices(null);
    attach(choice);
  }, []);

  // Dismiss closes the picker only: no provider was attached, so there is nothing
  // to disconnect and the store is still `idle`.
  const cancel = useCallback(() => setChoices(null), []);

  return { choices, begin, choose, cancel };
}

/// The same rows the picker would offer, live.
///
/// For the Welcome screen's inline wallet card, which is on screen before any
/// click and so cannot wait for `begin` to snapshot a list. Live rather than a
/// snapshot: nothing is under the cursor yet when an extension announces late,
/// and a card that missed it would tell the user their wallet is not there.
export function useWalletChoices(): WalletChoice[] {
  const discovered = useStore(eip1193Store, (s) => s.discovered);
  return useMemo(() => offerings(discovered), [discovered]);
}

/// Hand a chosen row to the kind that owns it.
///
/// `selectKind` detaches the kinds it is not choosing, which is what makes the
/// pick stick; see the invariant on `features/wallet-kinds`. The injected row's
/// `id` is an rdns, naming which of several installed extensions to latch —
/// every other kind has one instance and ignores it.
///
/// Exported for the inline card, which picks a row without the picker's state.
export function attach(choice: WalletChoice): void {
  selectKind(choice.kind, choice.id);
}

/// Whether the passkey row leads the picker.
///
/// The passkey is the only phishing-resistant path on offer. WebAuthn binds the
/// credential to `rp.id`, so an origin merely *resembling* this one cannot
/// obtain the PRF at all — the authenticator refuses, without the user having to
/// notice anything. The EIP-712 derivation has no equivalent and cannot be given
/// one: it signs a public constant (`LELANTOS_NSK_DOMAIN`), so any site that
/// gets that message signed holds the spending key, and putting an origin in the
/// domain only means the attacker copies it too. Which row leads is the cheapest
/// lever there is on which of the two a new user ends up with.
///
/// Not unconditional, because a returning user has already answered this. A
/// device that enrolled a passkey leads with it. Otherwise a stored rdns means
/// the user has attached an extension before and is here to reconnect, and
/// reordering under them costs more than it protects. With neither, nothing is
/// being overridden and the safer path is the default.
function preferPasskey(): boolean {
  if (storedCredential() !== undefined) return true;
  return preferredRdns() === undefined;
}

/// The rows to offer: the passkey or the installed extensions first depending on
/// `preferPasskey`, then every other kind that says it is usable on this device.
function offerings(discovered: Eip6963ProviderDetail[]): WalletChoice[] {
  const injected: WalletChoice[] = preferredFirst(discovered, preferredRdns()).map((d) => ({
    kind: "eip1193",
    id: d.info.rdns,
    name: d.info.name,
    icon: d.info.icon,
  }));

  // Every other kind contributes one row when it says it is usable here.
  // Withholding is the adapter's call: a passkey on a device whose
  // authenticator lacks PRF has no fallback derivation, so offering it would
  // only reproduce a terminal failure.
  const others = WALLET_KINDS.filter((a) => a.kind !== "eip1193" && a.available()).map((a) => ({
    kind: a.kind,
    id: a.kind,
    name: a.copy.label(),
  })) as WalletChoice[];

  // Split rather than sorted: only the passkey row is being promoted, and every
  // other kind keeps its `WALLET_KINDS` order behind whichever of the two leads.
  // A passkey row is present here only when its adapter said it is usable, so
  // there is no availability check to repeat.
  const passkey = others.filter((c) => c.kind === "passkey");
  const rest = others.filter((c) => c.kind !== "passkey");

  return passkey.length > 0 && preferPasskey()
    ? [...passkey, ...injected, ...rest]
    : [...injected, ...passkey, ...rest];
}

/// `preferred` to the front, announcement order preserved otherwise.
///
/// Reconnecting to the same wallet is the common case, and the stored rdns is the
/// only record of which one that was.
function preferredFirst(
  list: Eip6963ProviderDetail[],
  preferred: string | undefined,
): Eip6963ProviderDetail[] {
  if (!preferred) return list;
  const wanted = preferred.toLowerCase();
  const isPreferred = (d: Eip6963ProviderDetail) => d.info.rdns.toLowerCase() === wanted;
  return [...list.filter(isPreferred), ...list.filter((d) => !isPreferred(d))];
}
