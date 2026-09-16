// Which wallets the picker offers, and in what order.
//
// Pure selection policy, apart from the stored preferences it reads: the passkey
// or the remembered extension leads, and every other kind contributes a row when
// it says it is usable here.

import {
  type Eip6963ProviderDetail,
  preferredRdns,
  storedCredential,
  WALLET_KINDS,
  type WalletKind,
} from "@/features/wallet-kinds";

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
export function offerings(discovered: Eip6963ProviderDetail[]): WalletChoice[] {
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
  const others: WalletChoice[] = WALLET_KINDS.flatMap((a) =>
    a.kind !== "eip1193" && a.available()
      ? [{ kind: a.kind, id: a.kind, name: a.copy.label() }]
      : [],
  );

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
